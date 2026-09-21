# Generated manually on 2026-09-21

import hashlib

from django.db import migrations, models


def seed_hash_tokens(apps, schema_editor):
    """Re-store every invitation token as a hash, as the new format expects.

    Tokens were previously stored raw, so each one is hashed exactly as the app
    will hash it afterwards — same SECRET_KEY salt, same digest — meaning every
    invitation link already in someone's inbox keeps working after the upgrade.
    The migration runs inside the deployed environment, where the secret is
    part of the settings, so hashing with it here is exact, not approximate.
    Status and expiry are left untouched.
    """
    from django.conf import settings as live_settings

    Invitation = apps.get_model('members', 'Invitation')

    for invitation in Invitation.objects.all().iterator():
        invitation.token = hashlib.sha256(
            f"{live_settings.SECRET_KEY}:invitation:{invitation.token}".encode()
        ).hexdigest()
        invitation.save(update_fields=['token'])


def restore_previous_format(apps, schema_editor):
    """Nothing sensible to restore: the original raw tokens are gone for good."""


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0081_remove_seeded_popup_announcement'),
    ]

    operations = [
        migrations.AddField(
            model_name='churchsettings',
            name='invitation_link_lifetime_days',
            field=models.PositiveIntegerField(default=7, help_text='How many days an emailed invitation link stays usable before it expires'),
        ),
        migrations.AlterField(
            model_name='invitation',
            name='token',
            field=models.CharField(help_text='SHA-256 hash of the invitation link token', max_length=64, editable=False, unique=True),
        ),
        migrations.RunPython(seed_hash_tokens, restore_previous_format),
    ]
