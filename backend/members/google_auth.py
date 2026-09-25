"""Verifying the Google ID tokens our pages receive.

Google Identity Services hands the browser a signed ID token ("credential")
after the member consents. Nothing inside it can be trusted until the signature,
issuer, audience and expiry have been checked, so every endpoint that accepts
one goes through :func:`verify_google_credential` rather than reading the JSON
itself — and a change to how we verify happens in exactly one place.

The alternative, and what an earlier version of the enrollment endpoint did, is
to POST the token back to Google's ``tokeninfo`` endpoint. This verifies
offline against Google's published keys instead, which keeps sign-in working
when that endpoint is slow and does not hand a credential-bearing request to a
third party on every attempt.
"""

from django.conf import settings
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

# Google has issued both spellings of the issuer for years; the modern tokens
# carry the bare host.
GOOGLE_ISSUERS = frozenset({'accounts.google.com', 'https://accounts.google.com'})

NOT_CONFIGURED_MESSAGE = 'Google sign-in has not been configured yet.'
REJECTED_MESSAGE = 'Google sign-in could not be completed.'


class GoogleCredentialError(Exception):
    """The credential is missing, unverifiable, or not meant for this site.

    ``unavailable`` separates \"we have no Google client ID\" — an operator
    problem that answers 503 — from \"this credential is not acceptable\", which
    answers 400 and is the member's problem to retry.
    """

    def __init__(self, message, unavailable=False):
        super().__init__(message)
        self.unavailable = unavailable


def verify_google_credential(credential):
    """Return the verified claims of a Google ID token, or raise.

    Only a genuinely Google-signed token for this application's client ID
    passes: ``verify_oauth2_token`` checks the RS256 signature against Google's
    public keys, the expiry, and the audience, so a token minted for another
    site, or one edited in the browser, is rejected before any claim is read.
    The token must also carry a verified email address, because that address is
    what links the Google account to a church account.
    """
    client_id = getattr(settings, 'GOOGLE_OAUTH_CLIENT_ID', '')
    if not client_id:
        raise GoogleCredentialError(NOT_CONFIGURED_MESSAGE, unavailable=True)
    if not credential:
        raise GoogleCredentialError(REJECTED_MESSAGE)
    try:
        claims = id_token.verify_oauth2_token(credential, google_requests.Request(), client_id)
    except Exception as error:  # ValueError, TransportError, and anything the library raises
        raise GoogleCredentialError(REJECTED_MESSAGE) from error

    if claims.get('iss') not in GOOGLE_ISSUERS:
        raise GoogleCredentialError(REJECTED_MESSAGE)
    email = str(claims.get('email') or '').strip()
    email_verified = claims.get('email_verified')
    if not email or not (email_verified is True or str(email_verified).lower() == 'true'):
        raise GoogleCredentialError(REJECTED_MESSAGE)
    if not str(claims.get('sub') or '').strip():
        raise GoogleCredentialError(REJECTED_MESSAGE)

    claims['email'] = email.lower()
    return claims
