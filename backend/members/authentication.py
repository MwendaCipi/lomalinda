"""Authentication helpers for the members app.

`QueryAccessTokenAuthentication` exists so a desk can hand a document to the
browser's own PDF reader — the way the Materials lessons open — instead of
embedding it in an iframe. A phone cannot render a PDF inside an iframe at
all (the frame stays blank), but it renders a navigated URL perfectly, so the
readers put the token on the URL and the tab does the rest.

Rules that keep the URL-carried token from being a standing hole:

* safe methods only — POST/PUT/PATCH/DELETE are never read from the URL;
* the `Authorization` header always wins — a client that sends it is not
  being read from the query string on top;
* it sits *before* the standard JWT authenticator, so an absent or expired
  query token changes nothing a normal caller would notice.
"""

from rest_framework_simplejwt.authentication import JWTAuthentication

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


class QueryAccessTokenAuthentication(JWTAuthentication):
    """Accept `?access_token=<jwt>` on safe requests when no header is set."""

    def authenticate(self, request):
        if request.method not in SAFE_METHODS:
            return None
        if request.headers.get("Authorization"):
            return None
        # A DRF request answers from `query_params`; the bare WSGI request a
        # factory (or any non-DRF caller) builds reads its GET instead.
        params = getattr(request, "query_params", None) or request.GET
        token = params.get("access_token", "")
        if not token:
            return None
        try:
            validated = self.get_validated_token(token)
        except Exception:
            # An unusable query token is not an answer; fall through so the
            # request is judged by the ordinary authenticators and permissions
            # (which answer with the standard 401 the caller already knows).
            return None
        return self.get_user(validated), validated
