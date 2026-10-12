"""Remove M-Pesa payments the ledger recorded twice under one receipt.

One payment carries one receipt, but for a while the STK callback and the
statement pull each recorded on their own: a result that landed after the
treasurer pulled showed twice — once held for review and once completed —
and counted the money twice in the treasury. This command finds every
receipt carrying more than one standalone row, keeps the row the desk
should trust, takes the others off the ledger, and reverses any treasury
credit a duplicate wrote, so the balances say the truth again.

Split gifts are left untouched: their rows share one payment group by
design — one line per account, one payment, one receipt.
"""

from collections import defaultdict
from contextlib import nullcontext
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from members.models import Contribution, TreasuryAccount, TreasuryAccountTransaction


def _rank(row):
    """The order rows stand in when one must be kept: best first.

    The row closest to the truth survives — an assigned gift over a held
    shell, an attributed giver over an anonymous one, the push result (which
    knows the checkout id, the form's purpose and the member) over a
    statement row — and the oldest row wins any remaining tie.
    """
    return (
        row.needs_review,
        row.member_id is None,
        row.checkout_request_id is None,
        row.id,
    )


class Command(BaseCommand):
    help = 'Merge M-Pesa payments the ledger recorded twice under one receipt.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Report the duplicates without changing anything.',
        )

    @staticmethod
    def _church_contexts():
        """Every church schema; a single plain pass where tenants are off.

        Tenancy is detected rather than assumed: the test suite and any
        single-schema deployment drop django_tenants entirely, and there the
        work simply runs once, against the only schema there is.
        """
        try:
            from django_tenants.utils import get_tenant_model, schema_context

            tenants = list(get_tenant_model().objects.exclude(schema_name='public'))
        except Exception:
            return [('default', nullcontext())]
        if not tenants:
            return [('default', nullcontext())]
        return [(tenant.schema_name, schema_context(tenant.schema_name)) for tenant in tenants]

    def handle(self, *args, **options):
        dry = options['dry_run']
        removed_rows = 0
        reversed_credits = 0
        for schema, context in self._church_contexts():
            with context:
                schema_removed, schema_reversed = self._dedupe_schema(dry)
            removed_rows += schema_removed
            reversed_credits += schema_reversed
            if schema_removed:
                self.stdout.write(f'  ({schema})')

        verb = 'would remove' if dry else 'removed'
        summary = f'{verb} {removed_rows} duplicate row(s); {reversed_credits} duplicate credit(s) reversed.'
        if dry:
            self.stdout.write(self.style.WARNING(summary + ' (--dry-run: nothing changed)'))
        else:
            self.stdout.write(self.style.SUCCESS(summary))

    def _dedupe_schema(self, dry):
        """Run the dedupe once, inside one church's schema.

        Returns (rows removed, credits reversed) for that schema.
        """
        by_receipt = defaultdict(list)
        rows = Contribution.objects.filter(
            mpesa_receipt_number__isnull=False
        ).exclude(mpesa_receipt_number='').order_by('id')
        for row in rows:
            by_receipt[row.mpesa_receipt_number].append(row)

        removed_rows = 0
        reversed_credits = 0
        for receipt, group in sorted(by_receipt.items()):
            if len(group) < 2:
                continue
            # A split gift's lines share one payment group: several rows, one
            # payment, by design. Only standalone rows (no group) can be
            # duplicates of each other; a stray standalone row beside a real
            # split is ambiguous enough to leave for a human.
            standalone = [row for row in group if row.payment_group is None]
            if len(standalone) < 2:
                continue
            keep = min(standalone, key=_rank)
            doomed = [row for row in standalone if row.pk != keep.pk]
            names = ', '.join(
                f'#{row.pk} ({row.donor_name or "no name"}, {row.amount} {row.purpose!r}{", held" if row.needs_review else ""})'
                for row in doomed
            )
            self.stdout.write(
                f'{receipt}: keeping #{keep.pk} ({keep.donor_name or "no name"}, {keep.amount} '
                f'{keep.purpose!r}{", held" if keep.needs_review else ""}); removing {names}'
            )
            if dry:
                removed_rows += len(doomed)
                continue
            with transaction.atomic():
                for row in doomed:
                    if not row.needs_review:
                        reversed = self._reverse_credit(receipt, row)
                        reversed_credits += 1 if reversed else 0
                    row.delete()
                    removed_rows += 1

        return removed_rows, reversed_credits

    def _reverse_credit(self, receipt, row):
        """Take back the treasury credit this duplicate row wrote, if any.

        A duplicate that was credited left a matching credit transaction —
        same reference, same amount, on the account its purpose named. The
        credit is deleted, the balance comes back down, and a debit row
        records the reversal in the transaction log, so the account's
        history explains its own movement.
        """
        from members.treasury import account_for_purpose

        account = account_for_purpose(row.purpose)
        if account is None:
            return False
        credit = TreasuryAccountTransaction.objects.filter(
            account=account,
            transaction_type='credit',
            reference=receipt,
            amount=Decimal(str(row.amount)),
        ).order_by('-id').first()
        if credit is None:
            # Nothing credited under this receipt on that account — the
            # duplicate was held, or its credit cannot be told apart.
            return False
        credit.delete()
        account.balance = (account.balance or Decimal('0')) - Decimal(str(row.amount))
        account.save(update_fields=['balance'])
        TreasuryAccountTransaction.objects.create(
            account=account,
            transaction_type='debit',
            amount=Decimal(str(row.amount)),
            description=f'Reversal — duplicate payment {receipt} removed',
            reference=receipt,
        )
        return True
