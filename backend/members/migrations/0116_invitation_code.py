import hashlib
import uuid

from django.db import migrations, models


def fill_codes(apps, schema_editor):
    """Give every existing invitation a unique code digest.

    Invitations that predate the code were emailed a link only, so no raw code
    for them was ever seen by anyone and there is nothing to preserve: each row
    gets a digest of a fresh random value that no one holds the original of.
    Those rows simply cannot be redeemed by code, which is the honest state —
    a resend issues a real link and code pair.
    """
    Invitation = apps.get_model('members', 'Invitation')
    for invitation in Invitation.objects.filter(code=''):
        invitation.code = hashlib.sha256(str(uuid.uuid4()).encode()).hexdigest()
        invitation.save(update_fields=['code'])


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0115_announcement_display_window'),
    ]

    operations = [
        migrations.AddField(
            model_name='invitation',
            name='code',
            field=models.CharField(default='', editable=False, max_length=64, help_text='SHA-256 hash of the short invitation code emailed beside the link'),
        ),
        migrations.RunPython(fill_codes, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='invitation',
            name='code',
            field=models.CharField(editable=False, max_length=64, unique=True, help_text='SHA-256 hash of the short invitation code emailed beside the link'),
        ),
    ]
