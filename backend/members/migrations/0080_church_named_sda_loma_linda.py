# Generated manually on 2026-09-21

from django.db import migrations, models

OLD_SUBTEXT = (
    "Join SDA Loma Linda, Meru as we study God's Word, support one another, "
    "and reach out to our community with faith and compassion."
)
NEW_SUBTEXT = (
    "Join SDA Loma Linda as we study God's Word, support one another, "
    "and reach out to our community with faith and compassion."
)


def drop_meru_from_the_welcome_line(apps, schema_editor):
    """The website's welcome line names the church, not the town.

    'Meru' belongs in email, where the church signs itself 'SDA Loma Linda,
    Meru'; the site copy says 'SDA Loma Linda'. Only churches still on the old
    wording are rewritten — text the office has edited itself is left alone.
    """
    ChurchSettings = apps.get_model('members', 'ChurchSettings')
    ChurchSettings.objects.filter(clarion_call_subtext=OLD_SUBTEXT).update(clarion_call_subtext=NEW_SUBTEXT)


def restore_the_old_welcome_line(apps, schema_editor):
    ChurchSettings = apps.get_model('members', 'ChurchSettings')
    ChurchSettings.objects.filter(clarion_call_subtext=NEW_SUBTEXT).update(clarion_call_subtext=OLD_SUBTEXT)


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0079_clarion_call_subtext_sda_loma_linda'),
    ]

    operations = [
        migrations.AlterField(
            model_name='churchsettings',
            name='clarion_call_subtext',
            field=models.TextField(default=NEW_SUBTEXT),
        ),
        migrations.AlterField(
            model_name='enrollmentrequest',
            name='joining_mode',
            field=models.CharField(choices=[('baptism', 'Baptism'), ('membership_transfer', 'Membership transfer'), ('friend', 'Friend of SDA Loma Linda')], default='baptism', max_length=30),
        ),
        migrations.AlterField(
            model_name='invitation',
            name='account_type',
            field=models.CharField(choices=[('member', 'Member'), ('friend', 'Friend of SDA Loma Linda')], default='member', max_length=20),
        ),
        migrations.AlterField(
            model_name='memberprofile',
            name='account_type',
            field=models.CharField(choices=[('member', 'Member'), ('friend', 'Friend of SDA Loma Linda')], default='member', max_length=20),
        ),
        migrations.RunPython(drop_meru_from_the_welcome_line, restore_the_old_welcome_line),
    ]
