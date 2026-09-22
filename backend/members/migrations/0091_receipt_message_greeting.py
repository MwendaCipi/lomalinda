"""Seed the receipt greeting into the configured default message.

The greeting used to be hard-coded in the sending code ("Dear {name},") and
invisible in Church Settings. The template is now the whole message, so the
shipped default gains the greeting line — and any tenant still carrying an
old greeting-less default gets it added. Templates that already mention the
giver are left untouched.
"""

from django.db import migrations, models


GREETING = "Dear {name},\n\n"
NEW_DEFAULT = (
    "Dear {name},\n\n"
    "Your contribution of {amount} towards {account} has been received. "
    "Thank you, and may God bless you abundantly"
)


def seed_greeting(apps, schema_editor):
    ChurchSettings = apps.get_model("members", "ChurchSettings")
    for row in ChurchSettings.objects.all():
        message = row.default_receipt_message or ""
        if message.lower().startswith("your contribution of"):
            # The old shipped default without the greeting.
            row.default_receipt_message = NEW_DEFAULT
        elif not message.lower().startswith("dear "):
            # A customized template: prepend only the greeting line.
            row.default_receipt_message = GREETING + message
        row.save(update_fields=["default_receipt_message"])


class Migration(migrations.Migration):
    dependencies = [("members", "0090_retire_generic_leader_role")]
    operations = [
        migrations.AlterField(
            model_name="churchsettings",
            name="default_receipt_message",
            field=models.TextField(blank=True, default=NEW_DEFAULT),
        ),
        migrations.RunPython(seed_greeting, migrations.RunPython.noop),
    ]
