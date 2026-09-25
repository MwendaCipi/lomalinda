"""Rename announcement visibility values.

``members`` becomes ``members_only`` and ``public`` becomes
``public_website`` — the old codes read as who may act on a post rather
than where it travels, and ``public`` invited confusion with the public
database schema. Rows keep their meaning; only the code changes.
"""

from django.db import migrations

RENAME = {'members': 'members_only', 'public': 'public_website'}


def rename_visibility_codes(apps, schema_editor):
    Announcement = apps.get_model('members', 'Announcement')
    for old_code, new_code in RENAME.items():
        Announcement.objects.filter(visibility=old_code).update(visibility=new_code)


class Migration(migrations.Migration):
    dependencies = [('members', '0118_announcement_audience_alter_announcement_expires_at_and_more')]
    operations = [migrations.RunPython(rename_visibility_codes, migrations.RunPython.noop)]
