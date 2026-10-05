"""
ASGI config for the church backend.

Two protocols ride here. HTTP is Django's ordinary application — in production
Nginx sends it to gunicorn, and this route is what ``runserver`` and any
deployment that prefers one process for everything use instead. WebSockets are
the chat transport: the ``/ws/`` prefix is routed to the chat consumer, which
authenticates the connection itself and sets the church's schema from the
``Host`` header (see ``config/tenancy``), because ``django_tenants``' HTTP
middleware has no analogue on a socket.

The HTTP application is built *before* the routing import below: importing the
consumer pulls in the ORM, and the app registry has to be ready first.
"""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402
from channels.security.websocket import AllowedHostsOriginValidator  # noqa: E402

from chat.routing import websocket_urlpatterns  # noqa: E402

application = ProtocolTypeRouter(
    {
        'http': django_asgi_app,
        # A socket from a page the church does not serve is refused before it
        # reaches the consumer; the token check below is the second gate.
        'websocket': AllowedHostsOriginValidator(URLRouter(websocket_urlpatterns)),
    }
)
