from django.db import migrations

OLD = "Thank you {name} for contributing {amount} towards {purpose}. May God bless you more."
NEW = "Thank you, {name}, for contributing {amount} towards {purpose}. May God bless you abundantly!"


def update_receipt_message(apps, schema_editor):
    ChurchSettings = apps.get_model("members", "ChurchSettings")
    ChurchSettings.objects.filter(default_receipt_message=OLD).update(
        default_receipt_message=NEW
    )


class Migration(migrations.Migration):

    dependencies = [
        ("members", "0063_update_default_receipt_message"),
    ]

    operations = [
        migrations.RunPython(update_receipt_message, migrations.RunPython.noop),
    ]
