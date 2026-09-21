from django.db import migrations

NEW_TEMPLATE = "Thank you {name} for contributing {amount} towards {purpose}. May God bless you more."
OLD_DEFAULT  = "Thank you for your faithful contribution to Loma Linda SDA Church. May God bless you abundantly!"


def update_receipt_message(apps, schema_editor):
    ChurchSettings = apps.get_model("members", "ChurchSettings")
    # Only update rows that still carry the old default — don't overwrite custom messages
    ChurchSettings.objects.filter(default_receipt_message=OLD_DEFAULT).update(
        default_receipt_message=NEW_TEMPLATE
    )


class Migration(migrations.Migration):

    dependencies = [
        ("members", "0062_add_district_field_conference_to_churchsettings"),
    ]

    operations = [
        migrations.RunPython(update_receipt_message, migrations.RunPython.noop),
    ]
