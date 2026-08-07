import hashlib
import hmac
import json
import os
from decimal import Decimal

import requests
from django.conf import settings


class PaystackConfigurationError(Exception):
    pass


def _secret_key():
    value = os.getenv('PAYSTACK_SECRET_KEY')
    if not value:
        raise PaystackConfigurationError('Paystack is not configured: missing PAYSTACK_SECRET_KEY.')
    return value


def initialize_checkout(contribution):
    amount_in_minor_units = int(Decimal(contribution.amount) * 100)
    response = requests.post(
        'https://api.paystack.co/transaction/initialize',
        headers={'Authorization': f'Bearer {_secret_key()}', 'Content-Type': 'application/json'},
        json={
            'email': contribution.donor_email,
            'amount': amount_in_minor_units,
            'currency': contribution.currency,
            'reference': f'LLM-{contribution.id}',
            'callback_url': f'{settings.FRONTEND_URL}/support/financial?payment=success',
            'metadata': {
                'contribution_id': str(contribution.id),
                'purpose': contribution.purpose,
                'donor_name': contribution.donor_name,
            },
        },
        timeout=20,
    )
    data = response.json()
    if not response.ok or not data.get('status') or not data.get('data', {}).get('authorization_url'):
        raise ValueError(data.get('message', 'The card checkout could not be created.'))
    return data['data']


def verify_webhook_signature(payload, signature):
    expected = hmac.new(_secret_key().encode('utf-8'), payload, hashlib.sha512).hexdigest()
    return bool(signature) and hmac.compare_digest(expected, signature)


def parse_webhook(payload):
    return json.loads(payload.decode('utf-8'))
