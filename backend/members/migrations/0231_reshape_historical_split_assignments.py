"""The desk's split assignments, retold as splits.

Before the assignment fix, crediting a held payment across several accounts
wrote one treasury transaction per account but kept the giving ledger on a
single row — the first account's name, the payment's whole amount — so the
givings ledger and every receipt read the money as going to one account.
The rows assigned that way are reshaped here into the ledger's own split
shape: one line per account under one payment group, each carrying the
share its treasury transaction credits, the same shape a giver's own split
payment has always taken.

Guardrails: only a completed, assigned row splits; it must have no payment
group of its own; its reference must have credited two or more distinct
accounts; and the credits must name exactly the row's amount — anything
else is left alone rather than rewritten on a guess.
"""
from decimal import Decimal
import uuid

from django.db import migrations


#: The desk's own copy set, mirrored from AssignContributionAccountView.
COPY_FIELDS = (
    'member', 'donor_name', 'donor_email', 'giving_type', 'currency',
    'phone_number', 'payment_method', 'status', 'mpesa_receipt_number',
    'paid_at', 'campaign', 'card_assignment', 'honoree', 'honoree_name',
    'relationship', 'honoree_phone', 'anonymous',
)


def reshape_historical_split_assignments(apps, schema_editor):
    Contribution = apps.get_model('members', 'Contribution')
    TreasuryAccountTransaction = apps.get_model('members', 'TreasuryAccountTransaction')

    candidates = Contribution.objects.filter(
        payment_group__isnull=True, needs_review=False, status='completed',
    )
    for row in candidates.iterator():
        reference = row.mpesa_receipt_number or row.paystack_reference or f'CONTRIB-{row.pk}'
        credits = list(
            TreasuryAccountTransaction.objects.filter(
                reference=reference, transaction_type='credit', amount__gt=Decimal('0'),
            ).order_by('id')
        )
        distinct_accounts = {credit.account_id for credit in credits}
        credited_total = sum((credit.amount for credit in credits), Decimal('0'))
        if len(distinct_accounts) < 2 or credited_total != row.amount:
            continue

        group = uuid.uuid4()
        first = credits[0]
        row.payment_group = group
        row.purpose = first.account.name
        row.amount = first.amount
        row.save(update_fields=['payment_group', 'purpose', 'amount'])

        Contribution.objects.bulk_create([
            Contribution(
                **{field: getattr(row, field) for field in COPY_FIELDS},
                payment_group=group,
                purpose=credit.account.name,
                amount=credit.amount,
            )
            for credit in credits[1:]
        ])


def unreshape(apps, schema_editor):
    # Deliberately empty: there is no faithful inverse. Merging a group back
    # onto one row would also merge the giver's own split payments, and the
    # shares the desk typed are recorded only in the reshaped lines. A
    # rolled-back migration is left as it stands rather than rewritten here.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0230_departmentmessage'),
    ]

    operations = [
        migrations.RunPython(reshape_historical_split_assignments, unreshape),
    ]
