"""Stateless M-Pesa STK push context tokens.

The giving flow used to create a `pending` Contribution row at initiation and
let Safaricom's callback find and complete it. Pending rows that never became
real money — the payer cancelling, a timed-out prompt, a callback that never
arrived — piled up in the database, so the row is now created only when the
callback confirms the money arrived. The initiation details (amount, purpose,
phone, the giver's email or member id, the campaign card) ride along in a
signed token instead: Daraja echoes the CallBackURL we send at push time back
to us, and the token is embedded in that URL's query string.

The token is Django's signed timestamped value (HMAC with SECRET_KEY), capped
by MPESA_CALLBACK_TOKEN_TTL_SECONDS — a little past the STK prompt's own
expiry, since a callback legitimately arrives after a slow payer enters their
PIN. An expired or tampered token still acknowledges the callback so
Safaricom stops retrying, but no contribution is created; the amount was never
taken, so there is nothing to record.
"""

from datetime import timedelta

from django.conf import settings
from django.core import signing

TOKEN_SALT = 'members.mpesa_callback_context'

# How long a callback token stays acceptable, in seconds. The STK prompt
# itself expires after about a minute and a half; payers can linger on the
# PIN screen a while longer, so give the callback a generous window.
TOKEN_TTL_SECONDS = int(getattr(settings, 'MPESA_CALLBACK_TOKEN_TTL_SECONDS', 600))


def pack_callback_context(payload):
    """Sign the initiation context for its trip through Safaricom's servers."""
    return signing.dumps(payload, salt=TOKEN_SALT)


def unpack_callback_context(token):
    """Return the initiation context, or None if tampered with or stale."""
    if not token:
        return None
    try:
        return signing.loads(
            token,
            salt=TOKEN_SALT,
            max_age=timedelta(seconds=TOKEN_TTL_SECONDS),
        )
    except signing.BadSignature:
        return None
