"""Announce the posts whose scheduled hour has arrived.

A post may be written ahead of its time: the composer takes a day and an hour,
and the feed does not show it — and nothing has been sent about it — until then.
This sweep is what rings it: every post that has come due and has never been
broadcast is announced by its own sharing channels (site, email, SMS, push)
exactly once. The stamp on the row is what keeps it to one: a re-run, or a
second cron entry by mistake, sends nothing twice.

    python manage.py send_scheduled_announcements
    python manage.py send_scheduled_announcements --dry-run   # list, send nothing
"""

from contextlib import nullcontext

from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = 'Announce the scheduled announcements whose day and hour have arrived.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run', action='store_true',
            help='List what would go out without sending or stamping anything.',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        for schema_name, context in self._church_contexts():
            with context:
                self._announce_due(dry_run, schema_name)

    def _announce_due(self, dry_run: bool, schema_name: str) -> None:
        from ...models import Announcement
        from ...views import broadcast_announcement_if_due

        now = timezone.now()
        due = (
            Announcement.objects.filter(publish_at__isnull=False, publish_at__lte=now)
            .filter(scheduled_broadcast_at__isnull=True)
            .order_by('publish_at')
        )
        for announcement in due:
            if dry_run:
                self.stdout.write(
                    f'[dry run] would announce "{announcement.title}" '
                    f'(scheduled {announcement.publish_at:%Y-%m-%d %H:%M})'
                )
                continue
            broadcast_announcement_if_due(announcement, schema_name=schema_name)
            self.stdout.write(
                f'Announced "{announcement.title}" '
                f'(scheduled {announcement.publish_at:%Y-%m-%d %H:%M})'
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
