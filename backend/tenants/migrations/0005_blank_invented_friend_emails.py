"""Blank the addresses the app once invented for givers without one.

``ensure_giver_profile`` used to mint ``<username>@friend.church`` for a giver
who gave no email — a mailbox that cannot receive anything, stored where real
addresses live. Receipts addressed to it left the server and read as sent,
though nobody could receive them. The accounts stand where they were (their
gifts, profiles and phones are untouched); they simply carry no email now, so
nothing is ever addressed to a guess.
"""

from django.db import migrations


def blank_invented_addresses(apps, schema_editor):
    User = apps.get_model('auth', 'User')
    User.objects.filter(email__iendswith='@friend.church').update(email='')


class Migration(migrations.Migration):
    dependencies = [
        ('tenants', '0004_remove_google_identity'),
        # The User model itself: auth is a shared app, so this data pass and
        # the table it updates both live on the public schema.
        ('auth', '__first__'),
    ]

    operations = [
        migrations.RunPython(blank_invented_addresses, migrations.RunPython.noop),
    ]
