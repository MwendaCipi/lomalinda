import requests
from django.core.management.base import BaseCommand, CommandError

from members.mpesa import MpesaConfigurationError, register_pull_url


class Command(BaseCommand):
    help = (
        "Register the church's shortcode with Safaricom's Pull Transactions "
        "API so the treasury can ask what the paybill received. Safaricom "
        "keeps this registration forever (a second run answers 1001, "
        "\"ShortCode already Registered\"), so run it once per environment. "
        "Reads MPESA_PULL_NOMINATED_NUMBER and MPESA_PULL_CALLBACK_URL "
        "unless overridden with --nominated-number / --callback-url."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--nominated-number',
            default=None,
            help="Safaricom MSISDN on the church's account (default: $MPESA_PULL_NOMINATED_NUMBER).",
        )
        parser.add_argument(
            '--callback-url',
            default=None,
            help='Where pull notifications are delivered (default: $MPESA_PULL_CALLBACK_URL).',
        )

    def handle(self, *args, **options):
        nominated = (options['nominated_number'] or '').strip() or None
        callback = (options['callback_url'] or '').strip() or None

        try:
            result = register_pull_url(nominated_number=nominated, callback_url=callback)
        except MpesaConfigurationError as error:
            raise CommandError(
                f'{error} Set the MPESA_* environment variables (or pass '
                '--nominated-number / --callback-url) and try again.'
            ) from error
        except requests.RequestException as error:
            raise CommandError(f'Safaricom registration failed: {error}') from error

        self.stdout.write(self.style.SUCCESS('Shortcode registered for M-Pesa pulls.'))
        for key, value in (result or {}).items():
            self.stdout.write(f'  {key}: {value}')
