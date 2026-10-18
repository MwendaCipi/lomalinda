"""Purge giving attempts that never became money, once they are thirty days old.

A cancelled PIN and a timed-out prompt are noise on the ledger: they carried
no money, receipted never, and grow into a backlog that hides the month the
desk is reviewing. The Failed tab can take one off by hand; this command is
the daily sweep that keeps the whole queue from ageing past usefulness.

What goes: financial contributions whose own desk already treats them as
removable — `failed` and `cancelled` (the same two the Failed tab counts),
created more than the retention window ago. Completed gifts are never
touched, and neither is a failed line whose payment carries a refund (those
are protected rows — the run skips them rather than fail).

A split attempt is one payment written as one line per account, so it is
removed whole or not at all: a payment group only goes when every line of it
is failed or cancelled and older than the window together.

Run by the server daily (see the cron entry the deploy installs). Safe to
run by hand or twice in a row — a row already gone is simply not there:

    python manage.py cleanup_failed_contributions              # last 30 days
    python manage.py cleanup_failed_contributions --days 7     # tighter window
    python manage.py cleanup_failed_contributions --dry-run    # list, remove nothing
"""

from contextlib import nullcontext

from django.core.management.base import BaseCommand
from django.db.models import ProtectedError
from django.utils import timezone
from datetime import timedelta


class Command(BaseCommand):
    help = 'Remove failed and cancelled giving attempts older than the specified number of days.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--days',
            type=int,
            default=30,
            help='Remove failed attempts created more than this many days ago (default: 30).',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be removed without actually removing it.',
        )

    def handle(self, *args, **options):
        days = options['days']
        dry_run = options['dry_run']
        cutoff = timezone.now() - timedelta(days=days)

        for schema_name, context in self._church_contexts():
            with context:
                self._cleanup_schema(schema_name, days, cutoff, dry_run)

    def _cleanup_schema(self, schema_name, days, cutoff, dry_run):
        from ...models import Contribution

        # What the Failed desk already treats as removable: never became
        # money, and older than the window. A refunded attempt is left alone —
        # its row is protected, and skipping it beats failing the whole run.
        attempts = Contribution.objects.filter(
            status__in=('failed', 'cancelled'),
            created_at__lt=cutoff,
            refunds__isnull=True,
        )

        # A split payment is one attempt on several lines. Whole payment or
        # nothing: the line of a payment that also holds a completed gift may
        # never go, nor may a group whose youngest line is still inside the
        # window.
        doomed = set(attempts.filter(payment_group=None).values_list('id', flat=True))
        groups = set(attempts.exclude(payment_group=None).values_list('payment_group', flat=True))
        for group in groups:
            lines = Contribution.objects.filter(payment_group=group)
            still_money = lines.exclude(status__in=('failed', 'cancelled'))
            too_young = lines.filter(created_at__gte=cutoff)
            refunded = lines.filter(refunds__isnull=False)
            if still_money.exists() or too_young.exists() or refunded.exists():
                continue
            doomed.update(lines.values_list('id', flat=True))

        if dry_run:
            self.stdout.write(self.style.WARNING(
                f'[{schema_name}] Would remove {len(doomed)} failed givings older than {days} days.'
            ))
            for row in Contribution.objects.filter(pk__in=doomed).order_by('created_at')[:5]:
                self.stdout.write(
                    f'  - {row.get_status_display()} {row.amount} {row.purpose} '
                    f'(ID: {row.id}, {row.created_at.date()})'
                )
            if len(doomed) > 5:
                self.stdout.write(f'  ... and {len(doomed) - 5} more')
            return

        if not doomed:
            self.stdout.write(self.style.SUCCESS(f'[{schema_name}] No failed givings to clean up.'))
            return

        removed = 0
        try:
            deleted, _ = Contribution.objects.filter(pk__in=doomed).delete()
            removed = deleted
        except ProtectedError:
            # A protected row slipped past the filter (a refund raised after
            # the read, say). Fall back line by line so one locked row does
            # not hold the rest of the sweep hostage; what cannot go is
            # reported rather than swallowed in silence.
            for pk in sorted(doomed):
                try:
                    deleted, _ = Contribution.objects.filter(pk=pk).delete()
                    removed += deleted
                except ProtectedError:
                    self.stderr.write(
                        f'[{schema_name}] kept ID {pk}: a completed refund protects the row.'
                    )
        self.stdout.write(self.style.SUCCESS(
            f'[{schema_name}] Removed {removed} records of failed givings older than {days} days.'
        ))

    @staticmethod
    def _church_contexts():
        """Every church schema; a single plain pass where tenants are not in play.

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