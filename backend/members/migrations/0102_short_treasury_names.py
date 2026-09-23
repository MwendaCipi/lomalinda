"""Give every treasury account a short M-Pesa-safe name and a readable label.

The 38 existing accounts were named for the ledger, not for M-Pesa: 'Adventist
Men Ministry' is 21 characters, and Safaricom's account reference tops out at
12. Each account now gets a short account name (what the M-Pesa prompt shows)
and keeps its long name as the description (what the giving form and reports
show). Tithe and Combined Offering keep their names — they already fit.
"""

from django.db import migrations

SHORT_NAMES = {
    'Adventist Men Ministry': 'AMM',
    'Adventist Women Ministry': 'AWM',
    'Adventist Youth Ministry': 'AYM',
    'Adventrers': 'Adventurers',
    'Ambassadors': 'Ambassadors',
    'Bibles': 'Bibles',
    'Camp Offering': 'CampOffer',
    'Camporee': 'Camporee',
    'Camp Out': 'CampOut',
    'Chairs': 'Chairs',
    'Chaplaincy': 'Chaplaincy',
    'Children Ministry': 'Children',
    'Choir': 'Choir',
    'Church Development': 'Dev',
    'Church Plot/Building': 'Plot',
    'Combined Offering': 'Combined',
    'Communication': 'Comm',
    'Deaconry': 'Deaconry',
    'Dorcas': 'Dorcas',
    'Education': 'Education',
    'Elders Kitty': 'Elders',
    'Evangelism': 'Evangelism',
    'Family Life': 'Family',
    'Farewell': 'Farewell',
    'Health': 'Health',
    'LCB': 'LCB',
    'Lunch': 'Lunch',
    'Msamaria': 'Msamaria',
    'Nyakundis': 'Nyakundis',
    'Pathfinders': 'Pathfinder',
    'Prayer Ministry': 'Prayer',
    'Rent': 'Rent',
    'Sabbath School': 'SabbathSch',
    'Station Development Fund': 'Station',
    'Stewardship': 'Steward',
    'Thanksgiving': 'Thanks',
    'Tithe': 'Tithe',
    'Welfare': 'Welfare',
}


def shorten_names(apps, schema_editor):
    TreasuryAccount = apps.get_model('members', 'TreasuryAccount')
    for account in TreasuryAccount.objects.all():
        old_name = account.name
        short = SHORT_NAMES.get(old_name)
        if short is None:
            # An account added after this migration was written: squeeze its
            # existing name into the 12 characters Safaricom allows, and fall
            # back to a generic reference if nothing legible survives.
            squeezed = ''.join(ch for ch in old_name if ch.isalnum())[:12]
            short = squeezed or 'GIVING'
        if len(short) > 12:
            short = short[:12]
        account.name = short
        account.description = old_name
        account.save(update_fields=['name', 'description'])


def unshorten_names(apps, schema_editor):
    TreasuryAccount = apps.get_model('members', 'TreasuryAccount')
    for account in TreasuryAccount.objects.all():
        if account.description:
            account.name = account.description
            account.save(update_fields=['name'])


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0101_treasury_accounts_give'),
    ]

    operations = [
        migrations.RunPython(shorten_names, unshorten_names),
    ]
