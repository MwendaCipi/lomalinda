import base64
import re
import uuid
from datetime import datetime
from os import environ
from zoneinfo import ZoneInfo

import requests


class MpesaConfigurationError(Exception):
    pass


def _setting(name):
    value = environ.get(name)
    if not value:
        raise MpesaConfigurationError(f'M-Pesa is not configured: missing {name}.')
    return value


def normalize_mpesa_phone(value):
    phone = value.replace(' ', '').replace('-', '')
    if phone.startswith('+254'):
        phone = phone[1:]
    elif phone.startswith('0'):
        phone = f'254{phone[1:]}'
    if not phone.isdigit() or not phone.startswith('254') or len(phone) != 12:
        raise ValueError('Enter a valid Kenyan M-Pesa number, for example 0712345678.')
    return phone


def safe_mpesa_phone(value, max_length=20):
    """Coerce a Safaricom-supplied phone into the 2547… form, never raising.

    The C2B confirmation's MSISDN is untrusted text: it may carry a leading
    plus or zero, stray separators, or junk. The stored column is bounded, so
    a value longer than the column would crash the whole save and drop the
    payment — this normalises to digits and truncates rather than losing the
    gift. Returns '' when nothing phone-shaped remains.
    """
    digits = re.sub(r'\D', '', str(value or ''))
    if digits.startswith('254'):
        pass
    elif digits.startswith('0') and len(digits) >= 10:
        digits = f'254{digits[1:]}'
    elif len(digits) == 9:
        digits = f'254{digits}'
    # A phone is 12 digits; keep at most that many, then clamp to the column.
    return digits[:12][:max_length] if digits else ''


def account_reference_for_purpose(purpose):
    """Create Safaricom's short account reference from the giving purpose."""
    reference = re.sub(r'[^A-Za-z0-9]', '', str(purpose or '')).upper()
    aliases = {
        'LOCALCHURCHBUDGET': 'LCB',
        'LOCALBUDGET': 'LCB',
    }
    return aliases.get(reference, reference[:12]) or 'GIVING'


def initiate_stk_push_for_context(phone_number, amount, purpose, context_token):
    """Send an STK push for a giving that has no Contribution row yet.

    The contribution is only created once Safaricom's callback confirms the
    money arrived, so this takes the raw initiation details instead of a
    model instance. The signed context token is appended to the CallBackURL
    (Daraja echoes the URL back to us verbatim), which is how the callback
    later reconstructs what was being paid for.
    """
    consumer_key = _setting('MPESA_CONSUMER_KEY')
    consumer_secret = _setting('MPESA_CONSUMER_SECRET')
    shortcode = _setting('MPESA_SHORTCODE')
    passkey = _setting('MPESA_PASSKEY')
    callback_url = _setting('MPESA_CALLBACK_URL')
    base_url = environ.get('MPESA_BASE_URL', 'https://sandbox.safaricom.co.ke')

    separator = '&' if '?' in callback_url else '?'
    callback_url = f"{callback_url}{separator}ctx={context_token}"

    token_response = requests.get(f'{base_url}/oauth/v1/generate?grant_type=client_credentials', auth=(consumer_key, consumer_secret), timeout=15)
    token_response.raise_for_status()
    access_token = token_response.json()['access_token']

    timestamp = datetime.now(ZoneInfo('Africa/Nairobi')).strftime('%Y%m%d%H%M%S')
    password = base64.b64encode(f'{shortcode}{passkey}{timestamp}'.encode()).decode()
    payload = {
        'BusinessShortCode': shortcode,
        'Password': password,
        'Timestamp': timestamp,
        'TransactionType': environ.get('MPESA_TRANSACTION_TYPE', 'CustomerPayBillOnline'),
        'Amount': int(amount),
        'PartyA': phone_number,
        'PartyB': shortcode,
        'PhoneNumber': phone_number,
        'CallBackURL': callback_url,
        'AccountReference': account_reference_for_purpose(purpose),
        'TransactionDesc': purpose,
    }
    response = requests.post(f'{base_url}/mpesa/stkpush/v1/processrequest', json=payload, headers={'Authorization': f'Bearer {access_token}'}, timeout=15)
    response.raise_for_status()
    result = response.json()
    if result.get('ResponseCode') != '0':
        raise RuntimeError(result.get('ResponseDescription', 'M-Pesa rejected the request.'))
    return result


def _b2c_settings():
    """B2C payouts need extra credentials the collection APIs never use.

    MPESA_SECURITY_CREDENTIAL is the initiator password encrypted with
    Safaricom's public certificate (the "M-Pesa initiator security credential"
    option in the Daraja portal, or the OpenSSL recipe in their B2C docs).
    In the sandbox, credentials come from the test app page (initiator: testapi).
    """
    required = {
        'MPESA_B2C_SHORTCODE': environ.get('MPESA_B2C_SHORTCODE') or environ.get('MPESA_SHORTCODE'),
        'MPESA_INITIATOR_NAME': environ.get('MPESA_INITIATOR_NAME'),
        'MPESA_SECURITY_CREDENTIAL': environ.get('MPESA_SECURITY_CREDENTIAL'),
        'MPESA_B2C_RESULT_URL': environ.get('MPESA_B2C_RESULT_URL'),
    }
    missing = [name for name, value in required.items() if not value]
    if missing:
        raise MpesaConfigurationError(f'M-Pesa B2C is not configured: missing {", ".join(missing)}.')
    return required


def initiate_b2c_refund(refund):
    """Request the B2C payout that refunds a member's contribution.

    Daraja accepts the request synchronously but processes the payout
    asynchronously: the final result (success receipt or failure reason)
    arrives at MPESA_B2C_RESULT_URL, handled by MpesaB2CResultView.
    """
    settings_map = _b2c_settings()
    base_url = environ.get('MPESA_BASE_URL', 'https://sandbox.safaricom.co.ke')

    token_response = requests.get(
        f'{base_url}/oauth/v1/generate?grant_type=client_credentials',
        auth=(_setting('MPESA_CONSUMER_KEY'), _setting('MPESA_CONSUMER_SECRET')),
        timeout=15,
    )
    token_response.raise_for_status()
    access_token = token_response.json()['access_token']

    payload = {
        'OriginatorConversationID': refund.originator_conversation_id or uuid.uuid4().hex,
        'InitiatorName': settings_map['MPESA_INITIATOR_NAME'],
        'SecurityCredential': settings_map['MPESA_SECURITY_CREDENTIAL'],
        'CommandID': 'BusinessPayment',
        'Amount': int(refund.amount),
        'PartyA': settings_map['MPESA_B2C_SHORTCODE'],
        'PartyB': refund.phone_number,
        'Remarks': f"Refund for contribution {refund.contribution_id}",
        'QueueTimeOutURL': settings_map['MPESA_B2C_RESULT_URL'],
        'ResultURL': settings_map['MPESA_B2C_RESULT_URL'],
        'Occasion': 'Contribution refund',
    }
    response = requests.post(
        f'{base_url}/mpesa/b2c/v3/paymentrequest',
        json=payload,
        headers={'Authorization': f'Bearer {access_token}'},
        timeout=15,
    )
    response.raise_for_status()
    return response.json()


def register_c2b_urls(validation_url=None, confirmation_url=None):
    consumer_key = _setting('MPESA_CONSUMER_KEY')
    consumer_secret = _setting('MPESA_CONSUMER_SECRET')
    shortcode = _setting('MPESA_SHORTCODE')
    base_url = environ.get('MPESA_BASE_URL', 'https://sandbox.safaricom.co.ke')

    val_url = validation_url or environ.get('MPESA_C2B_VALIDATION_URL')
    conf_url = confirmation_url or environ.get('MPESA_C2B_CONFIRMATION_URL')
    if not val_url or not conf_url:
        raise MpesaConfigurationError('Missing MPESA_C2B_VALIDATION_URL or MPESA_C2B_CONFIRMATION_URL.')

    token_response = requests.get(f'{base_url}/oauth/v1/generate?grant_type=client_credentials', auth=(consumer_key, consumer_secret), timeout=15)
    token_response.raise_for_status()
    access_token = token_response.json()['access_token']

    payload = {
        'ShortCode': shortcode,
        'ResponseType': 'Completed',
        'ValidationURL': val_url,
        'ConfirmationURL': conf_url,
    }
    # v2, not v1: the v1 endpoint answers 401 for apps Safaricom has moved
    # onto the current C2B registration API — same request shape, current
    # door. Falls back to v1 for an installation still authorised there.
    url = environ.get('MPESA_C2B_REGISTER_URL') or f'{base_url}/mpesa/c2b/v2/registerurl'
    response = requests.post(url, json=payload, headers={'Authorization': f'Bearer {access_token}'}, timeout=15)
    if response.status_code == 401 and 'v2' in url:
        response = requests.post(f'{base_url}/mpesa/c2b/v1/registerurl', json=payload, headers={'Authorization': f'Bearer {access_token}'}, timeout=15)
    response.raise_for_status()
    return response.json()


def register_pull_url(nominated_number=None, callback_url=None):
    """Turn the Pull Transactions API on for the church's shortcode.

    Safaricom answers `pulltransactions/v1/query` only for a shortcode that
    has been registered here first — the register call is a one-off (code
    1001, "ShortCode already Registered", on every run after the first),
    so it lives behind its own command instead of inside a pull. That
    registration is why an unregistered shortcode answers a query with
    "No records found or Organization Name not available": nothing was
    ever enabled to be found.

    NominatedNumber is the Safaricom MSISDN on the church's organisation
    account (07XXXXXXXX or 2547XXXXXXX); CallBackURL is where pull
    notifications are delivered. MPESA_PULL_REGISTER_URL overrides the
    door — the sandbox and production hosts register separately.
    """
    consumer_key = _setting('MPESA_CONSUMER_KEY')
    consumer_secret = _setting('MPESA_CONSUMER_SECRET')
    shortcode = _setting('MPESA_SHORTCODE')
    base_url = environ.get('MPESA_BASE_URL', 'https://sandbox.safaricom.co.ke')

    nominated = (nominated_number or environ.get('MPESA_PULL_NOMINATED_NUMBER') or '').strip()
    callback = (callback_url or environ.get('MPESA_PULL_CALLBACK_URL') or '').strip()
    if not nominated:
        raise MpesaConfigurationError('Missing MPESA_PULL_NOMINATED_NUMBER.')
    if not callback:
        raise MpesaConfigurationError('Missing MPESA_PULL_CALLBACK_URL.')

    token_response = requests.get(
        f'{base_url}/oauth/v1/generate?grant_type=client_credentials',
        auth=(consumer_key, consumer_secret),
        timeout=15,
    )
    token_response.raise_for_status()
    access_token = token_response.json()['access_token']

    payload = {
        'ShortCode': shortcode,
        'RequestType': 'Pull',
        'NominatedNumber': nominated,
        'CallBackURL': callback,
    }
    url = environ.get('MPESA_PULL_REGISTER_URL') or f'{base_url}/pulltransactions/v1/register'
    response = requests.post(
        url,
        json=payload,
        headers={'Authorization': f'Bearer {access_token}'},
        timeout=30,
    )
    response.raise_for_status()
    return response.json()


def pull_paybill_transactions(start_date, end_date, offset=0):
    """Pull the paybill's transactions for a window, straight from Safaricom.

    The C2B confirmation callbacks only arrive once Safaricom enables
    always-on for the shortcode; this is the other direction — the church
    asks Safaricom what the paybill received — so a manual "send money to
    paybill" payment is readable here whether or not a callback was ever
    configured. Reconciliation pulls with it and records what the ledger
    has not seen (see the pull_mpesa_transactions command).

    Dates are 'YYYY-MM-DD HH:MM:SS' strings in Nairobi time; OffSetValue
    pages through a long window (the API caps each response, returning the
    next slice from the given offset). The API itself only keeps 48 hours
    of transactions and refuses a window longer than that, so callers ask
    for at most two days — the shortcode must first be registered with
    register_pull_url, or the query answers that it found nothing.
    """
    consumer_key = _setting('MPESA_CONSUMER_KEY')
    consumer_secret = _setting('MPESA_CONSUMER_SECRET')
    shortcode = _setting('MPESA_SHORTCODE')
    base_url = environ.get('MPESA_BASE_URL', 'https://sandbox.safaricom.co.ke')

    token_response = requests.get(
        f'{base_url}/oauth/v1/generate?grant_type=client_credentials',
        auth=(consumer_key, consumer_secret),
        timeout=15,
    )
    token_response.raise_for_status()
    access_token = token_response.json()['access_token']

    # The initiator credential is the same encrypted one the B2C payouts
    # use; the pull API names an initiator like they do.
    payload = {
        'Initiator': environ.get('MPESA_INITIATOR_NAME') or '',
        'SecurityCredential': environ.get('MPESA_SECURITY_CREDENTIAL') or '',
        'ShortCode': shortcode,
        'StartDate': start_date,
        'EndDate': end_date,
        'OffSetValue': str(offset),
    }
    response = requests.post(
        f'{base_url}/pulltransactions/v1/query',
        json=payload,
        headers={'Authorization': f'Bearer {access_token}'},
        timeout=30,
    )
    response.raise_for_status()
    return response.json()

