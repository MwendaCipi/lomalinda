"""Rename choir from Ensemble to Church Choir in the Department table."""

from django.db import migrations


def rename(apps, schema_editor):
    Department = apps.get_model("members", "Department")
    Department.objects.filter(code="choir").update(name="Church Choir")


def unrename(apps, schema_editor):
    Department = apps.get_model("members", "Department")
    Department.objects.filter(code="choir").update(name="Ensemble")


class Migration(migrations.Migration):

    dependencies = [
        ("members", "0216_duty_rota_reminders"),
    ]

    operations = [
        migrations.RunPython(rename, unrename),
    ]
