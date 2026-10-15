"""Turn one RFC 5322 blob into the fields a desk keeps, and thread it.

Two jobs live here, and both must be right before anything is stored:

**Reading the letter.** A message is bytes with headers, a tree of MIME parts
and often no plain-text version at all. The tree is walked for the text parts
(both flavours, so the desk can render HTML and still have text to search) and
for anything the sender attached; addresses and dates come back in a form a
person recognises rather than an encoded-word blob.

**Threading it.** Threading is decided by ``Message-ID`` and the ``In-Reply-To``
/ ``References`` chain — never by subject. Subjects drift ("Re:", "RE:", a
forwarder rewriting them), and two unrelated letters can share one; the
reference chain is the only thing a mail client is required to keep intact.
Ingestion asks *"have I seen this Message-ID?"* first, then *"does this reply
to anything I have?"*, and only then creates a new thread — which is what makes
re-fetching the same letter safe.

The functions take and return plain dicts on purpose: the parsing can be
exercised without a database, a Django request or a live IMAP server.
"""

import email
import html as html_lib
import re
import uuid
from email.header import decode_header, make_header
from email.utils import parseaddr, parsedate_to_datetime

from django.utils import timezone

#: How long two unrelated letters with the same subject may still be the same
#: conversation. Only consulted when a letter has no reference chain to follow —
#: replies to a thread that started before this desk existed still group.
SUBJECT_FALLBACK_WINDOW_DAYS = 14

_ANGLE_FULL = re.compile(r'<[^<>]+>')
_WHITESPACE = re.compile(r'\s+')


def decode_mime_header(value):
    """A header as a person reads it — encoded words (``=?utf-8?B?...?=``) decoded.

    Malformed encodings are common in the wild; a letter whose subject cannot
    be decoded still has to be shown, so this degrades to the raw text rather
    than raising over one bad header.
    """
    if not value:
        return ''
    if isinstance(value, email.header.Header):  # pragma: no cover - defensive
        value = str(value)
    try:
        return str(make_header(decode_header(str(value))))
    except Exception:  # noqa: BLE001 - an unreadable header must not lose the letter
        return str(value)


def _clean(value):
    """Collapse runs of whitespace so a header on two folded lines reads as one."""
    return _WHITESPACE.sub(' ', (value or '')).strip()


def split_address(value):
    """``"Jane Doe <jane@example.com>"`` → ``("Jane Doe", "jane@example.com")``."""
    name, address = parseaddr(value or '')
    return decode_mime_header(name).strip(), (address or '').strip()


def _sent_at(message):
    """When the letter was written, always timezone-aware.

    A message with a missing or unparseable Date still gets a timestamp —
    now — because a letter the desk cannot order is a letter it cannot show.
    """
    raw = message.get('Date')
    if raw:
        try:
            when = parsedate_to_datetime(raw)
            if when is not None:
                if timezone.is_naive(when):
                    when = timezone.make_aware(when, timezone.get_current_timezone())
                return when
        except (TypeError, ValueError, IndexError):
            pass
    return timezone.now()


def _part_text(part):
    """Decode one text part, honouring its declared charset."""
    try:
        payload = part.get_payload(decode=True)
    except Exception:  # noqa: BLE001 - a broken part yields empty text, not a lost message
        payload = None
    if payload is None:
        # Already-decoded payload (a message assembled rather than parsed).
        raw = part.get_payload()
        return raw if isinstance(raw, str) else ''
    charset = part.get_content_charset() or 'utf-8'
    try:
        return payload.decode(charset, errors='replace')
    except LookupError:
        return payload.decode('utf-8', errors='replace')


def _is_attachment(part):
    filename = part.get_filename()
    disposition = str(part.get('Content-Disposition') or '').lower()
    return bool(filename) or 'attachment' in disposition


_TAG = re.compile(r'<[^>]+>')
_BLOCK_BREAK = re.compile(r'(?i)</?(p|div|br|tr|li|h[1-6]|blockquote|table)\b[^>]*>')
_SCRIPT = re.compile(r'(?is)<(script|style)\b[^>]*>.*?</\1>')


def html_to_text(html):
    """Readable text out of an HTML body, with no markup left to render.

    Many senders write *only* HTML, so a desk that rendered text would show a
    blank letter and a desk that rendered the HTML would be executing whatever
    a stranger put in it. Deriving the text at parse time answers both: the
    letter always has something to read, search and show, and nothing the
    sender wrote is ever interpreted.
    """
    if not html:
        return ''
    text = _SCRIPT.sub(' ', html)
    text = _BLOCK_BREAK.sub('\n', text)
    text = _TAG.sub(' ', text)
    text = html_lib.unescape(text)
    lines = [_WHITESPACE.sub(' ', line).strip() for line in text.splitlines()]
    return '\n'.join(line for line in lines if line)


def _bodies(message):
    """The plain and HTML bodies of a letter, whichever it happens to carry."""
    text_parts, html_parts = [], []
    if message.is_multipart():
        parts = [part for part in message.walk() if not part.is_multipart()]
    else:
        parts = [message]
    for part in parts:
        if _is_attachment(part):
            continue
        content_type = part.get_content_type()
        if content_type == 'text/plain':
            text_parts.append(_part_text(part))
        elif content_type == 'text/html':
            html_parts.append(_part_text(part))
    return '\n'.join(text_parts).strip(), '\n'.join(html_parts).strip()


def extract_attachments(message):
    """Everything the sender attached, as raw bytes ready for storage."""
    found = []
    if not message.is_multipart():
        return found
    for part in message.walk():
        if part.is_multipart() or not _is_attachment(part):
            continue
        try:
            payload = part.get_payload(decode=True)
        except Exception:  # noqa: BLE001 - skip what cannot be decoded rather than fail
            payload = None
        if not payload:
            continue
        filename = decode_mime_header(part.get_filename() or '').strip() or 'attachment'
        found.append({
            'filename': filename,
            'content_type': part.get_content_type() or 'application/octet-stream',
            'content': payload,
            'size': len(payload),
        })
    return found


def references_of(parsed):
    """Every parent ``Message-ID`` this letter claims, in chain order.

    The ``References`` header is the full ancestry; ``In-Reply-To`` is the
    immediate parent. Both are consulted because senders get this wrong more
    often than they get it right.

    Bracketed forms are kept **bracketed**, because that is how a ``Message-ID``
    is stored: matching ``<id@host>`` against ``id@host`` would silently send
    every reply into a thread of its own. ``services._thread_for`` looks up
    both spellings as well, so a sender that drops the brackets is matched too.
    """
    tokens = []
    for value in (parsed.get('in_reply_to') or '', parsed.get('references') or ''):
        angled = _ANGLE_FULL.findall(value)
        if angled:
            tokens.extend(token.strip() for token in angled)
        else:
            tokens.extend(token for token in _WHITESPACE.split(value) if token)
    seen, ordered = set(), []
    for token in tokens:
        if token and token not in seen:
            seen.add(token)
            ordered.append(token)
    return ordered


def subject_key(subject):
    """A subject reduced to its conversational core: case- and ``Re:``-insensitive."""
    text = _clean(decode_mime_header(subject)).lower()
    while True:
        stripped = re.sub(r'^\s*(?:re|fwd?|aw|sv)\s*:\s*', '', text)
        if stripped == text:
            break
        text = stripped
    return text


def generate_message_id(domain='sdalomalinda.or.ke'):
    """A ``Message-ID`` for a letter this desk writes.

    Generated here rather than left to the MTA so that when the letter comes
    back down the IMAP poller it carries exactly the id under which it was
    stored — the desk recognises its own mail instead of duplicating it.
    """
    return f'<{uuid.uuid4().hex}@{domain}>'


def parse(raw_bytes):
    """One raw message → the fields the desk stores (a plain dict).

    ``attachments`` carry bytes and are written to storage by the caller;
    everything else is a string or a datetime. Nothing here touches a database,
    so a whole mailbox can be parsed in a test with no server at all.
    """
    message = email.message_from_bytes(raw_bytes)
    text_body, html_body = _bodies(message)
    if not text_body and html_body:
        text_body = html_to_text(html_body)
    from_name, from_email = split_address(message.get('From'))
    parsed = {
        'message_id': _clean(message.get('Message-ID')) or generate_message_id(),
        'in_reply_to': _clean(message.get('In-Reply-To')),
        'references': _clean(message.get('References')),
        'subject': decode_mime_header(message.get('Subject')).strip(),
        'from_name': from_name,
        'from_email': from_email,
        'to_header': decode_mime_header(message.get('To')).strip(),
        'cc_header': decode_mime_header(message.get('Cc')).strip(),
        'body_text': text_body,
        'body_html': html_body,
        'date': _sent_at(message),
        'attachments': extract_attachments(message),
        'size': len(raw_bytes),
    }
    parsed['reference_tokens'] = references_of(parsed)
    return parsed
