"""The Emails desk's API: read the shared mailbox, write back, keep it fresh.

Every endpoint answers to one permission — elders, clerks and the
administrator — and the check lives in one place (``services.can_use_mailbox``)
so a URL, a management command and a socket cannot disagree about who may read
the church's letters.

The views stay thin on purpose: they name the folder or the thread, hand the
work to ``services``, and serialise the answer. Two things they do add are
fetched in bulk rather than per row — the officer's own read marks and the
per-thread attachment counts — because a thread list otherwise costs one query
per row it shows.
"""

from django.db.models import Count, Prefetch
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import imap_sync, services
from .models import MailReadState, MailMessage, MailThread
from .serializers import MailThreadDetailSerializer, MailThreadSerializer

#: The desk's folders, as the console names them — not IMAP's, which the officer
#: never sees.
ALLOWED_FOLDERS = ('inbox', 'starred', 'archived', 'all')

#: A thread list page. Generous for a phone, small enough to stay one screen.
DEFAULT_LIMIT = 50
MAX_LIMIT = 100

#: The longest a letter may be — enough for any reply anybody types here.
MAX_BODY_LENGTH = 50_000


class IsMailboxOfficer(BasePermission):
    """Elders, clerks and the administrator. Everyone else, no matter the URL."""

    message = 'The Emails desk is for elders, clerks and the administrator.'

    def has_permission(self, request, view):
        return services.can_use_mailbox(request.user)


class MailboxSummaryView(APIView):
    """What the rail badge needs: how many letters are waiting, and whether the
    mailbox is reachable at all."""

    permission_classes = [IsAuthenticated, IsMailboxOfficer]

    def get(self, request):
        inbox = MailThread.objects.filter(archived=False)
        thread_ids = list(inbox.values_list('id', flat=True))
        counts = services.unread_counts(request.user, thread_ids)
        return Response({
            'unread': sum(counts.values()),
            'unread_threads': sum(1 for value in counts.values() if value),
            'threads': len(thread_ids),
            'transport': services.connections_report(),
        })


class MailThreadListView(APIView):
    """The thread list, newest first, filtered by folder or search."""

    permission_classes = [IsAuthenticated, IsMailboxOfficer]

    def get(self, request):
        folder = (request.query_params.get('folder') or 'inbox').strip().lower()
        if folder not in ALLOWED_FOLDERS:
            return Response(
                {'detail': f'Unknown folder {folder!r}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        limit, offset = _paging(request)
        threads, total, counts = services.list_threads(
            request.user,
            folder=folder,
            search=(request.query_params.get('q') or '').strip(),
            limit=limit,
            offset=offset,
        )
        ids = [thread.pk for thread in threads]
        attach_counts = _attachment_counts(ids)
        for thread in threads:
            thread.attachment_counts = attach_counts
        data = MailThreadSerializer(threads, many=True).data
        return Response({
            'threads': data,
            'total': total,
            'unread': sum(counts.values()),
            'folder': folder,
        })


class MailThreadDetailView(APIView):
    """One conversation: every letter in it, with this officer's read marks."""

    permission_classes = [IsAuthenticated, IsMailboxOfficer]

    def get(self, request, pk):
        thread = get_object_or_404(MailThread, pk=pk)
        thread.messages_for_serialisation = thread.messages.prefetch_related(
            Prefetch('attachments'),
            Prefetch(
                'read_states',
                queryset=MailReadState.objects.filter(user=request.user),
                to_attr='read_for_me',
            ),
        ).order_by('sent_at', 'id')
        thread.attachment_counts = _attachment_counts([pk])
        thread.unread_count = services.unread_counts(request.user, [pk]).get(pk, 0)
        return Response(
            MailThreadDetailSerializer(
                thread, context={'request': request, 'user': request.user}
            ).data
        )


class MailThreadStateView(APIView):
    """Read, star or archive a thread — the officer's own view of it.

    All three arrive on one endpoint because they are one gesture: open a
    letter, decide it is handled, come back to it. Read state is per officer;
    starring and archiving are the desk's, shared by everyone who uses it.
    """

    permission_classes = [IsAuthenticated, IsMailboxOfficer]

    def post(self, request, pk):
        thread = get_object_or_404(MailThread, pk=pk)
        fields = []
        if 'read' in request.data:
            if request.data['read']:
                services.mark_read(request.user, thread)
            else:
                services.mark_unread(request.user, thread)
            fields.append('read')
        for name in ('starred', 'archived'):
            if name in request.data:
                setattr(thread, name, bool(request.data[name]))
                fields.append(name)
        if not fields:
            return Response(
                {'detail': 'Say whether it is read, starred or archived.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        saved = [name for name in ('starred', 'archived') if name in fields]
        if saved:
            thread.save(update_fields=saved)
        payload = MailThreadSerializer(thread).data
        payload['unread_count'] = services.unread_counts(request.user, [thread.pk]).get(thread.pk, 0)
        return Response(payload)


class MailThreadReplyView(APIView):
    """Write back on one conversation, as ``info@sdalomalinda.or.ke``."""

    permission_classes = [IsAuthenticated, IsMailboxOfficer]

    def post(self, request, pk):
        thread = get_object_or_404(MailThread, pk=pk)
        body = (request.data.get('body') or '').strip()
        if not body:
            return Response(
                {'detail': 'Write a reply first.'}, status=status.HTTP_400_BAD_REQUEST
            )
        if len(body) > MAX_BODY_LENGTH:
            return Response(
                {'detail': 'That reply is too long.'}, status=status.HTTP_400_BAD_REQUEST
            )
        if not thread.correspondent_email:
            return Response(
                {'detail': 'There is no address to reply to on this thread.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        parent = thread.messages.order_by('-sent_at', '-id').first()
        subject = (request.data.get('subject') or '').strip() or _reply_subject(thread)
        try:
            message = services.send_letter(
                to=[thread.correspondent_email],
                subject=subject,
                body_text=body,
                parent=parent,
                thread=thread,
            )
        except Exception as error:  # noqa: BLE001 - report the SMTP answer, do not 500
            return Response(
                {'detail': f'The reply could not be sent: {error}'},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        # The officer has by definition read what they just answered.
        services.mark_read(request.user, thread)
        return Response({'ok': True, 'message_id': message.message_id}, status=status.HTTP_201_CREATED)


class MailboxComposeView(APIView):
    """A fresh letter from the desk — the same mailbox, nothing to thread onto."""

    permission_classes = [IsAuthenticated, IsMailboxOfficer]

    def post(self, request):
        recipients = _addresses(request.data.get('to'))
        if not recipients:
            return Response(
                {'detail': 'Add the address you are writing to.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        subject = (request.data.get('subject') or '').strip()
        if not subject:
            return Response(
                {'detail': 'Give the letter a subject.'}, status=status.HTTP_400_BAD_REQUEST
            )
        body = (request.data.get('body') or '').strip()
        if not body:
            return Response(
                {'detail': 'Write the letter first.'}, status=status.HTTP_400_BAD_REQUEST
            )
        if len(body) > MAX_BODY_LENGTH:
            return Response(
                {'detail': 'That letter is too long.'}, status=status.HTTP_400_BAD_REQUEST
            )
        try:
            message = services.send_letter(
                to=recipients,
                subject=subject,
                body_text=body,
                cc=_addresses(request.data.get('cc')),
            )
        except Exception as error:  # noqa: BLE001 - the server's answer belongs to the officer
            return Response(
                {'detail': f'The letter could not be sent: {error}'},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response(
            {'ok': True, 'thread_id': message.thread_id, 'message_id': message.message_id},
            status=status.HTTP_201_CREATED,
        )


class MailboxSyncView(APIView):
    """Pull whatever has arrived since the last poll into the desk.

    Returns a summary rather than a bare 200/500: the officer needs to know
    whether nothing had arrived (nothing had arrived) or the mailbox refused us
    (a reason to check IMAP access) — those are not the same answer.
    """

    permission_classes = [IsAuthenticated, IsMailboxOfficer]

    def post(self, request):
        summary = imap_sync.sync(notify=True)
        return Response(summary, status=status.HTTP_200_OK if summary.get('ok') else status.HTTP_502_BAD_GATEWAY)


# ── helpers ──────────────────────────────────────────────────────────────────

def _paging(request):
    def _int(name, default, floor, ceiling):
        try:
            value = int(request.query_params.get(name) or default)
        except (TypeError, ValueError):
            return default
        return max(floor, min(value, ceiling))

    return (
        _int('limit', DEFAULT_LIMIT, 1, MAX_LIMIT),
        _int('offset', 0, 0, 1_000_000),
    )


def _attachment_counts(thread_ids):
    """How many letters in each thread carry a file — one query for the page."""
    if not thread_ids:
        return {}
    return {
        thread_id: count
        for thread_id, count in MailMessage.objects.filter(
            thread_id__in=thread_ids, attachments__isnull=False
        ).values_list('thread_id').annotate(count=Count('id'))
    }


def _addresses(value):
    """``'a@x, b@y'`` or ``['a@x', 'b@y']`` → a clean list of addresses."""
    if isinstance(value, (list, tuple)):
        raw = list(value)
    else:
        raw = [part for part in str(value or '').split(',')]
    return [str(part).strip() for part in raw if str(part).strip()]


def _reply_subject(thread):
    subject = (thread.subject or '').strip() or 'your enquiry'
    if subject.lower().startswith('re:'):
        return subject
    return f'Re: {subject}'
