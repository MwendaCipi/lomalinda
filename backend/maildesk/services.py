"""Where a letter goes once it has been read, and how the desk writes one back.

Three responsibilities, in the order they happen:

**Ingest** a parsed letter exactly once — keyed on its ``Message-ID`` — after
finding the thread it belongs to. Threading follows the reference chain, then
falls back to subject-and-counterparty within a fortnight for conversations
that began before this desk existed.

**Write** a letter from the desk as ``info@sdalomalinda.or.ke``, carrying the
reply headers that let the conversation continue to thread — both in the mail
the recipient receives and in the record kept here.

**Read** the thread list: which threads, what each shows in the list, and how
many of them are unread *for this officer*.

Permission lives here too, beside the query it guards, so every entry point
(view, command, socket) answers the same question the same way.
"""

import html
import re
from collections import Counter
from datetime import timedelta

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from chat.services import member_roles

from members.mailing import HUMAN, connection_for, sender_for

from .models import MailAttachment, MailReadState, MailMessage, MailThread
from .parsing import (
    SUBJECT_FALLBACK_WINDOW_DAYS,
    generate_message_id,
    split_address,
    subject_key,
)

#: Who may open the desk. The strip offers it to elders, clerks and the
#: administrator; a letter may carry money, membership or pastoral detail.
MAILBOX_ROLES = {'elder', 'clerk', 'admin'}

#: The longest a single list preview may be — one line, not a paragraph.
PREVIEW_LENGTH = 200

_TAG = re.compile(r'<[^>]+>')
_WS = re.compile(r'\s+')


def can_use_mailbox(user):
    """May this account read and write the church's mailbox?"""
    if user is None or not getattr(user, 'is_authenticated', False):
        return False
    if getattr(user, 'is_superuser', False) or getattr(user, 'is_staff', False):
        return True
    return bool(member_roles(user).intersection(MAILBOX_ROLES))


# ── Reading ──────────────────────────────────────────────────────────────────

def preview_of(body_text, body_html, limit=PREVIEW_LENGTH):
    """One line for the thread list, from whichever body the letter has."""
    text = body_text or ''
    if not text.strip() and body_html:
        text = html.unescape(_TAG.sub(' ', body_html))
    text = _WS.sub(' ', text).strip()
    return text[:limit]


def unread_counts(user, thread_ids):
    """Unread messages per thread, as *this* account sees them.

    Two queries and a count in Python rather than a negated join: a message no
    one has read yet has no read row at all, and a negated condition over an
    outer join drops the very rows it is meant to catch. The desk's thread lists
    are paginated, so the rows touched stay small and the answer stays correct.
    """
    if not thread_ids:
        return {}
    read_ids = set(
        MailReadState.objects.filter(user=user, message__thread_id__in=thread_ids)
        .values_list('message_id', flat=True)
    )
    counts = Counter(
        thread_id
        for thread_id, message_id in MailMessage.objects.filter(
            thread_id__in=thread_ids
        ).values_list('thread_id', 'id')
        if message_id not in read_ids
    )
    return dict(counts)


def list_threads(user, *, folder='inbox', search='', limit=50, offset=0):
    """The thread list for the officer, newest first.

    ``folder`` is the desk's own vocabulary rather than IMAP's: ``inbox`` is
    everything not archived, ``starred`` and ``archived`` are the two flags, and
    ``all`` shows everything. Unread counts are attached per officer.
    """
    threads = MailThread.objects.all()
    if folder == 'archived':
        threads = threads.filter(archived=True)
    elif folder == 'starred':
        threads = threads.filter(starred=True, archived=False)
    else:
        threads = threads.filter(archived=False)

    if search:
        needle = search.strip()
        threads = threads.filter(
            Q(subject__icontains=needle)
            | Q(correspondent_email__icontains=needle)
            | Q(correspondent_name__icontains=needle)
            | Q(messages__subject__icontains=needle)
            | Q(messages__body_text__icontains=needle)
        ).distinct()

    total = threads.count()
    page = list(threads[offset:offset + limit])
    counts = unread_counts(user, [thread.pk for thread in page])
    for thread in page:
        thread.unread_count = counts.get(thread.pk, 0)
    return page, total, counts


def mark_read(user, thread):
    """Mark every letter in one thread as read for this officer.

    Idempotent: re-reading a thread inserts nothing twice, so the desk can call
    it on every open without consequence.
    """
    message_ids = thread.messages.values_list('id', flat=True)
    existing = set(
        MailReadState.objects.filter(user=user, message_id__in=message_ids)
        .values_list('message_id', flat=True)
    )
    now = timezone.now()
    fresh = [
        MailReadState(message_id=message_id, user=user, read_at=now)
        for message_id in message_ids
        if message_id not in existing
    ]
    if fresh:
        MailReadState.objects.bulk_create(fresh, batch_size=500)
    return len(fresh)


def mark_unread(user, thread):
    """Give this officer back the letters in a thread — nobody else's marks move."""
    MailReadState.objects.filter(user=user, message__thread=thread).delete()


# ── Ingesting ────────────────────────────────────────────────────────────────

def _counterparty(parsed, direction):
    """The other end of the conversation: who wrote it, or who it was sent to."""
    if direction == MailMessage.DIRECTION_OUTBOUND:
        recipient = (parsed.get('to_header') or '').split(',')[0]
        return split_address(recipient)
    return parsed.get('from_name', ''), parsed.get('from_email', '')


def _thread_for(parsed, direction):
    """The thread this letter belongs to, or ``None`` for a new conversation.

    Reference chain first — an exact match on any ancestor ``Message-ID``,
    looked up in both spellings (``<id@host>`` and ``id@host``) because a
    sender that drops the brackets would otherwise appear to have no parents.

    Subject second, and only inside the fallback window, compared *as a
    subject* rather than as text: a reply reads ``Re: Baptism service`` while
    the thread it belongs to is ``Baptism service``, and matching the raw
    strings would strand every such reply in a thread of its own.
    """
    variants = set()
    for token in (parsed.get('reference_tokens') or []):
        bare = str(token).strip().strip('<>').strip()
        if not bare:
            continue
        variants.update({bare, f'<{bare}>'})
    if variants:
        parent = (
            MailMessage.objects.filter(message_id__in=variants)
            .select_related('thread')
            .order_by('-sent_at')
            .first()
        )
        if parent is not None:
            return parent.thread

    key = subject_key(parsed.get('subject'))
    if not key:
        return None

    name, address = _counterparty(parsed, direction)
    cutoff = parsed['date'] - timedelta(days=SUBJECT_FALLBACK_WINDOW_DAYS)
    del name  # only the address narrows the candidates; the name is cosmetic
    candidates = MailThread.objects.filter(last_message_at__gte=cutoff)
    if address:
        candidates = candidates.filter(correspondent_email__iexact=address)
    for thread in candidates.order_by('-last_message_at')[:25]:
        if subject_key(thread.subject) == key:
            return thread
    return None


def _store_attachments(message, attachments):
    """Write each attachment into the media store, one row apiece."""
    rows = []
    for attachment in attachments:
        rows.append(
            MailAttachment(
                message=message,
                filename=attachment['filename'][:255],
                content_type=attachment['content_type'][:100],
                size=attachment['size'],
                file=_content_file(attachment),
            )
        )
    if rows:
        MailAttachment.objects.bulk_create(rows)


def _content_file(attachment):
    """A stored file for one attachment's bytes, under the media root."""
    from django.core.files.base import ContentFile

    safe = attachment['filename'].replace('/', '_').replace('\\', '_')
    return ContentFile(attachment['content'], name=safe)


def ingest(parsed, *, uid=None, direction=MailMessage.DIRECTION_INBOUND):
    """Store one letter, exactly once, in the thread it belongs to.

    Returns ``(message, created)``. The ``Message-ID`` check runs first and
    inside the transaction, so two pollers racing on the same letter — or a
    poller re-running after a crash — leave one row behind, not two.
    """
    message_id = parsed['message_id']
    with transaction.atomic():
        existing = MailMessage.objects.filter(message_id=message_id).first()
        if existing is not None:
            return existing, False

        thread = _thread_for(parsed, direction)
        name, address = _counterparty(parsed, direction)

        if thread is None:
            thread = MailThread.objects.create(
                subject=parsed.get('subject') or '',
                correspondent_name=name,
                correspondent_email=address,
                last_message_at=parsed['date'],
                preview=preview_of(parsed.get('body_text'), parsed.get('body_html')),
                message_count=1,
            )
        elif not thread.correspondent_email and address:
            thread.correspondent_name = name
            thread.correspondent_email = address

        message = MailMessage.objects.create(
            thread=thread,
            message_id=message_id,
            in_reply_to=parsed.get('in_reply_to') or '',
            references=parsed.get('references') or '',
            direction=direction,
            from_name=parsed.get('from_name') or '',
            from_email=parsed.get('from_email') or '',
            to_header=parsed.get('to_header') or '',
            cc_header=parsed.get('cc_header') or '',
            subject=parsed.get('subject') or '',
            body_text=parsed.get('body_text') or '',
            body_html=parsed.get('body_html') or '',
            sent_at=parsed['date'],
            uid=uid,
            size=parsed.get('size') or 0,
        )
        _store_attachments(message, parsed.get('attachments') or [])

        thread.refresh_from_db(fields=['message_count'])
        thread.message_count = thread.messages.count()
        if parsed['date'] >= thread.last_message_at:
            thread.last_message_at = parsed['date']
            thread.preview = preview_of(parsed.get('body_text'), parsed.get('body_html'))
        if not thread.subject and parsed.get('subject'):
            thread.subject = parsed['subject']
        thread.save(update_fields=['message_count', 'last_message_at', 'preview', 'subject'])

    return message, True


def _references_for_reply(parent):
    """The ``References`` a reply to ``parent`` must carry: its chain, plus it."""
    chain = []
    for value in (parent.references or '', parent.in_reply_to or '', parent.message_id):
        for token in value.split():
            if token and token not in chain:
                chain.append(token)
    if parent.message_id not in chain:
        chain.append(parent.message_id)
    return ' '.join(chain)


# ── Writing ──────────────────────────────────────────────────────────────────

def send_letter(*, to, subject, body_text, body_html='', cc=None, parent=None, thread=None):
    """Send one letter from the desk as ``info@``, and keep a copy of it.

    ``parent`` makes it a reply: the ``In-Reply-To`` and ``References`` headers
    are set on the outgoing mail *and* the record, so the conversation threads
    on the recipient's side and here — and when the poller later meets this
    letter in the Sent folder it matches the row already written instead of
    filing a second copy.
    """
    recipients = [address.strip() for address in to if address and address.strip()]
    if not recipients:
        raise ValueError('A letter needs somewhere to go.')

    message_id = generate_message_id()
    headers = {'Message-ID': message_id}
    if parent is not None:
        headers['In-Reply-To'] = parent.message_id
        headers['References'] = _references_for_reply(parent)

    connection = connection_for(HUMAN)
    outgoing = EmailMultiAlternatives(
        subject=subject or '',
        body=body_text or '',
        from_email=sender_for(HUMAN),
        to=recipients,
        cc=[address.strip() for address in (cc or []) if address and address.strip()] or None,
        connection=connection,
        headers=headers,
    )
    if body_html:
        outgoing.attach_alternative(body_html, 'text/html')
    outgoing.send(fail_silently=False)

    parsed = {
        'message_id': message_id,
        'in_reply_to': headers.get('In-Reply-To', ''),
        'references': headers.get('References', ''),
        'subject': subject or '',
        'from_name': _desk_name(),
        'from_email': sender_for(HUMAN),
        'to_header': ', '.join(recipients),
        'cc_header': ', '.join(address for address in (outgoing.cc or [])),
        'body_text': body_text or '',
        'body_html': body_html or '',
        'date': timezone.now(),
        'attachments': [],
        'size': len(body_text or ''),
        'reference_tokens': [headers['In-Reply-To']] if parent else [],
    }

    if thread is None and parent is not None:
        thread = parent.thread

    with transaction.atomic():
        if thread is None:
            name, address = split_address(recipients[0])
            thread = MailThread.objects.create(
                subject=parsed['subject'],
                correspondent_name=name,
                correspondent_email=address,
                last_message_at=parsed['date'],
                preview=preview_of(parsed['body_text'], parsed['body_html']),
                message_count=1,
            )
        message = MailMessage.objects.create(
            thread=thread,
            message_id=message_id,
            in_reply_to=parsed['in_reply_to'],
            references=parsed['references'],
            direction=MailMessage.DIRECTION_OUTBOUND,
            from_name=parsed['from_name'],
            from_email=parsed['from_email'],
            to_header=parsed['to_header'],
            cc_header=parsed['cc_header'],
            subject=parsed['subject'],
            body_text=parsed['body_text'],
            body_html=parsed['body_html'],
            sent_at=parsed['date'],
            uid=None,
            size=parsed['size'],
        )
        thread.message_count = thread.messages.count()
        if parsed['date'] >= thread.last_message_at:
            thread.last_message_at = parsed['date']
            thread.preview = preview_of(parsed['body_text'], parsed['body_html'])
        if not thread.subject and parsed['subject']:
            thread.subject = parsed['subject']
        thread.save(update_fields=['message_count', 'last_message_at', 'preview', 'subject'])

    return message


def _desk_name():
    """The name the church signs its own letters with."""
    return 'SDA Church Loma Linda Meru'


def connections_report():
    """What the desk would send and receive with — for the console and tests.

    Passwords are never included: the report is there to show which host and
    which address, not to print credentials anywhere.
    """
    mail_senders = getattr(settings, 'MAIL_SENDERS', None) or {}
    info = mail_senders.get(HUMAN) or {}
    return {
        'send_from': info.get('from_email') or settings.DEFAULT_FROM_EMAIL,
        'send_host': info.get('host') or settings.EMAIL_HOST,
        'imap_host': getattr(settings, 'IMAP_HOST', ''),
        'imap_mailbox': getattr(settings, 'IMAP_MAILBOX', 'INBOX'),
        'configured': bool(
            (info.get('host') or settings.EMAIL_HOST)
            and getattr(settings, 'IMAP_HOST', '')
            and getattr(settings, 'IMAP_USER', '')
            and getattr(settings, 'IMAP_PASSWORD', '')
        ),
    }
