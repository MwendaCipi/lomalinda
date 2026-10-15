"""Poll the church's Zoho mailbox and pull new letters into the desk.

``info@sdalomalinda.or.ke`` is read by **IMAP**, not by a webhook, because
there is no inbound provider on the domain's MX — Zoho keeps them — so the only
way to receive at the address the church already has is to read the mailbox
that receives it. That makes this a poller, and a poller has to be safe to run
on a schedule, twice, after a crash, or all at once.

Three properties make it so:

* **Idempotent** — a letter is keyed on its ``Message-ID``, so fetching the same
  one twice stores it once. A run interrupted halfway loses nothing; the next
  run simply finds the letters already there.
* **Cursor-based** — the folder's highest ingested UID is remembered, so a
  poll transfers only what is new. The cursor is tied to the folder's
  ``UIDVALIDITY``: if the server rebuilds the folder, UIDs mean something else
  and the desk starts over rather than skipping mail it has never seen.
* **Quiet** — one connection per run, closed on the way out, and nothing
  printed that would put a password in a cron log. Zoho allows 100 concurrent
  connections and caps fetch volume per window, so a five-minute poll using a
  single session stays well inside both.

The session is a narrow seam on purpose: ``ImapSession`` needs a config and a
client factory, and every test in this app passes a fake one — so the whole
poll, including its cursor and its idempotence, is exercised without a server.
"""

import imaplib
import re
import sys
from dataclasses import dataclass

from django.conf import settings
from django.core.mail import mail_admins
from django.utils import timezone

from . import services
from .models import MailboxCursor
from .parsing import parse

#: The singleton cursor's primary key. One mailbox per church, one row.
CURSOR_PK = 1

_UIDVALIDITY = re.compile(r'UIDVALIDITY\s+(\d+)')


class ImapSyncError(RuntimeError):
    """The mailbox could not be read — the reason is in the message."""


@dataclass(frozen=True)
class ImapConfig:
    """How to reach the mailbox. Password included; never printed or logged."""

    host: str
    port: int
    user: str
    password: str
    mailbox: str
    timeout: int

    @property
    def configured(self):
        return bool(self.host and self.user and self.password)


def current_config():
    """The configured IMAP connection, as settings declares it."""
    return ImapConfig(
        host=getattr(settings, 'IMAP_HOST', '') or '',
        port=int(getattr(settings, 'IMAP_PORT', 993) or 993),
        user=getattr(settings, 'IMAP_USER', '') or '',
        password=getattr(settings, 'IMAP_PASSWORD', '') or '',
        mailbox=getattr(settings, 'IMAP_MAILBOX', 'INBOX') or 'INBOX',
        timeout=int(getattr(settings, 'IMAP_TIMEOUT', 30) or 30),
    )


class ImapSession:
    """One connection to the mailbox: which letters are new, and what they say.

    The three operations the sync needs, and nothing more. A test supplies a
    different ``client_factory`` and the poll runs identically against it.
    """

    def __init__(self, config=None, client_factory=None):
        self.config = config or current_config()
        self._factory = client_factory
        self.client = None
        self._uid_validity = 0

    # -- connection ---------------------------------------------------------
    def __enter__(self):
        if not self.config.configured:
            raise ImapSyncError(
                'The mailbox is not configured. Set IMAP_HOST, IMAP_USER and '
                'IMAP_PASSWORD (and enable IMAP in Zoho Mail → Settings → Mail '
                'Accounts → IMAP).'
            )
        factory = self._factory or (lambda cfg: imaplib.IMAP4_SSL(
            cfg.host, cfg.port, timeout=cfg.timeout
        ))
        try:
            self.client = factory(self.config)
            self.client.login(self.config.user, self.config.password)
        except imaplib.IMAP4.error as error:
            self.client = None
            raise ImapSyncError(
                f'Zoho refused the IMAP login for {self.config.user}: {error}. '
                'Check that IMAP Access is switched on for the mailbox and that '
                'the password is an app password if two-factor sign-in is on.'
            ) from error
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        client, self.client = self.client, None
        if client is None:
            return False
        try:
            client.logout()
        except Exception:  # noqa: BLE001 - logging out must never mask the real error
            pass
        return False

    # -- operations ---------------------------------------------------------
    def select(self):
        """Open the mailbox read-only and return its ``UIDVALIDITY``.

        Read-only on purpose: the desk records what arrived; it does not move,
        delete or flag anything in the church's own mailbox. An elder who wants
        a letter dealt with replies, and the archive state lives here.
        """
        try:
            status, data = self.client.select(self.config.mailbox, readonly=True)
        except imaplib.IMAP4.error as error:
            raise ImapSyncError(f'Could not open {self.config.mailbox!r}: {error}') from error
        if status != 'OK':
            raise ImapSyncError(f'Could not open {self.config.mailbox!r}: {data!r}')
        text = ''
        if data and isinstance(data[0], (bytes, bytearray)):
            text = bytes(data[0]).decode('utf-8', 'replace')
        match = _UIDVALIDITY.search(text)
        if match:
            self._uid_validity = int(match.group(1))
        else:
            self._uid_validity = self._read_response_uidvalidity()
        return self._uid_validity

    def _read_response_uidvalidity(self):
        """Fallback for servers that leave ``UIDVALIDITY`` out of the SELECT reply."""
        try:
            _, data = self.client.response('UIDVALIDITY')
        except Exception:  # noqa: BLE001 - absence of a value is not an error
            return 0
        if data and data[0] is not None:
            try:
                return int(data[0])
            except (TypeError, ValueError):
                return 0
        return 0

    @property
    def uid_validity(self):
        return self._uid_validity

    def uids_after(self, last_uid):
        """Every UID in the mailbox newer than the cursor, ascending."""
        first = max(int(last_uid or 0) + 1, 1)
        try:
            status, data = self.client.uid('SEARCH', None, f'UID {first}:*')
        except imaplib.IMAP4.error as error:
            raise ImapSyncError(f'Could not list new mail: {error}') from error
        if status != 'OK':
            raise ImapSyncError(f'Could not list new mail: {data!r}')
        if not data or not data[0]:
            return []
        tokens = bytes(data[0]).split() if isinstance(data[0], (bytes, bytearray)) else []
        uids = []
        for token in tokens:
            try:
                uids.append(int(token))
            except (TypeError, ValueError):
                continue
        return sorted(uids)

    def fetch_rfc822(self, uid):
        """The raw bytes of one letter, or ``None`` if it vanished mid-poll."""
        try:
            status, data = self.client.uid('FETCH', str(uid), '(RFC822)')
        except imaplib.IMAP4.error:
            return None
        if status != 'OK' or not data:
            return None
        for item in data:
            if isinstance(item, tuple) and len(item) > 1 and isinstance(item[1], (bytes, bytearray)):
                return bytes(item[1])
        return None


def sync(*, session_factory=ImapSession, notify=False):
    """Bring the desk up to date with the mailbox. Returns a summary dict.

    Safe to run from cron at any interval: everything is keyed on message id,
    so overlapping or repeated runs converge on the same rows.
    """
    config = current_config()
    if not config.configured:
        return {'ok': False, 'reason': 'not-configured', 'fetched': 0, 'stored': 0}

    summary = {'ok': True, 'fetched': 0, 'stored': 0, 'duplicates': 0, 'failed': 0, 'last_uid': 0}
    try:
        with session_factory(config) as session:
            uid_validity = session.select()
            cursor, _ = MailboxCursor.objects.get_or_create(
                pk=CURSOR_PK,
                defaults={'uid_validity': uid_validity, 'last_uid': 0},
            )
            if cursor.uid_validity and uid_validity and cursor.uid_validity != uid_validity:
                # The folder was rebuilt: old UIDs name different letters now.
                cursor.last_uid = 0
            cursor.uid_validity = uid_validity or cursor.uid_validity
            cursor.save(update_fields=['uid_validity', 'last_uid'])

            uids = session.uids_after(cursor.last_uid)
            for uid in uids:
                summary['fetched'] += 1
                raw = session.fetch_rfc822(uid)
                if raw is None:
                    summary['failed'] += 1
                    summary['last_uid'] = max(summary['last_uid'], uid)
                    continue
                try:
                    parsed = parse(raw)
                    _message, created = services.ingest(parsed, uid=uid)
                except Exception:  # noqa: BLE001 - one bad letter must not stop the poll
                    summary['failed'] += 1
                    summary['last_uid'] = max(summary['last_uid'], uid)
                    _log_failure(uid)
                    continue
                summary['stored' if created else 'duplicates'] += 1
                summary['last_uid'] = max(summary['last_uid'], uid)

            if summary['last_uid'] > cursor.last_uid:
                cursor.last_uid = summary['last_uid']
                cursor.save(update_fields=['last_uid'])
    except ImapSyncError as error:
        summary.update(ok=False, reason=str(error))
    except Exception as error:  # noqa: BLE001 - a cron run must report, never raise
        summary.update(ok=False, reason=str(error))
        _log_failure(f'poll: {error}')

    if not summary['ok'] and notify:
        mail_admins(
            'The Emails desk could not reach the mailbox',
            f"Reason: {summary.get('reason', 'unknown')}\nRun at {timezone.now().isoformat()}",
            fail_silently=True,
        )
    return summary


def _log_failure(what):
    """Send one line to stderr so a cron log explains itself without noise."""
    print(f'[maildesk] skipped: {what}', file=sys.stderr)
