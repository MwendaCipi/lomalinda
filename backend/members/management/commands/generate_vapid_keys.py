"""Generate (or replace) the church's VAPID key pair for web push.

Browsers refuse pushes from a server they cannot identify, so the site needs
an application key pair on record before "Enable notifications" can work.
The app creates the pair by itself the first time a browser asks for the key
(``members.push.ensure_vapid_keys``), so this command is for the two cases that
want a deliberate pair: reading the public key out for a device being set up by
hand, and rotating on purpose.

    python manage.py generate_vapid_keys

The keys land on the single ChurchSettings row; the public half is served to
browsers at /api/members/push/key/. Rotating the pair (running this again)
invalidates existing subscriptions — every device must re-enable afterwards.
"""
from django.core.management.base import BaseCommand

from ...push import generate_vapid_key_pair


class Command(BaseCommand):
    help = "Generate a VAPID key pair for web push and store it in Church settings."

    def handle(self, *args, **options):
        from members.models import ChurchSettings

        public_b64, private_pem = generate_vapid_key_pair()

        row = ChurchSettings.objects.first()
        if row is None:
            row = ChurchSettings.objects.create()
        row.vapid_private_key = private_pem
        row.vapid_public_key = public_b64
        row.save(update_fields=['vapid_private_key', 'vapid_public_key'])
        self.stdout.write(self.style.SUCCESS('VAPID keys generated and saved.'))
        self.stdout.write(f'Public key: {public_b64}')
