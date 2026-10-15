"""Send one test message through a transport, to prove the SMTP setup works.

Setting up an email relay is guesswork until something actually leaves the box
and comes back with the server's answer. This command opens the same connection
the app uses — the main mailbox by default, or any purpose's — sends one message
from the address that purpose speaks as, and reports which host answered, so a
ZeptoMail token, a mistyped mailbox or a sender address still missing from the
ZeptoMail agent is found here rather than mid-broadcast.

``--purpose treasury`` is the one to run after adding ``treasury@`` to the
ZeptoMail agent: it exercises the exact path a receipt takes.
"""
from django.conf import settings
from django.core.mail import EmailMessage, get_connection
from django.core.management.base import BaseCommand, CommandError

from config.mail_settings import DISPLAY_NAME, PURPOSES


class Command(BaseCommand):
    help = "Send one test email through the app's SMTP transport to verify the settings."

    def add_arguments(self, parser):
        parser.add_argument("--to", required=True, help="Recipient address for the test message.")
        parser.add_argument(
            "--purpose",
            choices=sorted(PURPOSES),
            help="Send as this purpose's address over its own transport "
            "(treasury, verify, info, announcement). Defaults to the main mailbox.",
        )
        parser.add_argument(
            "--announcement",
            action="store_true",
            help="Alias for --purpose announcement. Kept for the deployments whose "
            "runbook already names it.",
        )

    def _settings_for(self, purpose):
        """The resolved sender settings for one purpose, straight from the app."""
        entry = (getattr(settings, "MAIL_SENDERS", None) or {}).get(purpose)
        if not entry:
            raise CommandError(
                f"No settings resolved for the {purpose!r} purpose. "
                "Check that MAIL_SENDERS is built in settings.py."
            )
        return entry

    def handle(self, *args, **options):
        to = options["to"]
        purpose = options["purpose"] or ("announcement" if options["announcement"] else None)

        if purpose:
            label = f"the {purpose} purpose"
            resolved = self._settings_for(purpose)
            host = resolved["host"]
            port = resolved["port"]
            user = resolved["user"]
            password = resolved["password"]
            use_tls = resolved["use_tls"]
            from_email = resolved["from_email"]
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
            f"Sending through {label}: {host}:{port} "
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
            f"Test email from {DISPLAY_NAME}",
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
