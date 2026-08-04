import base64
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


def _normalize_phone(value):
    phone = value.replace(' ', '').replace('-', '')
    if phone.startswith('+254'):
        phone = phone[1:]
    elif phone.startswith('0'):
        phone = f'254{phone[1:]}'
    if not phone.isdigit() or not phone.startswith('254') or len(phone) != 12:
        raise ValueError('Enter a valid Kenyan M-Pesa number, for example 0712345678.')
    return phone


def initiate_stk_push(contribution):
    consumer_key = _setting('MPESA_CONSUMER_KEY')
    consumer_secret = _setting('MPESA_CONSUMER_SECRET')
    shortcode = _setting('MPESA_SHORTCODE')
    passkey = _setting('MPESA_PASSKEY')
    callback_url = _setting('MPESA_CALLBACK_URL')
    base_url = environ.get('MPESA_BASE_URL', 'https://sandbox.safaricom.co.ke')

    phone_number = _normalize_phone(contribution.phone_number)
    contribution.phone_number = phone_number
    contribution.save(update_fields=['phone_number'])

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
        'Amount': int(contribution.amount),
        'PartyA': phone_number,
        'PartyB': shortcode,
        'PhoneNumber': phone_number,
        'CallBackURL': callback_url,
        'AccountReference': f'LL-{str(contribution.id)[:8]}',
        'TransactionDesc': contribution.purpose,
    }
    response = requests.post(f'{base_url}/mpesa/stkpush/v1/processrequest', json=payload, headers={'Authorization': f'Bearer {access_token}'}, timeout=15)
    response.raise_for_status()
    result = response.json()
    if result.get('ResponseCode') != '0':
        raise RuntimeError(result.get('ResponseDescription', 'M-Pesa rejected the request.'))
    return result
