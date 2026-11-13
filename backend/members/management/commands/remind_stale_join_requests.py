"""Nudge the office about join requests nobody has answered for a day.

A join request is announced the moment it is made, and then it sits in the
queue as *Awaiting their email* until the person types the code we mailed them.
Life gets in the way: a code lands in a spam folder, a phone dies, someone
promises to finish it tonight. The row stays, the office has long since read the
first notice, and nobody looks again — the request quietly expires at 48 hours
and the person believes they asked to join and was ignored.

Run once a day by the server (see the cron entry the deploy installs), this
sweep finds the requests that have been waiting longer than a day, are still
inside their 48 hours, and have not already been chased, and sends the office
the same letter it got the first time — bell, email, push and SMS — worded as a
reminder rather than as news. Each row is stamped `reminded_at` as it is
chased, so a re-run, or a second cron entry somebody added by mistake, says
nothing twice.

    python manage.py remind_stale_join_requests              # a day or more
    python manage.py remind_stale_join_requests --hours 6    # a shorter leash
    python manage.py remind_stale_join_requests --dry-run    # list, send nothing
    python manage.py remind_stale_join_requests --force      # chase them again
"""

from contextlib import nullcontext
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = 'Remind the office about join requests still unverified after a day.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--hours', dest='hours', type=int, default=24,
            help='How long a request may sit unanswered before the nudge. Defaults to 24.',
        )
        parser.add_argument(
            '--dry-run', action='store_true',
            help='List what would be sent without sending or stamping anything.',
        )
        parser.add_argument(
            '--force', action='store_true',
            help='Chase requests that were already reminded once.',
        )

    def handle(self, *args, **options):
        hours = max(1, int(options['hours']))
        dry_run = bool(options['dry_run'])
        force = bool(options['force'])

        for schema_name, context in self._church_contexts():
            with context:
                sent, skipped = self._remind(hours, dry_run, force)
                if sent or skipped or dry_run:
                    self.stdout.write(
                        f'[{schema_name}] {sent} reminded, {skipped} already chased.'
                    )

    def _remind(self, hours, dry_run, force):
        from ...models import EnrollmentRequest
        from ...requests import notify_request_safely
        from ...views import current_church_name

        now = timezone.now()
        cutoff = now - timedelta(hours=hours)
        waiting = EnrollmentRequest.objects.filter(
            status='verification_pending',
            created_at__lte=cutoff,
            # Past its 48 hours the request is no longer something to chase:
            # the sweep's job is the people still able to finish, not the ones
            # whose window has closed.
            expires_at__gt=now,
        ).order_by('created_at')
        if not force:
            waiting = waiting.filter(reminded_at__isnull=True)

        church_name = current_church_name()
        sent = skipped = 0
        for enrollment in waiting:
            if enrollment.reminded_at is not None:
                skipped += 1
                continue
            name = f'{enrollment.first_name} {enrollment.last_name}'.strip() or enrollment.email
            days = max(1, (now - enrollment.created_at).days)
            reminder = f'waiting {days} day{"s" if days > 1 else ""} to confirm their email'
            if dry_run:
                self.stdout.write(f'would remind: {name} <{enrollment.email}> — {reminder}')
                sent += 1
                continue
            told = notify_request_safely(
                'join',
                enrollment.pk,
                submitted_by=name,
                church_name=church_name,
                submitted_at=enrollment.created_at,
                reminder=reminder,
            )
            # The stamp is written whether or not a letter left: a queue that
            # has nobody to tell (no office holder holds a role) would otherwise
            # be re-tried every morning forever.
            enrollment.reminded_at = timezone.now()
            enrollment.save(update_fields=['reminded_at'])
            sent += 1
            self.stdout.write(
                f'reminded {name} <{enrollment.email}> — {reminder} ({told} letters)'
            )
        return sent, skipped

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
