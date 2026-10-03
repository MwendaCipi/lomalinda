"""The choir reads Ensemble, as the church at Loma Linda calls it.

The department's code stays ``choir`` — every API path, role flag and audience
names it, and renaming the code would break each of them. Only the name a
member reads changes.
"""

from django.db import migrations


OLD_NAME = "Choir"
NEW_NAME = "Ensemble"


def rename(apps, schema_editor):
    Department = apps.get_model("members", "Department")
    Department.objects.filter(code="choir").update(name=NEW_NAME)


def unrename(apps, schema_editor):
    Department = apps.get_model("members", "Department")
    Department.objects.filter(code="choir").update(name=OLD_NAME)


class Migration(migrations.Migration):

    dependencies = [
        ("members", "0170_ambassadors_aym_unit"),
    ]

    operations = [
        migrations.RunPython(rename, unrename),
    ]
