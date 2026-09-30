"""The letters a leadership change causes.

Two Church Settings templates — one welcoming whoever is newly seated into
their position, one thanking whoever the save replaced — edited beside the
receipts and meeting invitations.
"""

from django.db import migrations
import django.db.models.deletion


def seed_templates(apps, schema_editor):
    """New rows take the model defaults anyway; existing rows get them too."""
    ChurchSettings = apps.get_model("members", "ChurchSettings")
    for row in ChurchSettings.objects.all():
        if not row.default_appointment_message:
            row.default_appointment_message = (
                "{greeting}, {name}.\n\n"
                "You have been appointed to serve as {position} of {area} at {church}. "
                "May God bless you as you serve.\n\n"
                "{church}"
            )
        if not row.default_release_thank_you_message:
            row.default_release_thank_you_message = (
                "{greeting}, {name}.\n\n"
                "Thank you for serving as {position} of {area} at {church}. Your service "
                "has been a blessing, and the church is grateful. "
                "{successor} now takes up the role.\n\n"
                "{church}"
            )
        row.save(update_fields=["default_appointment_message", "default_release_thank_you_message"])


def unseed_templates(apps, schema_editor):
    ChurchSettings = apps.get_model("members", "ChurchSettings")
    ChurchSettings.objects.update(
        default_appointment_message="", default_release_thank_you_message=""
    )


class Migration(migrations.Migration):

    dependencies = [
        ("members", "0146_leader_assistant_roles"),
    ]

    operations = [
        migrations.AddField(
            model_name="churchsettings",
            name="default_appointment_message",
            field=models.TextField(
                blank=True,
                default=(
                    "{greeting}, {name}.\n\n"
                    "You have been appointed to serve as {position} of {area} at {church}. "
                    "May God bless you as you serve.\n\n"
                    "{church}"
                ),
            ),
        ),
        migrations.AddField(
            model_name="churchsettings",
            name="default_release_thank_you_message",
            field=models.TextField(
                blank=True,
                default=(
                    "{greeting}, {name}.\n\n"
                    "Thank you for serving as {position} of {area} at {church}. Your service "
                    "has been a blessing, and the church is grateful. "
                    "{successor} now takes up the role.\n\n"
                    "{church}"
                ),
            ),
        ),
        migrations.RunPython(seed_templates, unseed_templates),
    ]
