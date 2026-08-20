from django.db import migrations


def seed_ministry_giving_purposes(apps, schema_editor):
    GivingPurpose = apps.get_model('members', 'GivingPurpose')
    ministry_purposes = [
        'Children Ministry',
        'Adventist Possibility Ministries (APM)',
        'Adventist Youth Ministries (AY)',
        'Adventist Men Ministries (AMM)',
        'Adventist Women Ministries (AWM)',
        'Personal Ministries',
        'Adventist Muslim Relations (AMR)',
        'Music & Choir Ministry',
        'Chaplaincy Ministry',
        'Prayer Ministry',
        'Worship Ministry',
        'Church Welfare Ministry',
        'Family Life Ministry',
        'Health Ministry',
        'Pathfinders & Adventurers',
        'Communication & Media',
    ]
    for name in ministry_purposes:
        GivingPurpose.objects.get_or_create(name=name, defaults={'active': True})


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0038_testimony_ip_address_alter_supportsubmission_member'),
    ]

    operations = [
        migrations.RunPython(seed_ministry_giving_purposes, migrations.RunPython.noop),
    ]
