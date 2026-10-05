"""The WebSocket routes chat answers on.

One route, one room: the conversation id in the path is the room the socket
watches. It is served under ``/ws/`` so Nginx can hand the whole prefix to
daphne and leave everything else to gunicorn.
"""

from django.urls import re_path

from .consumers import ChatConsumer

websocket_urlpatterns = [
    re_path(r'^ws/chat/(?P<conversation_id>\d+)/$', ChatConsumer.as_asgi()),
]
