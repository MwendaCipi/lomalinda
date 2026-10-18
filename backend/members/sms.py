"""The bulk SMS gateway: how one phone number becomes one text.

Ping Africa's Bulk API is the gateway this church sends through
(https://bulk.ping.africa/docs/api). One message is a JSON POST:

    POST https://bulk.ping.africa/api/sms/send
    Authorization: Bearer <API token>
    {"recipient": "+254712345678", "message": "...", "sender_id": "PING-AFRICA"}

Three things about that shape are easy to get wrong, and all three are the
reason this lives in one module rather than at each call site:

* the recipient field is ``recipient`` and the number is international
  (``+254712345678``), not the ``07…`` the desk types and the ledger stores;
* ``sender_id`` must be a sender the account has been granted — sending the
  church's own name as the sender is refused with "No sender ID available",
  so it is omitted unless ``SMS_SENDER_ID`` names one that was approved;
* a refusal comes back as a 4xx whose body carries the reason (insufficient
  credits, bad token, validation), so the reason belongs in the log instead
  of being flattened into "did not send".

Nothing here raises: an announcement or a receipt must never fail because a
phone gateway is down. ``send()`` answers True only when the gateway accepted
the message, so a caller can report honestly what happened.
"""

import logging
import re

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

#: Where a message goes when ``SMS_API_URL`` is unset. The variable exists so
#: the same code can be pointed at a test double, but a deployment that only
#: sets its token does not have to spell the endpoint out.
DEFAULT_API_URL = 'https://bulk.ping.africa/api/sms/send'


def api_url():
    """The endpoint a message is posted to, with the documented default."""
    return (getattr(settings, 'SMS_API_URL', '') or DEFAULT_API_URL).strip()


def api_key():
    """The API token, stripped of the whitespace a pasted line usually keeps."""
    return (getattr(settings, 'SMS_API_KEY', '') or '').strip()


def configured():
    """True when a token exists, which is the one thing a deployment must set.

    The URL has a documented default, so an unset ``SMS_API_URL`` is not
    "unconfigured" — only a missing token is. Every screen that tells an
    officer whether SMS can go out asks this, so the answer matches what
    ``send()`` would really do.
    """
    return bool(api_key())


def recipient(value):
    """A Kenyan mobile number as the gateway wants it, or '' when unusable.

    The desk, the ledger and the M-Pesa callbacks hold numbers in several
    shapes — ``0712 345 678``, ``+254712345678``, ``254712345678``,
    ``00254712345678``, sometimes with a masked middle. All of them become
    ``+254712345678``. A number that is not a Kenyan mobile (or has been
    masked beyond use) comes back empty, so the caller skips it rather than
    spending a credit on a send that can only fail.
    """
    digits = re.sub(r'\D', '', value or '')
    if digits.startswith('00254'):
        digits = digits[2:]
    elif digits.startswith('0') and len(digits) == 10:
        digits = f'254{digits[1:]}'
    elif len(digits) == 9 and digits[0] in '71':
        # The leading zero was dropped somewhere along the way.
        digits = f'254{digits}'
    if not re.fullmatch(r'254(?:7\d{8}|1\d{8})', digits):
        return ''
    return f'+{digits}'


def send(phone, message, *, sender_id=None):
    """Hand one text to the gateway; True only if it was accepted.

    ``sender_id`` defaults to ``SMS_SENDER_ID`` and is left out of the body
    entirely when that is blank, which lets the account's own default sender
    speak — the one sender every Bulk account is guaranteed to have.
    """
    to = recipient(phone)
    body = (message or '').strip()
    if not to:
        logger.warning('SMS skipped: %r is not a usable phone number.', phone)
        return False
    if not body:
        logger.warning('SMS to %s skipped: nothing to say.', to)
        return False
    key = api_key()
    if not key:
        logger.warning('SMS to %s skipped: SMS_API_KEY is not set.', to)
        return False

    payload = {'recipient': to, 'message': body}
    sender = (sender_id if sender_id is not None else getattr(settings, 'SMS_SENDER_ID', '')) or ''
    if sender.strip():
        payload['sender_id'] = sender.strip()

    url = api_url()
    try:
        response = requests.post(
            url,
            json=payload,
            headers={'Authorization': f'Bearer {key}', 'Accept': 'application/json'},
            timeout=getattr(settings, 'SMS_TIMEOUT', 10),
        )
    except requests.RequestException as exc:
        # A dead gateway or a DNS hiccup: the reason matters, the token does not.
        logger.warning('SMS to %s could not reach %s: %s', to, url, exc)
        return False
    return _accepted(response, to)


def _accepted(response, to):
    """Read the gateway's answer: 2xx *and* not an explicit ``success: false``."""
    try:
        body = response.json()
    except ValueError:
        # A proxy's HTML error page. No detail to quote, but the status tells
        # the story (401 token, 402 credits, 429 throttle).
        body = None

    ok = 200 <= response.status_code < 300
    if isinstance(body, dict) and body.get('success') is False:
        ok = False
    if not ok:
        logger.warning(
            'SMS to %s refused by the gateway (%s): %s',
            to, response.status_code, _error_detail(body),
        )
        return False

    if isinstance(body, dict):
        parts = (body.get('message') or {}).get('parts') if isinstance(body.get('message'), dict) else None
        logger.info(
            'SMS to %s sent%s (balance %s).',
            to,
            f' in {parts} parts' if parts else '',
            body.get('new_balance', 'unknown'),
        )
    return True


def _error_detail(body):
    """The gateway's own words about a refusal, trimmed for one log line."""
    if not isinstance(body, dict):
        return 'no response body'
    detail = body.get('error') or body.get('message') or body.get('messages') or 'no details'
    if not isinstance(detail, str):
        detail = str(detail)
    return detail.strip()[:300] or 'no details'
