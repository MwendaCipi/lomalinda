# Generated manually on 2026-09-21

from django.db import migrations, models

OLD_DEFAULT = (
    "Join Loma Linda SDA Church, Meru as we study God's Word, support one another, "
    "and reach out to our community with faith and compassion."
)
NEW_DEFAULT = (
    "Join SDA Loma Linda, Meru as we study God's Word, support one another, "
    "and reach out to our community with faith and compassion."
)


def rename_in_the_subtext(apps, schema_editor):
    """The hero's welcome line named the church the old way on the live site.

    Only churches still on the old wording are rewritten — text the office has
    edited itself is left alone.
    """
    ChurchSettings = apps.get_model('members', 'ChurchSettings')
    ChurchSettings.objects.filter(clarion_call_subtext=OLD_DEFAULT).update(clarion_call_subtext=NEW_DEFAULT)


def restore_the_old_subtext(apps, schema_editor):
    ChurchSettings = apps.get_model('members', 'ChurchSettings')
    ChurchSettings.objects.filter(clarion_call_subtext=NEW_DEFAULT).update(clarion_call_subtext=OLD_DEFAULT)


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0078_church_name_uses_a_comma'),
    ]

    operations = [
        migrations.AlterField(
            model_name='churchsettings',
            name='clarion_call_subtext',
            field=models.TextField(default=NEW_DEFAULT),
        ),
        migrations.RunPython(rename_in_the_subtext, restore_the_old_subtext),
    ]
