"""The daily sweep that ends fund drives when their end date passes.

Run by the server once a day (see the cron entry the deploy installs). A
drive names the day it closes; this retires every one whose day has gone, so
no desk has to remember to press End. Each drive is flipped once — the filter
asks only for those still live — so running the command twice, by hand or by
a second cron entry somebody added by mistake, changes nothing.

Members' records live in a church schema, so the work is done once per schema
(and once plainly where tenants are not in play, as in the tests):

    python manage.py close_ended_fund_drives                  # end what has closed
    python manage.py close_ended_fund_drives --date 2026-10-19
    python manage.py close_ended_fund_drives --dry-run         # list, change nothing
"""

from contextlib import nullcontext

from django.core.management.base import BaseCommand
from django.utils import timezone
from django.utils.dateparse import parse_date

from ...fund_drives import close_ended_fund_drives


class Command(BaseCommand):
    help = 'End every fund drive whose end date has passed.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--date', dest='date',
            help='The day to treat as today (YYYY-MM-DD). Defaults to today.',
        )
        parser.add_argument(
            '--dry-run', action='store_true',
            help='List what would be ended without changing anything.',
        )

    def handle(self, *args, **options):
        day = None
        if options.get('date'):
            day = parse_date(options['date']) or timezone.datetime.strptime(
                options['date'], '%Y-%m-%d'
            ).date()
        dry_run = options['dry_run']

        for schema_name, context in self._church_contexts():
            with context:
                if dry_run:
                    self.stdout.write(
                        f'[{schema_name}] would end {self._due(day)} drive(s).'
                    )
                    continue
                ended = close_ended_fund_drives(today=day)
                if ended:
                    self.stdout.write(f'[{schema_name}] ended {ended} drive(s).')

    @staticmethod
    def _due(day) -> int:
        """How many drives a run would end — the sweep's own filter, unwritten."""
        from ...models import FundraisingCampaign

        return FundraisingCampaign.objects.filter(
            is_active=True,
            end_date__isnull=False,
            end_date__lt=day or timezone.localdate(),
        ).count()

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
