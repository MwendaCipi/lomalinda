"""Blank the giver addresses the app once invented (see tenants 0005).

A gift recorded without an email could carry ``<username>@friend.church`` —
an address nobody receives. The row keeps its gift; it just stops claiming an
address it never had, so the treasurer's desk shows "No email on file" rather
than prefilling the send with a guess.
"""

from django.db import migrations


def blank_invented_addresses(apps, schema_editor):
    Contribution = apps.get_model('members', 'Contribution')
    Contribution.objects.filter(donor_email__iendswith='@friend.church').update(donor_email='')
    CashContribution = apps.get_model('members', 'CashContribution')
    CashContribution.objects.filter(giver_email__iendswith='@friend.church').update(giver_email='')


class Migration(migrations.Migration):
    dependencies = [
        ('members', '0198_baptismalclassentry_dailyword'),
    ]

    operations = [
        migrations.RunPython(blank_invented_addresses, migrations.RunPython.noop),
    ]
