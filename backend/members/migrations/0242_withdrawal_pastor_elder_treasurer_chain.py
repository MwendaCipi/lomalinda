"""The withdrawal chain now runs Pastor → Elder → Treasurer.

The old design set a treasurer gate first — the "first read" an elder waited
behind — and put the pastor's approval last, before the release. The church
asked for the fixed order the three offices actually follow: the pastor
blesses first, the elder second, and the treasurer's release (the debit) is
the third. No office may approve before the one ahead of them has, and all
three may decline at any point.

In-flight rows are remapped by the state they were left in, so nothing
requires re-asking what the chain has already answered:
  * ``treasurer_approved`` (the old first read) restarts at the head — the
    first gate is the pastor's now, so the read is cleared.
  * ``elder_approved`` rows waiting on the old pastoral final approval are
    also restarted at the head, their elder clearance cleared so it can be
    given again in the new order.
  * ``pastor_approved`` rows had already passed both the old elder gate and
    the old final approval, so they land at ``elder_approved`` — the state
    that waits on the treasury's release, exactly where they were.
  * Released rows carry the treasurer's name on the release itself.
"""

from django.db import migrations, models
from django.db.models import F


def map_old_chain(apps, schema_editor):
    Withdrawal = apps.get_model('members', 'DepartmentWithdrawalRequest')

    # Old first read: back to the head of the chain, the read itself cleared —
    # the pastor's blessing is what comes first now.
    Withdrawal.objects.filter(status='treasurer_approved').update(
        status='pending', treasurer_approved_by=None, treasurer_approved_at=None,
    )

    # Old elder blessing, made before the old pastoral final approval:
    # restarted at the head too, so the chain can be walked in the new order.
    Withdrawal.objects.filter(status='elder_approved', pastor_approved_by__isnull=True).update(
        status='pending', elder_approved_by=None, elder_approved_at=None,
    )

    # Rows that had passed the old final approval already sit past both of the
    # new chain's first two gates; the state that waits on the treasury is
    # ``elder_approved``.
    Withdrawal.objects.filter(status='pastor_approved').update(status='elder_approved')

    # A released row is the treasurer's approval, wherever it predates the
    # gate fields: the decision names the officer who moved the money.
    Withdrawal.objects.filter(status='approved', treasurer_approved_by__isnull=True).update(
        treasurer_approved_by=F('decided_by'), treasurer_approved_at=F('decided_at'),
    )


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0241_dutyrota_eldership_desk'),
    ]

    operations = [
        migrations.RunPython(map_old_chain, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='departmentwithdrawalrequest',
            name='status',
            field=models.CharField(
                choices=[
                    ('pending', 'Pending'),
                    ('pastor_approved', 'Pastor Approved'),
                    ('elder_approved', 'Elder Approved'),
                    ('approved', 'Approved'),
                    ('declined', 'Declined'),
                    ('reversed', 'Reversed'),
                ],
                db_index=True,
                default='pending',
                max_length=20,
            ),
        ),
    ]
