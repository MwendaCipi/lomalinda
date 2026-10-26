"""Blank the masked phone numbers Safaricom's confirmations once stored, then
send the receipts that could never leave.

For a while the C2B recorder kept any twelve digits Safaricom sent, masked
members included, so some completed paybill gifts carry a phone no receipt can
reach — the SMS gateway refuses it ("not a usable phone number") and the
receipt waits forever. This command drops those values from unreceipted rows
(a treasurer's own typed number, local format included, always normalises
clean and is never touched), attempts the pending receipt where the row still
names an email or a member, and lists the gifts still without any contact the
desk can reach — those need a real number typed at the resend desk.

Rows already receipted keep the number they were receipted with: the ledger
does not quietly rewrite history.
"""

from contextlib import nullcontext

from django.core.management.base import BaseCommand

from members.models import Contribution
from members.views import safe_mpesa_phone, send_contribution_receipt


class Command(BaseCommand):
    help = (
        'Blank masked M-Pesa phone numbers the confirmations stored and send '
        'the receipts they stranded.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Report the stranded gifts without changing anything.',
        )

    @staticmethod
    def _church_contexts():
        """Every church schema; a single plain pass where tenants are off."""
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
        blanked, delivered = 0, 0
        stranded = []
        for schema, context in self._church_contexts():
            with context:
                s_blanked, s_delivered, s_stranded = self._repair_schema(dry)
            blanked += s_blanked
            delivered += s_delivered
            if s_stranded and (dry or True):
                self.stdout.write(f'  ({schema})')
                for line in s_stranded:
                    self.stdout.write(f'  {line}')
            stranded.extend(s_stranded)
            if not s_stranded:
                self.stdout.write(f'  ({schema}) nothing stranded here')

        verb = 'would blank' if dry else 'blanked'
        summary = f'{verb} {blanked} masked number(s); {delivered} receipt(s) sent on the contact that remains.'
        if dry:
            self.stdout.write(self.style.WARNING(summary + ' (--dry-run: nothing changed)'))
        else:
            self.stdout.write(self.style.SUCCESS(summary))

    def _repair_schema(self, dry):
        """Sweep one church's ledger. Returns (blanked, delivered, stranded)."""
        rows = Contribution.objects.filter(
            payment_method='mpesa', status='completed', receipt_sent_at__isnull=True,
        ).exclude(phone_number='').order_by('id')

        blanked, delivered, stranded = 0, 0, []
        for row in rows:
            if safe_mpesa_phone(row.phone_number):
                # A real number — local format included — is somebody's typed
                # correction or a worked pull; it is not this command's to undo.
                continue
            inflicted = row.phone_number
            name = row.donor_name or (row.member.get_full_name() if row.member else 'no name')
            if dry:
                blanked += 1
                self.stdout.write(
                    f'would blank {inflicted!r} on #{row.pk} ({name}, KES {row.amount} {row.purpose!r}, {row.mpesa_receipt_number})'
                )
                continue
            row.phone_number = ''
            row.save(update_fields=['phone_number'])
            blanked += 1
            self.stdout.write(
                f'blanked {inflicted!r} on #{row.pk} ({name}, KES {row.amount} {row.purpose!r}, {row.mpesa_receipt_number})'
            )
            send_contribution_receipt(row)
            if row.receipt_sent_at:
                delivered += 1
                continue
            stranded.append(
                f'#{row.pk} {name} — KES {row.amount} {row.purpose!r}, receipt {row.mpesa_receipt_number}: '
                'no phone, no email, no member — type a number at the resend desk.'
            )
        return blanked, delivered, stranded
