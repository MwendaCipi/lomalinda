from django.contrib.auth.models import User
from django.db.models import Q
from django.http import Http404
from django.utils import timezone
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from members.models import Announcement, AnnouncementResponse, Department
from members.serializers import AnnouncementResponseSerializer

import logging
logger = logging.getLogger(__name__)

from . import realtime, services
from .models import Conversation
from .serializers import ChatConversationSerializer, ChatMessageSerializer, ChatPersonSerializer


class AnnouncementCommentsView(APIView):
    """The spirit of the old announcement-channels project — a read-only
    chat thread attached to a published announcement, where members raise
    questions and read each other's replies. Friends without accounts land
    via the same query string the website's share link passes through.

    A response line carries an id, the member or guest who wrote it, the
    body and the moment it landed. The response_mode is folded in so the
    reader-facing layer can shade a closed opinion post the same way the
    action handler does.

    Public posts are readable by anybody. Members-only posts are also
    readable by a signed-in member — the office's own members are the
    intended audience, not a write barrier, so a member can see the thread
    that belongs to their church without the response visibility being
    lifted for the rest of the world. That distinction stays on the wire: a
    public reader still gets a plain 404 for a members-only thread, and a
    signed-in member gets membership's reader view.

    This is a read-only mirror. New lines still go through the /action/
    endpoint, which is where the survey-style opinion path and the pledge
    path already live."""

    authentication_classes = []

    def get(self, request, pk):
        try:
            announcement = Announcement.objects.get(published=True, pk=pk)
        except Announcement.DoesNotExist:
            raise Http404('No announcement matches that id.')

        if announcement.visibility == 'members_only' and not request.user.is_authenticated:
            # A members-only thread is simply not there for a public reader.
            logger.warning('Public reader asked for a members-only announcement %s.', pk)
            raise Http404('No announcement matches that id.')

        return _announcement_comment_response(announcement, request)


class AnnouncementCommentsForMemberView(APIView):
    """A signed-in member's reader view of a published thread, including
    members-only posts.

    Same shape as the public endpoint, same order, same reply lines — only
    this door requires sign-in. It exists so the public endpoint can keep
    answering 404 for a members-only post when nobody is signed in, while a
    signed-in member still gets the thread for their church.

    The message is the same as the public endpoint's, including the
    members-only posts the public endpoint would have hidden."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            announcement = Announcement.objects.get(published=True, pk=pk)
        except Announcement.DoesNotExist:
            raise Http404('No announcement matches that id.')

        return _announcement_comment_response(announcement, request)


def _announcement_comment_response(announcement, request):
    comments = AnnouncementResponseSerializer.for_list(announcement.responses.order_by('created_at'), request)
    return Response({
        'announcement': {
            'id': announcement.pk,
            'title': announcement.title,
            'visibility': announcement.get_visibility_display(),
            'response_mode': announcement.response_mode,
        },
        'comments': comments,
        'count': len(comments),
    })

#: How many messages one page of history holds. Older pages come from `before`.
PAGE_SIZE = 50

#: The longest a single message may be — a thought, not an essay.
MAX_MESSAGE_LENGTH = 4000

#: The largest file a message may carry — a receipt photo, the rota, the
#: minutes. 10 MB covers the documents a church passes around.
MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024


class ChatConversationListView(APIView):
    """The member's rooms, and the way to open one that does not exist yet."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        # The member's default rooms are made and joined on the way: the
        # church's own family group and the flat group of every area they
        # belong to. Reading the list is what gives a member their rooms, so
        # a new area or a new member arrives without the office doing anything.
        services.ensure_member_rooms(request.user)
        rooms = services.conversations_for(request.user)
        data = ChatConversationSerializer(rooms, many=True, context={'request': request}).data
        return Response({'conversations': data})

    def post(self, request):
        kind = (request.data.get('kind') or '').strip()
        if kind == Conversation.KIND_DM:
            member_id = request.data.get('member_id')
            member = User.objects.filter(pk=member_id, is_active=True).first() if member_id else None
            if member is None:
                return Response({'detail': 'Choose a member to message.'}, status=status.HTTP_400_BAD_REQUEST)
            if member.id == request.user.id:
                return Response({'detail': 'You cannot message yourself.'}, status=status.HTTP_400_BAD_REQUEST)
            conversation = services.open_dm(request.user, member)
        elif kind == Conversation.KIND_OFFICE:
            conversation = services.open_office_thread(request.user)
        elif kind in (Conversation.KIND_GROUP, 'channel'):
            # 'channel' is what the old announcement rooms asked for; the
            # church now keeps one flat group per area, so the ask lands on it.
            code = (request.data.get('department') or '').strip()
            department = get_object_or_404(Department, code=code, is_active=True)
            conversation = services.area_room(department)
        else:
            return Response({'detail': 'Unknown conversation kind.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            ChatConversationSerializer(conversation, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


class ChatMessageListView(APIView):
    """One room's history, newest page first, and the way to add to it."""

    permission_classes = [IsAuthenticated]

    def _readable(self, request, conversation_id):
        """The room, if this account may read it; otherwise a refusal."""
        conversation = get_object_or_404(Conversation, pk=conversation_id)
        if not services.access_to(request.user, conversation):
            return None, Response(
                {'detail': 'You are not part of that conversation.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return conversation, None

    def get(self, request, conversation_id):
        conversation, refusal = self._readable(request, conversation_id)
        if refusal:
            return refusal
        # An area group reads the church's record afresh, so a member added to
        # the roll since their last visit is here when they arrive.
        if conversation.kind == Conversation.KIND_GROUP:
            services.sync_area_room(conversation)
        messages = conversation.messages.select_related('sender').filter(deleted=False)
        before = request.query_params.get('before')
        if before:
            messages = messages.filter(id__lt=before)
        page = list(messages.order_by('-created_at', '-id')[:PAGE_SIZE])
        page.reverse()
        return Response({'messages': ChatMessageSerializer(page, many=True).data})

    def post(self, request, conversation_id):
        conversation, refusal = self._readable(request, conversation_id)
        if refusal:
            return refusal
        if not services.can_post(request.user, conversation):
            return Response(
                {'detail': 'You are not part of that conversation.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        body = (request.data.get('body') or '').strip()
        attachment = request.FILES.get('attachment')
        # A message is words, a file, or both — but never nothing.
        if not body and not attachment:
            return Response({'detail': 'Type a message first.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(body) > MAX_MESSAGE_LENGTH:
            return Response({'detail': 'That message is too long.'}, status=status.HTTP_400_BAD_REQUEST)
        if attachment and attachment.size > MAX_ATTACHMENT_BYTES:
            return Response(
                {'detail': 'That file is too large — the limit is 10 MB.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        message = services.post_message(conversation, request.user, body, attachment=attachment)
        # The sender has by definition read what they just wrote.
        services.mark_read(conversation, request.user)
        # A post through the API is as live as one through the socket: everyone
        # watching the room hears it at once, not on their next poll.
        realtime.broadcast_message(conversation, message)
        return Response(ChatMessageSerializer(message).data, status=status.HTTP_201_CREATED)


class ChatReadView(APIView):
    """Mark a room read for this member, so its unread count falls to zero."""

    permission_classes = [IsAuthenticated]

    def post(self, request, conversation_id):
        conversation = get_object_or_404(Conversation, pk=conversation_id)
        if not services.access_to(request.user, conversation):
            return Response(
                {'detail': 'You are not part of that conversation.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        services.mark_read(conversation, request.user)
        return Response({'ok': True, 'unread_count': 0})


class ChatConversationDeleteView(APIView):
    """Delete a chat out of one member's own list.

    What a delete is here: the room leaves the member's list and its unread
    stops counting, and the other side keeps everything — the room, its
    messages and their place in it. A message that lands later brings the
    chat back (see ``services.post_message``), and walking back in is
    ``open_*``'s own un-hide.

    The church's own rooms are not a member's chat to delete: an area group
    is stepped out of (the same menu, the leave), and refusing keeps the
    two verbs reading as they are rather than two names for one thing."""

    permission_classes = [IsAuthenticated]

    def delete(self, request, conversation_id):
        conversation = get_object_or_404(Conversation, pk=conversation_id)
        if not services.access_to(request.user, conversation):
            return Response(
                {'detail': 'You are not part of that conversation.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if conversation.kind == Conversation.KIND_GROUP:
            return Response(
                {'detail': 'A group is not deleted — step out of it instead.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        participant = conversation.participants.filter(member=request.user).first()
        if participant is None:
            return Response(
                {'detail': 'You are not part of that conversation.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        participant.hidden_at = timezone.now()
        participant.save(update_fields=['hidden_at'])
        return Response({'ok': True})


class ChatContactsView(APIView):
    """The people a member may start a direct message with."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        people = (
            User.objects.filter(is_active=True)
            .exclude(id=request.user.id)
            .order_by('first_name', 'last_name', 'username')
        )
        search = (request.query_params.get('search') or '').strip()
        if search:
            people = people.filter(
                Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(username__icontains=search)
            )
        return Response({'contacts': ChatPersonSerializer(people[:100], many=True).data})


class ChatConversationLeaveView(APIView):
    """Step out of a room you are in — the member's own leave."""

    permission_classes = [IsAuthenticated]

    def delete(self, request, conversation_id):
        conversation = get_object_or_404(Conversation, pk=conversation_id)
        if not services.access_to(request.user, conversation):
            return Response(
                {'detail': 'You are not part of that conversation.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        # A direct message needs both sides still present; leaving would leave
        # the other member alone in a room with no one to talk to.
        if conversation.kind == Conversation.KIND_DM:
            return Response(
                {'detail': 'You cannot leave a direct message — close it instead.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        participant = conversation.participants.filter(member=request.user).first()
        if participant is None:
            return Response(
                {'detail': 'You are not part of that conversation.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        participant.delete()
        # The room may have gone quiet once this member walked out.
        services.sync_area_room(conversation)
        return Response({'ok': True})
