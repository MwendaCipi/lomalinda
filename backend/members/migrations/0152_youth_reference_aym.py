"""The youth account's reference reads AYM, as the church spells it.

Migration 0151 renamed the Adventist Youth Ministry account's reference to
'Young Adults'; the church's own letters for it are AYM — Adventist Youth
Ministries — so the prompt reads that instead. The label keeps the ministry's
proper name.
"""

from django.db import migrations


def set_aym(apps, schema_editor):
    TreasuryAccount = apps.get_model('members', 'TreasuryAccount')
    for account in TreasuryAccount.objects.filter(name='Young Adults'):
        account.name = 'AYM'
        account.description = 'Adventist Youth Ministry'
        account.save(update_fields=['name', 'description'])


def restore_young_adults(apps, schema_editor):
    TreasuryAccount = apps.get_model('members', 'TreasuryAccount')
    for account in TreasuryAccount.objects.filter(name='AYM'):
        account.name = 'Young Adults'
        account.description = 'Young Adults Ministry'
        account.save(update_fields=['name', 'description'])


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0151_treasury_account_mpesa_names'),
    ]

    operations = [
        migrations.RunPython(set_aym, restore_young_adults),
    ]
