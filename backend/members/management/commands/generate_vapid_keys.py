"""Generate (or replace) the church's VAPID key pair for web push.

Browsers refuse pushes from a server they cannot identify, so the site needs
an application key pair on record before "Enable notifications" can work.
Run once per environment:

    python manage.py generate_vapid_keys

The keys land on the single ChurchSettings row; the public half is served to
browsers at /api/members/push/key/. Rotating the pair (running this again)
invalidates existing subscriptions — every device must re-enable afterwards.
"""
import base64

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Generate a VAPID key pair for web push and store it in Church settings."

    def handle(self, *args, **options):
        from members.models import ChurchSettings

        # Web Push VAPID is a P-256 (prime256v1) pair. The private key is kept
        # as PEM (what pywebpush accepts), the public key as the raw
        # base64url "application server key" browsers subscribe with.
        private_key = ec.generate_private_key(ec.SECP256R1())
        private_pem = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        ).decode('ascii')
        public_raw = private_key.public_key().public_bytes(
            encoding=serialization.Encoding.X962,
            format=serialization.PublicFormat.UncompressedPoint,
        )
        public_b64 = base64.urlsafe_b64encode(public_raw).rstrip(b'=').decode('ascii')

        row = ChurchSettings.objects.first()
        if row is None:
            row = ChurchSettings.objects.create()
        row.vapid_private_key = private_pem
        row.vapid_public_key = public_b64
        row.save(update_fields=['vapid_private_key', 'vapid_public_key'])
        self.stdout.write(self.style.SUCCESS('VAPID keys generated and saved.'))
        self.stdout.write(f'Public key: {public_b64}')
