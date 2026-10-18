"""The daily reminder for the duties on the deaconate's rota.

Run by the server once a day (see the cron entry the deploy installs), the day
before the duty: every officer on tomorrow's line who holds an account gets the
bell in the app, a letter to their mailbox and a push to their devices. An
officer the desk typed by hand has no account, so there is nobody to ring —
the line is still on the rota, and the run says so rather than failing.

A line is stamped as it is reminded, so running this twice — by hand, or by a
second cron entry somebody added by mistake — rings nobody twice:

    python manage.py send_duty_reminders                  # tomorrow's duties
    python manage.py send_duty_reminders --days 3         # the next three days
    python manage.py send_duty_reminders --date 2026-11-06
    python manage.py send_duty_reminders --dry-run        # list, send nothing
    python manage.py send_duty_reminders --force          # ring a line again
"""

from contextlib import nullcontext

from django.core.management.base import BaseCommand
from django.utils import timezone

from ...duty import lines_due, reminder_recipients, send_duty_reminder


class Command(BaseCommand):
    help = 'Remind the officers rostered on the deaconate rota of their upcoming duty.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--date', dest='date',
            help='The day the run stands on (YYYY-MM-DD). Defaults to today.',
        )
        parser.add_argument(
            '--days', dest='days', type=int, default=1,
            help='How many days ahead to remind for: 1 is tomorrow. Defaults to 1.',
        )
        parser.add_argument(
            '--dry-run', action='store_true',
            help='List what would be sent without sending or stamping anything.',
        )
        parser.add_argument(
            '--force', action='store_true',
            help='Ring lines already reminded — a deliberate re-send, never the cron\'s.',
        )

    def handle(self, *args, **options):
        day = None
        if options.get('date'):
            day = timezone.datetime.strptime(options['date'], '%Y-%m-%d').date()
        days = max(int(options.get('days') or 1), 1)
        dry_run = options['dry_run']
        force = options['force']

        for schema_name, context in self._church_contexts():
            with context:
                summary = self._remind(day, days, dry_run, force)
                if summary['lines'] or dry_run:
                    self.stdout.write(
                        f"[{schema_name}] {summary['lines']} line(s): "
                        f"{summary['officers']} officer(s) reminded, "
                        f"{summary['letters']} letter(s), {summary['pushes']} push(es), "
                        f"{summary['paper_only']} with nobody to ring."
                    )

    def _remind(self, day, days, dry_run, force):
        church_name = self._church_name()
        summary = {'lines': 0, 'officers': 0, 'letters': 0, 'pushes': 0, 'paper_only': 0}
        lines = list(lines_due(on_date=day, days=days, include_reminded=force))
        if not lines:
            if not dry_run:
                self.stdout.write('No duty rota needs a reminder.')
            return summary

        for entry in lines:
            summary['lines'] += 1
            title = entry.title or entry.duty_type or 'Duty'
            recipients = reminder_recipients(entry)
            if dry_run:
                self.stdout.write(
                    f'would remind: {entry.duty_date} {title} — '
                    f'{len(recipients)} officer(s) with an account'
                )
                continue
            report = send_duty_reminder(entry, church_name, force=force)
            summary['officers'] += report['bell']
            summary['letters'] += report['letters']
            summary['pushes'] += report['pushes']
            if not report['recipients']:
                # A line written for the people the desk knows by name alone.
                summary['paper_only'] += 1
                self.stdout.write(
                    f'no account to remind: {entry.duty_date} {title}'
                )
            else:
                self.stdout.write(
                    f"reminded: {entry.duty_date} {title} — {report['recipients']} officer(s)"
                )
        return summary

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
