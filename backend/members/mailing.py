"""Which address each kind of mail leaves as, and the connection that carries it.

A caller never names a mailbox. It says what the letter *is* — a receipt, a
verification code, a reply to a person — and this module answers which address
speaks for that, so the church's addresses can be re-pointed in one place
(config/mail_settings.py, via the environment) without hunting the callers.

Two things come back, and they travel together: the ``from_email`` a send
should use, and the connection that should carry it. The connection is ``None``
whenever the message speaks through the main church mailbox, which is Django's
own default connection — and that is the common case, not an edge one.
"""

from django.conf import settings
from django.core.mail import get_connection

#: The purposes a caller may name. Re-exported so call sites import their
#: purpose from the module they are already calling rather than reaching into
#: ``config`` from deep inside the app.
from config.mail_settings import (  # noqa: F401  (re-exported on purpose)
    PURPOSE_ANNOUNCEMENT,
    PURPOSE_INFO,
    PURPOSE_TREASURY,
    PURPOSE_VERIFY,
)

#: The purpose human correspondence sends as: a person reads the reply, so it
#: leaves through the church's monitored mailbox and lands in the desk that
#: reads it.
HUMAN = PURPOSE_INFO
#: Money. Receipts, giving acknowledgements and pledge reminders.
MONEY = PURPOSE_TREASURY
#: Joining and identity: invitations, verify-your-account codes, resets.
IDENTITY = PURPOSE_VERIFY


def resolved(purpose):
    """The resolved sender settings for one purpose, or ``None`` if unknown.

    Unknown rather than an exception: a mistyped purpose should degrade to the
    church's main address and still deliver the letter, never fail the request
    that was trying to send it.
    """
    return (getattr(settings, 'MAIL_SENDERS', None) or {}).get(purpose)


def sender_for(purpose):
    """The From address this kind of mail leaves as."""
    entry = resolved(purpose)
    if entry:
        return entry['from_email']
    return settings.DEFAULT_FROM_EMAIL


def connection_for(purpose):
    """The SMTP connection that carries this purpose's mail.

    ``None`` means Django's default connection, which is the main church
    mailbox. That is what human correspondence wants, and also what a machine
    purpose falls back to when no relay is configured — so the split can be
    written ahead of the mailboxes existing, and setting nothing at all leaves
    every send exactly as it was.
    """
    entry = resolved(purpose)
    if not entry or not entry.get('via_relay'):
        return None
    return get_connection(
        host=entry['host'],
        port=entry['port'],
        username=entry['user'],
        password=entry['password'],
        use_tls=entry['use_tls'],
        timeout=getattr(settings, 'EMAIL_TIMEOUT', 10),
    )


def purpose_for_sender(address):
    """Which purpose sends as ``address``, or ``None`` when none does.

    The reverse of ``sender_for``, for the screens that show an officer what
    the church sends as where — and for the tests that assert the split holds.
    A match is made on the address alone, so a display name may be changed
    without breaking the lookup.
    """
    wanted = _address_only(address)
    if not wanted:
        return None
    for purpose in (HUMAN, MONEY, IDENTITY, PURPOSE_ANNOUNCEMENT):
        if _address_only(sender_for(purpose)) == wanted:
            return purpose
    return None


def _address_only(value):
    """The bare ``local@domain`` inside a ``Name <local@domain>`` value."""
    text = (value or '').strip()
    if '<' in text and '>' in text:
        text = text[text.index('<') + 1:text.index('>')].strip()
    return text.lower()
