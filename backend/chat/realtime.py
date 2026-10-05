"""Pushing a written message to the sockets watching a room.

The REST send and the socket consumer both end here, so a message posted
through either door reaches every open socket in the same shape the REST
serializers use. A room has one group; every member also has a group of their
own, which hears a small activity nudge whenever a room they are in moves —
that is what lets a badge count up without holding a socket open on the room.
"""

import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from .serializers import ChatMessageSerializer

logger = logging.getLogger(__name__)


def room_group(conversation_id):
    """The group every socket watching one conversation joins."""
    return f'chat.room.{conversation_id}'


def user_group(user_id):
    """The group one member's sockets join, whatever room they are watching."""
    return f'chat.user.{user_id}'


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
