"""Rename the treasury accounts' M-Pesa references to the church's wording.

The short names squeezed out of migration 0102 read like machine truncations
on a Safaricom prompt — ``AdventMen``, ``ChildrenMin``, ``SabbathScho``. The
church calls these accounts by their own letters and words: AMO, AWM, Young
Adults, Children. The prompt carries the short reference and nothing else, so
the reference is what the giver reads; the long label beside it in the giving
form and the reports stays the ministry's proper name. The references that
lost characters mid-word are restored to what 0102 intended for them.
"""

from django.db import migrations

RENAMES = {
    # old name -> (new name, new description or None to keep the current one)
    'AdventMen': ('AMO', None),
    'AdventWomen': ('AWM', None),
    'ChildrenMin': ('Children', None),
    'AdventYouth': ('Young Adults', 'Young Adults Ministry'),
    'SabbathScho': ('SabbathSch', None),
    'PrayerMinis': ('Prayer', None),
    'Communicatio': ('Comm', None),
    'CombinedOff': ('Combined', None),
    'CampOfferin': ('CampOffer', None),
    'ChurchDevel': ('Dev', None),
    'StationDpt': ('Station', None),
}


def rename_accounts(apps, schema_editor):
    TreasuryAccount = apps.get_model('members', 'TreasuryAccount')
    for old, (new, description) in RENAMES.items():
        for account in TreasuryAccount.objects.filter(name=old):
            account.name = new
            if description:
                account.description = description
            account.save(update_fields=['name', 'description'])


def restore_old_names(apps, schema_editor):
    TreasuryAccount = apps.get_model('members', 'TreasuryAccount')
    for old, (new, description) in RENAMES.items():
        for account in TreasuryAccount.objects.filter(name=new):
            account.name = old
            if description:
                account.description = 'Adventist Youth Ministry'
            account.save(update_fields=['name', 'description'])


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0150_alter_churchevent_happened_on_alter_churchevent_id_and_more'),
    ]

    operations = [
        migrations.RunPython(rename_accounts, restore_old_names),
    ]
