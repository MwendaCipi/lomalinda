"""Send one text through the gateway, to prove the token works.

Configuring bulk SMS is guesswork until a message actually leaves and the
gateway answers. This command takes the same path a receipt or an announcement
takes — the configured endpoint, the token, the approved sender, the number
normalised to ``+254…`` — and reports the provider's own answer, so a mistyped
token, an empty credit balance or a sender the account was never granted is
found here rather than mid-broadcast.

    python manage.py send_test_sms --to 0712345678
    python manage.py send_test_sms --to +254712345678 --message "Hello"
"""

from django.core.management.base import BaseCommand, CommandError

from ...sms import api_url, configured, recipient, send


class Command(BaseCommand):
    help = "Send one test SMS through the configured gateway to verify the token."

    def add_arguments(self, parser):
        parser.add_argument('--to', required=True, help='Mobile number for the test message (07… or +254…).')
        parser.add_argument(
            '--message', default='',
            help='Text to send. Defaults to a short line saying the gateway works.',
        )

    def handle(self, *args, **options):
        if not configured():
            raise CommandError(
                'SMS is not configured. Set SMS_API_KEY to the token from the '
                'Ping Africa Bulk dashboard (Account Settings → API Tokens).'
            )
        phone = recipient(options['to'])
        if not phone:
            raise CommandError(
                f'{options["to"]!r} is not a usable Kenyan mobile number — '
                'give it as 0712345678 or +254712345678.'
            )

        message = options['message'] or (
            'Test SMS from the church app. If you received this, the SMS '
            'gateway is configured correctly.'
        )
        self.stdout.write(f'Sending through {api_url()} to {phone}…')
        if not send(phone, message):
            # send() has already logged the gateway's reason; repeat only where
            # the operator is looking, so they do not have to find the log.
            raise CommandError('The gateway refused the message — see the reason in the log above.')
        self.stdout.write(self.style.SUCCESS(f'Sent to {phone}.'))
