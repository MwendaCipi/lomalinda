"""Send one test message through a transport, to prove the SMTP setup works.

Setting up an email relay is guesswork until something actually leaves the box
and comes back with the server's answer. This command opens the same connection
the app uses — the main mailbox by default, the announcement broadcast's relay
with ``--announcement`` — sends one message, and reports which host answered, so
a ZeptoMail token or a mistyped mailbox is found here rather than mid-broadcast.
"""
from django.conf import settings
from django.core.mail import EmailMessage, get_connection
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Send one test email through the app's SMTP transport to verify the settings."

    def add_arguments(self, parser):
        parser.add_argument("--to", required=True, help="Recipient address for the test message.")
        parser.add_argument(
            "--announcement",
            action="store_true",
            help="Use the announcement broadcast's transport (ZeptoMail when configured) "
            "instead of the main mailbox.",
        )

    def handle(self, *args, **options):
        to = options["to"]
        if options["announcement"]:
            label = "announcement broadcast"
            host = settings.ANNOUNCEMENT_EMAIL_HOST
            port = settings.ANNOUNCEMENT_EMAIL_PORT
            user = settings.ANNOUNCEMENT_EMAIL_HOST_USER
            password = settings.ANNOUNCEMENT_EMAIL_HOST_PASSWORD
            use_tls = settings.ANNOUNCEMENT_EMAIL_USE_TLS
            from_email = settings.ANNOUNCEMENT_FROM_EMAIL
        else:
            label = "main mailbox"
            host = settings.EMAIL_HOST
            port = settings.EMAIL_PORT
            user = settings.EMAIL_HOST_USER
            password = settings.EMAIL_HOST_PASSWORD
            use_tls = settings.EMAIL_USE_TLS
            from_email = settings.DEFAULT_FROM_EMAIL

        if not host:
            raise CommandError(
                "No SMTP host is configured. Set EMAIL_HOST, or set ZEPTOMAIL_SEND_TOKEN "
                "(with ZEPTOMAIL_FROM_EMAIL) to route the broadcast through ZeptoMail."
            )

        self.stdout.write(
            f"Sending through the {label}: {host}:{port} "
            f"as {user or '(no username)'}, TLS {'on' if use_tls else 'off'}, "
            f"from {from_email}"
        )

        connection = get_connection(
            host=host,
            port=port,
            username=user,
            password=password,
            use_tls=use_tls,
            timeout=settings.EMAIL_TIMEOUT,
            fail_silently=False,
        )
        message = EmailMessage(
            "Test email from SDA Loma Linda",
            "This is a test message sent by `manage.py send_test_email` to check "
            "that the church's email settings work. If you received it, the transport "
            "is configured correctly.",
            from_email,
            [to],
            connection=connection,
        )
        try:
            message.send(fail_silently=False)
        except Exception as exc:  # noqa: BLE001 — surface the server's answer to the operator
            raise CommandError(f"The server refused the message: {exc}") from exc

        self.stdout.write(self.style.SUCCESS(f"Sent to {to} via {host}."))
