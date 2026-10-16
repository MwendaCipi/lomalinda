"""The socket one member holds open on one room.

A connection reaches here already routed by ``config.asgi``. It carries the
member's access token in its query string — a browser cannot set an
``Authorization`` header on a WebSocket — and the church's host in its
``Host`` header, which is what picks the schema. Neither is trusted until it
has been checked against the church's own record: the token must decode to a
live account, and that account must be allowed to read the room before the
socket is accepted at all.

What the socket does is deliberately small. It carries live messages *into*
the room; history still comes from REST. A message a member sends over the
socket is written through exactly the same service the REST send uses, so the
rules for who may post, what an unread mark means and how a room's ordering is
stamped cannot drift between the two doors.
"""

from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.contrib.auth.models import User

from config.tenancy import host_from_scope, tenant_for_host, tenant_scope
from members.models import Announcement

from . import services
from .models import Conversation
from .realtime import announcement_comment_group, broadcast_message, room_group, user_group
from .views import MAX_MESSAGE_LENGTH


class AnnouncementCommentsConsumer(AsyncJsonWebsocketConsumer):
    """A read-only live feed of replies on one published announcement.

    The tab the reader has open on the popup holds this socket, and the server
    pushes a new reply the moment it lands — no poll, no post-submit refetch.

    The socket rides the same rules as the REST comments endpoints: a public
    thread is open to anybody, and a members-only thread is open only to a
    signed-in account. The token rides the query string because a browser
    cannot set a header on a WebSocket handshake; it is decoded exactly the
    way the room consumer decodes it, so one token check serves both doors.

    The socket does not accept writes. A reply still goes through the REST
    ``/action/`` endpoint — that is where the opinion-survey and pledge
    checks already live, and mixing the two would give the same row two
    write contracts.
    """

    async def connect(self):
        self.announcement_id = int(self.scope['url_route']['kwargs']['announcement_id'])
        self.group = None
        self.tenant = await database_sync_to_async(tenant_for_host)(host_from_scope(self.scope))
        user_id = user_id_from_token(self._query_token())
        self.user = await database_sync_to_async(self._user_for)(user_id)
        if not await database_sync_to_async(self._may_listen)():
            await self.close(code=4403)
            return
        self.group = announcement_comment_group(self.announcement_id)
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()
        await self.send_json({'type': 'ready', 'announcement_id': self.announcement_id})

    async def disconnect(self, close_code):
        if self.group:
            await self.channel_layer.group_discard(self.group, self.channel_name)

    async def receive_json(self, content, **kwargs):
        # This socket is a listener, not a writer.
        return

    async def announcement_response(self, event):
        """A reply landed on this announcement — from any door."""
        await self.send_json({'type': 'response', 'response': event['response']})

    # ── The database side, always inside the church's schema ───────────────

    def _query_token(self):
        try:
            query = parse_qs(self.scope.get('query_string', b'').decode('latin-1'))
        except (UnicodeDecodeError, AttributeError):
            return ''
        return (query.get('token') or [''])[0]

    def _user_for(self, user_id):
        if user_id is None:
            return None
        with tenant_scope(self.tenant):
            return User.objects.filter(pk=user_id, is_active=True).first()

    def _may_listen(self):
        """Whether this socket may hold open on this announcement."""
        with tenant_scope(self.tenant):
            announcement = Announcement.objects.filter(pk=self.announcement_id, published=True).first()
            if announcement is None:
                return False
            if announcement.visibility == 'members_only' and self.user is None:
                return False
            return True


def user_id_from_token(token):
    """The account id inside a signed access token, or None if it is not one.

    The same tokens the REST API issues: a forged or expired one is refused by
    the signature check, so no second auth scheme has to be kept in step.
    """
    if not token:
        return None
    from rest_framework_simplejwt.exceptions import TokenError
    from rest_framework_simplejwt.settings import api_settings
    from rest_framework_simplejwt.tokens import AccessToken

    try:
        access = AccessToken(token)
    except TokenError:
        return None
    return access.get(api_settings.USER_ID_CLAIM)


class ChatConsumer(AsyncJsonWebsocketConsumer):
    """One room, as long as the member keeps the tab open."""

    async def connect(self):
        self.conversation_id = int(self.scope['url_route']['kwargs']['conversation_id'])
        self.room = None
        self.user_group = None
        self.tenant = await database_sync_to_async(tenant_for_host)(host_from_scope(self.scope))
        self.user = await database_sync_to_async(self._authenticated_user)()
        if self.user is None:
            # 4401: the client's own code for "sign in again".
            await self.close(code=4401)
            return
        if not await database_sync_to_async(self._can_read)():
            await self.close(code=4403)
            return
        self.room = room_group(self.conversation_id)
        self.user_group = user_group(self.user.id)
        await self.channel_layer.group_add(self.room, self.channel_name)
        # The member's own group rides this socket too, so a badge can move
        # while their attention is on a different room.
        await self.channel_layer.group_add(self.user_group, self.channel_name)
        await self.accept()
        await self.send_json({'type': 'ready', 'conversation_id': self.conversation_id})

    async def disconnect(self, code):
        if self.room:
            await self.channel_layer.group_discard(self.room, self.channel_name)
        if self.user_group:
            await self.channel_layer.group_discard(self.user_group, self.channel_name)

    async def receive_json(self, content, **kwargs):
        if not isinstance(content, dict) or content.get('type') != 'message':
            return
        body = (content.get('body') or '').strip()
        if not body:
            return
        if len(body) > MAX_MESSAGE_LENGTH:
            await self.send_json({'type': 'error', 'detail': 'That message is too long.'})
            return
        posted = await database_sync_to_async(self._post)(body)
        if not posted:
            await self.send_json({'type': 'error', 'detail': 'Only this ministry\u2019s or department\u2019s leaders may post here.'})

    async def chat_message(self, event):
        """A message landed in the room — from any door, including this one."""
        await self.send_json({'type': 'message', 'message': event['message']})

    async def chat_activity(self, event):
        """A room this member reads moved; the badge wants a fresh count."""
        await self.send_json({'type': 'activity', 'conversation_id': event['conversation_id']})

    # ── The database side, always inside the church's schema ───────────────

    def _query_token(self):
        try:
            query = parse_qs(self.scope.get('query_string', b'').decode('latin-1'))
        except (UnicodeDecodeError, AttributeError):
            return ''
        return (query.get('token') or [''])[0]

    def _authenticated_user(self):
        user_id = user_id_from_token(self._query_token())
        if user_id is None:
            return None
        with tenant_scope(self.tenant):
            return User.objects.filter(pk=user_id, is_active=True).first()

    def _can_read(self):
        with tenant_scope(self.tenant):
            conversation = Conversation.objects.filter(pk=self.conversation_id).first()
            if conversation is None or not services.access_to(self.user, conversation):
                return False
            # An area room reads the church's record afresh, so a member added
            # to the roll since their last visit is here when they arrive.
            if conversation.kind == Conversation.KIND_GROUP:
                services.sync_area_room(conversation)
            return True

    def _post(self, body):
        with tenant_scope(self.tenant):
            conversation = Conversation.objects.filter(pk=self.conversation_id).first()
            if conversation is None or not services.can_post(self.user, conversation):
                return False
            message = services.post_message(conversation, self.user, body)
            # The sender has by definition read what they just wrote.
            services.mark_read(conversation, self.user)
            broadcast_message(conversation, message)
            return True
