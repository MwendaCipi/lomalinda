"""Stamp the addresses already on record as confirmed.

Every account that exists at this point either registered itself (where the
enrollment code proved the address) or was typed in by the office before the
confirmation step existed. Neither should suddenly be barred from signing in,
so every profile is stamped at the moment this column arrives; only accounts
created from here on have to confirm their address.
"""
from django.db import migrations, models
from django.utils import timezone


def stamp_existing_profiles(apps, schema_editor):
    MemberProfile = apps.get_model('members', 'MemberProfile')
    MemberProfile.objects.filter(email_verified_at__isnull=True).update(
        email_verified_at=timezone.now()
    )


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0255_leadership_change_request'),
    ]

    operations = [
        migrations.AddField(
            model_name='memberprofile',
            name='email_verified_at',
            field=models.DateTimeField(
                blank=True,
                null=True,
                help_text='When the member confirmed the email address on this account; office-typed accounts confirm it before their first sign-in',
            ),
        ),
        migrations.RunPython(stamp_existing_profiles, migrations.RunPython.noop),
    ]
