"""Rate limiting for the public, token-bearing endpoints.

The invitation verify/accept views are open to the internet, and the link's
token is the only thing standing between a stranger and creating an account
under the invited email. The token itself is a 122-bit UUID that cannot be
guessed, but repeated probing should still meet a wall: after a small burst
of requests from one address the API answers 429 for the rest of the hour.
A real invitee clicking their emailed link a handful of times is nowhere
near the limit.
"""

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from rest_framework.throttling import ScopedRateThrottle


class PublicTokenThrottle(ScopedRateThrottle):
    """A scoped, per-client throttle whose rate is read live.

    DRF freezes DEFAULT_THROTTLE_RATES into the throttle classes when
    rest_framework.throttling is first imported; reading the rate from the
    settings on every request instead keeps a deployment able to retune it
    (and lets tests tighten it) without restarting or reaching into the
    frozen class attribute.
    """

    def get_rate(self):
        rates = settings.REST_FRAMEWORK.get('DEFAULT_THROTTLE_RATES', {})
        rate = rates.get(self.scope)
        if not rate:
            raise ImproperlyConfigured(f'No throttle rate configured for scope {self.scope!r}')
        return rate

    def get_ident(self, request):
        """The address to throttle on: the real client, not a header it controls.

        Requests reach Django through the Cloudflare edge (the Worker proxies
        /api to the origin), so REMOTE_ADDR there is an edge address shared by
        every visitor. CF-Connecting-IP is written by the edge itself and
        cannot be forged by the client, which makes it the honest per-client
        key. Without that header (direct access, development) the socket
        address is used. A client-supplied X-Forwarded-For is never trusted
        here: rotating that header must not reset the budget.
        """
        if getattr(settings, 'TRUST_CF_CONNECTING_IP', True):
            client_ip = (request.META.get('HTTP_CF_CONNECTING_IP') or '').strip()
            if client_ip:
                return client_ip
        return request.META.get('REMOTE_ADDR') or super().get_ident(request)
