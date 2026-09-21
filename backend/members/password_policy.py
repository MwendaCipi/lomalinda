"""The church's password policy.

Django's stock validators reject passwords that merely *look* weak to a
computer — anything in a common-password list, anything numeric-only, or
anything judged too similar to the username. In practice that turned away
ordinary members who simply used their own name, so this project enforces four
plain rules instead:

* at least 8 characters
* at least one capital letter
* at least one number
* at least one symbol

Being similar to your name, or a common word, is deliberately allowed.
"""
import re

from django.core.exceptions import ValidationError

MIN_LENGTH = 8
EXAMPLE_PASSWORD = 'Ngari@2026'

REQUIREMENTS_TEXT = (
    f'Use at least {MIN_LENGTH} characters, including a capital letter, a number '
    f'and a symbol (for example {EXAMPLE_PASSWORD}).'
)

# (key, check, message shown to the person choosing the password)
RULES = (
    (
        'length',
        lambda value: len(value) >= MIN_LENGTH,
        f'Use at least {MIN_LENGTH} characters.',
    ),
    (
        'capital',
        lambda value: re.search(r'[A-Z]', value) is not None,
        'Add at least one capital letter (A-Z).',
    ),
    (
        'number',
        lambda value: re.search(r'[0-9]', value) is not None,
        'Add at least one number (0-9).',
    ),
    (
        'symbol',
        lambda value: re.search(r'[^A-Za-z0-9]', value) is not None,
        'Add at least one symbol, such as @ # $ ! or %.',
    ),
)


def password_problems(password):
    """Every unmet requirement, in the order the rules are listed above."""
    value = password or ''
    return [message for _key, check, message in RULES if not check(value)]


def password_is_valid(password):
    return not password_problems(password)


def validate_church_password(password, user=None):
    """Django-compatible validator: raises ValidationError listing what is missing.

    `user` is accepted and ignored so this can stand in for anything that
    expects Django's validator signature.
    """
    problems = password_problems(password)
    if problems:
        raise ValidationError(problems)


class ChurchPasswordValidator:
    """Registered in AUTH_PASSWORD_VALIDATORS, so Django admin, createsuperuser,
    set_password callers and DRF's validate_password all use these rules."""

    def validate(self, password, user=None):
        validate_church_password(password, user)

    def get_help_text(self):
        return REQUIREMENTS_TEXT
