import hashlib
import hmac
import json
import os
import time
from decimal import Decimal

import requests
from django.conf import settings


class StripeConfigurationError(Exception):
    pass


def _setting(name):
    value = os.getenv(name)
    if not value:
        raise StripeConfigurationError(f'Stripe is not configured: missing {name}.')
    return value


def create_checkout_session(contribution):
    secret_key = _setting('STRIPE_SECRET_KEY')
    amount_in_minor_units = int(Decimal(contribution.amount) * 100)
    response = requests.post(
        'https://api.stripe.com/v1/checkout/sessions',
        auth=(secret_key, ''),
        data={
            'mode': 'payment',
            'success_url': f'{settings.FRONTEND_URL}/support/financial?payment=success&session_id={{CHECKOUT_SESSION_ID}}',
            'cancel_url': f'{settings.FRONTEND_URL}/support/financial?payment=cancelled',
            'client_reference_id': str(contribution.id),
            'customer_email': contribution.donor_email or None,
            'line_items[0][price_data][currency]': contribution.currency.lower(),
            'line_items[0][price_data][product_data][name]': f'Church giving - {contribution.purpose}',
            'line_items[0][price_data][unit_amount]': amount_in_minor_units,
            'line_items[0][quantity]': 1,
            'metadata[contribution_id]': str(contribution.id),
            'metadata[purpose]': contribution.purpose,
        },
        timeout=20,
    )
    data = response.json()
    if not response.ok or not data.get('url'):
        raise ValueError(data.get('error', {}).get('message', 'The card checkout could not be created.'))
    return data


def verify_webhook_signature(payload, signature):
    secret = _setting('STRIPE_WEBHOOK_SECRET')
    parts = dict(item.split('=', 1) for item in signature.split(',') if '=' in item)
    timestamp = parts.get('t')
    provided_signature = parts.get('v1')
    if not timestamp or not provided_signature or abs(time.time() - int(timestamp)) > 300:
        return False
    signed_payload = f'{timestamp}.{payload.decode("utf-8")}'.encode('utf-8')
    expected_signature = hmac.new(secret.encode('utf-8'), signed_payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected_signature, provided_signature)


def parse_webhook(payload):
    return json.loads(payload.decode('utf-8'))
