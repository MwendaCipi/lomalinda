# Generated manually on 2026-09-21

from django.db import migrations, models

OLD_DEFAULT = 'SDA Loma Linda Meru'
NEW_NAME = 'SDA Loma Linda, Meru'


def add_the_comma(apps, schema_editor):
    """Give the church its comma: 'SDA Loma Linda, Meru'.

    Only churches still sitting on the previous default are rewritten — a name
    the office typed itself keeps its own punctuation.
    """
    ChurchSettings = apps.get_model('members', 'ChurchSettings')
    ChurchSettings.objects.filter(church_name=OLD_DEFAULT).update(church_name=NEW_NAME)


def remove_the_comma(apps, schema_editor):
    ChurchSettings = apps.get_model('members', 'ChurchSettings')
    ChurchSettings.objects.filter(church_name=NEW_NAME).update(church_name=OLD_DEFAULT)


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0077_church_name_sda_loma_linda_meru'),
    ]

    operations = [
        migrations.AlterField(
            model_name='churchsettings',
            name='church_name',
            field=models.CharField(default=NEW_NAME, max_length=160),
        ),
        migrations.RunPython(add_the_comma, remove_the_comma),
    ]
