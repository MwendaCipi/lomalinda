from django.contrib.auth.models import User
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from members.models import Department

from . import realtime, services
from .models import Conversation
from .serializers import ChatConversationSerializer, ChatMessageSerializer, ChatPersonSerializer

#: How many messages one page of history holds. Older pages come from `before`.
PAGE_SIZE = 50

#: The longest a single message may be — a thought, not an essay.
MAX_MESSAGE_LENGTH = 4000


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
        if not body:
            return Response({'detail': 'Type a message first.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(body) > MAX_MESSAGE_LENGTH:
            return Response({'detail': 'That message is too long.'}, status=status.HTTP_400_BAD_REQUEST)
        message = services.post_message(conversation, request.user, body)
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
