"""Pushing written messages out to the sockets watching a room.

The REST send and the socket consumer both end here, so a message posted
through either door reaches every open socket in the same shape the REST
serializers use. A room has one group; every member also has a group of their
own, which hears a small activity nudge whenever a room they are in moves —
that is what lets a badge count up without holding a socket open on the room.

Announcement replies use the same bus. When a response lands, every socket
listening on that announcement gets the new row in the same shape the REST
comments serializer uses. This is what lets the popup's comment thread update
itself without a post-submit refetch.
"""

import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from members.serializers import AnnouncementResponseSerializer

from .serializers import ChatMessageSerializer

logger = logging.getLogger(__name__)


def room_group(conversation_id):
    """The group every socket watching one conversation joins."""
    return f'chat.room.{conversation_id}'


def user_group(user_id):
    """The group one member's sockets join, whatever room they are watching."""
    return f'chat.user.{user_id}'


def announcement_comment_group(announcement_id):
    """The group every socket listening for replies on one announcement joins."""
    return f'chat.announcement.comments.{announcement_id}'


def broadcast_message(conversation, message):
    """Fan a new message out to the room, and an activity nudge to its readers.

    Called from the REST view and from the consumer's save, both of which run
    outside the event loop — the consumer because its database work rides
    ``database_sync_to_async`` — so ``async_to_sync`` is the right bridge here.

    A channel layer that is down must never fail the write: the message is
    already in the database, and the frontend's poll still finds it. The error
    is logged and swallowed.
    """
    layer = get_channel_layer()
    if layer is None:
        return
    payload = ChatMessageSerializer(message).data
    try:
        async_to_sync(layer.group_send)(
            room_group(conversation.id),
            {'type': 'chat.message', 'message': payload},
        )
        activity = {'type': 'chat.activity', 'conversation_id': conversation.id}
        for member_id in conversation.participants.values_list('member_id', flat=True):
            async_to_sync(layer.group_send)(user_group(member_id), activity)
    except Exception:  # pragma: no cover - a dead bus must not break a write
        logger.exception('Could not broadcast chat message %s', message.pk)


def broadcast_announcement_response(announcement, response):
    """Fan a new reply out to every socket listening on that announcement.

    Called right after a response is written, from the REST action view, so the
    tab that is open on the popup sees the new line without refreshing.

    A channel layer that is down must never fail the write: the response is
    already in the database, and the REST comments endpoint still serves it.
    The error is logged and swallowed.
    """
    layer = get_channel_layer()
    if layer is None:
        return
    payload = AnnouncementResponseSerializer(response).data
    try:
        async_to_sync(layer.group_send)(
            announcement_comment_group(announcement.id),
            {'type': 'announcement.response', 'response': payload},
        )
    except Exception:  # pragma: no cover - a dead bus must not break a write
        logger.exception('Could not broadcast announcement response %s', response.pk)
