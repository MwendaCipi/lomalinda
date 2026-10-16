"""The WebSocket routes chat answers on.

One route, one room: the conversation id in the path is the room the socket
watches. It is served under ``/ws/`` so Nginx can hand the whole prefix to
daphne and leave everything else to gunicorn.

Announcement replies ride the same bus as rooms. Because replies live on the
announcement, not on a room, the path is keyed by announcement id rather than
conversation id. The handler is read-only for the client: the write path is
still the REST ``/action/`` endpoint, and the handler exists only to fan new
replies out to the tab that asked for them.
"""

from django.urls import re_path

from .consumers import AnnouncementCommentsConsumer, ChatConsumer

websocket_urlpatterns = [
    re_path(r'^ws/chat/(?P<conversation_id>\d+)/$', ChatConsumer.as_asgi()),
    re_path(r'^ws/announcements/(?P<announcement_id>\d+)/comments/$', AnnouncementCommentsConsumer.as_asgi()),
]
