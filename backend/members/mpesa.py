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
    response = requests.post(f'{base_url}/mpesa/c2b/v1/registerurl', json=payload, headers={'Authorization': f'Bearer {access_token}'}, timeout=15)
    response.raise_for_status()
    return response.json()

