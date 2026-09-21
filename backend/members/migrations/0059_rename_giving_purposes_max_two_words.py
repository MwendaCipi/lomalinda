from django.db import migrations

RENAME_MAP = {
    'Children Ministry': 'Children',
    'Adventist Possibility Ministries (APM)': 'Possibility',
    'Adventist Possibility Ministries': 'Possibility',
    'Adventist Youth Ministries (AY)': 'Youth',
    'Adventist Youth Ministries': 'Youth',
    'Adventist Men Ministries (AMM)': 'Men',
    'Adventist Men Ministries': 'Men',
    'Adventist Women Ministries (AWM)': 'Women',
    'Adventist Women Ministries': 'Women',
    'Music & Choir Ministry': 'Choir',
    'Chaplaincy Ministry': 'Chaplaincy',
    'Personal Ministries': 'Personal',
    'Church Welfare Ministry': 'Welfare',
    'Family Life Ministry': 'Family Life',
    'Health Ministry': 'Health',
}

def rename_giving_purposes(apps, schema_editor):
    GivingPurpose = apps.get_model('members', 'GivingPurpose')
    Contribution = apps.get_model('members', 'Contribution')
    CashContribution = apps.get_model('members', 'CashContribution')

    for old_name, new_name in RENAME_MAP.items():
        GivingPurpose.objects.filter(name=old_name).update(name=new_name)
        Contribution.objects.filter(purpose=old_name).update(purpose=new_name)
        CashContribution.objects.filter(purpose=old_name).update(purpose=new_name)

def reverse_rename(apps, schema_editor):
    pass

class Migration(migrations.Migration):

    dependencies = [
        ('members', '0058_cashcontribution_entry_type_and_more'),
    ]

    operations = [
        migrations.RunPython(rename_giving_purposes, reverse_rename),
    ]
