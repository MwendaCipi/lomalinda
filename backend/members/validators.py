import re
from datetime import date
from rest_framework.exceptions import ValidationError
from django.utils import timezone


def validate_phone_number(value):
    if not value:
        return value
    cleaned = re.sub(r'[\s\-\(\)]', '', str(value))
    # Match Kenyan format (07... / 01... / +254... / 254...) or standard international phone (+X...)
    if not re.match(r'^\+?[0-9]{9,15}$', cleaned):
        raise ValidationError('Enter a valid phone number (e.g., 0712345678 or +254712345678).')
    return cleaned


def validate_national_id(value):
    if not value:
        return value
    cleaned = str(value).strip()
    if not re.match(r'^[0-9]{6,10}$', cleaned):
        raise ValidationError('National ID must be between 6 and 10 digits.')
    return cleaned


def validate_positive_amount(value):
    if value is not None and value <= 0:
        raise ValidationError('Amount must be greater than zero.')
    return value


def validate_past_or_today_date(value):
    if not value:
        return value
    today = timezone.localdate()
    if isinstance(value, date) and value > today:
        raise ValidationError('Date cannot be in the future.')
    return value


def validate_future_or_today_date(value):
    if not value:
        return value
    today = timezone.localdate()
    if isinstance(value, date) and value < today:
        raise ValidationError('Date cannot be in the past.')
    return value


def validate_text_min_length(value, min_length=3, field_label="Field"):
    if value is not None:
        trimmed = str(value).strip()
        if len(trimmed) < min_length:
            raise ValidationError(f'{field_label} must be at least {min_length} characters long.')
        return trimmed
    return value
