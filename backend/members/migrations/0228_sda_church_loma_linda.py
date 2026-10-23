"""The church signs itself SDA Church Loma Linda now.

The stored name — seeded as "SDA Loma Linda, Meru" (and once "SDA Loma Linda
Meru", and once "Loma Linda SDA Church, Meru") — becomes "SDA Church Loma
Linda, Meru". This is the code-level name matching the word order the
printed documents already use (see ``pdf_church_name``), so every screen,
email and legal page reads the same paper the receipts do.

The sweep touches only the settings text a row still actually carries the
old word order in: the church's own name, the welcome line, the legal
pages. Anything the office typed without the old substring keeps its
wording.
"""

from django.db import migrations, models

OLD = 'SDA Loma Linda'
NEW = 'SDA Church Loma Linda'


def _sweep(church_settings, direction):
    """Replace ``direction``'s name occurrences in every settings text.

    Char and Text fields only — keys, coordinates and uploads have no
    church name in them to rewrite.
    """
    fields = [
        field.name for field in church_settings._meta.get_fields()
        if isinstance(field, (models.CharField, models.TextField))
    ]
    for row in church_settings.objects.all():
        updates = {}
        for name in fields:
            value = getattr(row, name)
            if value and OLD in value:
                updates[name] = value.replace(OLD, NEW) if direction == 'forward' else value.replace(NEW, OLD)
        if updates:
            for name, new_value in updates.items():
                setattr(row, name, new_value)
            row.save(update_fields=list(updates))


def rename_the_church(apps, schema_editor):
    _sweep(apps.get_model('members', 'ChurchSettings'), 'forward')


def restore_the_old_name(apps, schema_editor):
    _sweep(apps.get_model('members', 'ChurchSettings'), 'back')


class Migration(migrations.Migration):
    dependencies = [
        ('members', '0227_duty_leader_sentence'),
    ]

    operations = [
        migrations.RunPython(rename_the_church, restore_the_old_name),
    ]
