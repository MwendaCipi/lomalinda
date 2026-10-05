"""Clean up expired enrollment requests that are older than a threshold.

Removes enrollment requests that have expired and were never completed,
keeping recent expired requests in case the user wants to retry.

Usage:
    python manage.py cleanup_expired_enrollment_requests           # default 30 days
    python manage.py cleanup_expired_enrollment_requests --days 7  # last week
    python manage.py cleanup_expired_enrollment_requests --dry-run # preview only
"""

from contextlib import nullcontext

from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta


class Command(BaseCommand):
    help = 'Remove expired enrollment requests older than the specified number of days'

    def add_arguments(self, parser):
        parser.add_argument(
            '--days',
            type=int,
            default=30,
            help='Remove enrollment requests expired more than this many days ago (default: 30)',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be deleted without actually deleting',
        )

    def handle(self, *args, **options):
        days = options['days']
        dry_run = options['dry_run']
        cutoff = timezone.now() - timedelta(days=days)

        for schema_name, context in self._church_contexts():
            with context:
                self._cleanup_schema(schema_name, days, cutoff, dry_run)

    def _cleanup_schema(self, schema_name, days, cutoff, dry_run):
        from ...models import EnrollmentRequest

        # Find expired enrollment requests older than the cutoff
        # Exclude completed requests (they represent successful enrollments)
        expired = EnrollmentRequest.objects.filter(
            expires_at__lt=cutoff,
            status__in=('verification_pending', 'pending', 'approved', 'rejected', 'expired'),
        )

        count = expired.count()

        if dry_run:
            self.stdout.write(self.style.WARNING(f'[{schema_name}] Would delete {count} expired enrollment requests older than {days} days:'))
            for req in expired[:10]:
                self.stdout.write(f'  - {req.email} (ID: {req.id}, status: {req.get_status_display()}, expired: {req.expires_at})')
            if count > 10:
                self.stdout.write(f'  ... and {count - 10} more')
            return

        if count == 0:
            self.stdout.write(self.style.SUCCESS(f'[{schema_name}] No expired enrollment requests to clean up.'))
            return

        # Delete them
        deleted, _ = expired.delete()
        self.stdout.write(self.style.SUCCESS(f'[{schema_name}] Successfully deleted {deleted} expired enrollment requests older than {days} days.'))

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
