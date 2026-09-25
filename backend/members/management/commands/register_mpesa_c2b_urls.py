import requests
from django.core.management.base import BaseCommand, CommandError

from members.mpesa import MpesaConfigurationError, register_c2b_urls


class Command(BaseCommand):
    help = (
        "Register the church's validation and confirmation callback URLs with "
        "Safaricom so direct paybill (C2B) payments reach this backend. Reads "
        "MPESA_C2B_VALIDATION_URL and MPESA_C2B_CONFIRMATION_URL unless "
        "overridden with --validation-url / --confirmation-url. Run once after "
        "deploying (or whenever the public URLs change); Safaricom keeps the "
        "last registration."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--validation-url',
            default=None,
            help='Validation callback URL (default: $MPESA_C2B_VALIDATION_URL)',
        )
        parser.add_argument(
            '--confirmation-url',
            default=None,
            help='Confirmation callback URL (default: $MPESA_C2B_CONFIRMATION_URL)',
        )

    def handle(self, *args, **options):
        validation_url = (options['validation_url'] or '').strip() or None
        confirmation_url = (options['confirmation_url'] or '').strip() or None

        try:
            result = register_c2b_urls(validation_url=validation_url, confirmation_url=confirmation_url)
        except MpesaConfigurationError as error:
            raise CommandError(
                f'{error} Set the MPESA_* environment variables (or pass '
                '--validation-url / --confirmation-url) and try again.'
            ) from error
        except requests.RequestException as error:
            raise CommandError(f'Safaricom registration failed: {error}') from error

        self.stdout.write(self.style.SUCCESS('C2B URLs registered with Safaricom.'))
        for key, value in (result or {}).items():
            self.stdout.write(f'  {key}: {value}')
