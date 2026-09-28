"""The daily nudge for pledges whose promised day is tomorrow.

Run by the server once a day (see the cron entry the deploy installs). It
first closes the pledges the members' own giving has already honoured, then
emails a reminder for every pledge still standing whose day falls tomorrow.
Each reminder is stamped as it is sent, so running this twice — by hand, or by
a second cron entry somebody added by mistake — sends nothing twice.

Members' records live in a church schema, so the work is done once per schema
(and once plainly where tenants are not in play, as in the tests):

    python manage.py send_pledge_reminders                 # tomorrow's pledges
    python manage.py send_pledge_reminders --date 2026-10-19
    python manage.py send_pledge_reminders --dry-run        # list, send nothing
"""

from contextlib import nullcontext

from django.core.management.base import BaseCommand
from django.utils import timezone

from ...pledges import (
    pledges_due_reminder,
    redeem_pledges_matched_by_giving,
    send_pledge_reminder,
)


class Command(BaseCommand):
    help = 'Email a reminder for pledges due tomorrow that have not been redeemed.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--date', dest='date',
            help='The promised day to remind about (YYYY-MM-DD). Defaults to tomorrow.',
        )
        parser.add_argument(
            '--dry-run', action='store_true',
            help='List what would be sent without sending or stamping anything.',
        )

    def handle(self, *args, **options):
        day = None
        if options.get('date'):
            day = timezone.datetime.strptime(options['date'], '%Y-%m-%d').date()
        dry_run = options['dry_run']

        for schema_name, context in self._church_contexts():
            with context:
                total_sent, total_failed, closed = self._remind(day, dry_run)
                if total_sent or total_failed or closed or dry_run:
                    self.stdout.write(
                        f'[{schema_name}] {total_sent} reminded, '
                        f'{total_failed} failed, {closed} closed by giving.'
                    )

    def _remind(self, day, dry_run):
        closed_by_giving = 0
        if not dry_run:
            # A gift already recorded closes the pledge before anything is sent.
            closed_by_giving = redeem_pledges_matched_by_giving()

        pledges = list(pledges_due_reminder(remind_on=day))
        sent = failed = 0
        for pledge in pledges:
            member = pledge.user
            line = f'{member.username} <{member.email}> — {pledge.pledge_amount}'
            if dry_run:
                self.stdout.write(f'would remind: {line}')
                continue
            if send_pledge_reminder(pledge, self._church_name()):
                sent += 1
                self.stdout.write(f'reminded: {line}')
            else:
                failed += 1
                self.stderr.write(f'failed: {line}')
        if not dry_run and not pledges:
            self.stdout.write('No pledges due for tomorrow.')
        return sent, failed, closed_by_giving

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

    @staticmethod
    def _church_name() -> str:
        # Imported here rather than at module level: views imports this app's
        # models, and a management command importing views at import time would
        # tie the two together for the sake of one string.
        from ...views import current_church_name

        return current_church_name()
