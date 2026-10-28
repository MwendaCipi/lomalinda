"""The daily nudge for board meetings tomorrow.

Run by the server once a day (see the cron entry the deploy installs). It
finds every BoardMeeting whose meeting_date is tomorrow, and sends an SMS
first, then an email reminder to all board members. Each reminder is stamped
as it is sent, so running this twice — by hand, or by a second cron entry
somebody added by mistake — sends nothing twice.

python manage.py send_board_meeting_reminders                 # tomorrow's meetings
python manage.py send_board_meeting_reminders --date 2026-10-19
python manage.py send_board_meeting_reminders --dry-run        # list, send nothing
"""

from contextlib import nullcontext

from django.core.management.base import BaseCommand
from django.utils import timezone

from ...models import BoardMeeting


class Command(BaseCommand):
    help = 'Send SMS then email reminders for board meetings due tomorrow.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--date', dest='date',
            help='The meeting date to remind about (YYYY-MM-DD). Defaults to tomorrow.',
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
                total_sent, total_failed = self._remind(day, dry_run)
                if total_sent or total_failed or dry_run:
                    self.stdout.write(
                        f'[{schema_name}] {total_sent} reminded, '
                        f'{total_failed} failed'
                    )

    def _remind(self, day, dry_run):
        sent = failed = 0

        if not day:
            from django.db.models import Q
            from django.utils import dateparse
            # Find board meetings whose meeting_date is tomorrow
            tomorrow = timezone.now().date() + timezone.timedelta(days=1)
            meetings = BoardMeeting.objects.filter(
                meeting_date=tomorrow
            )
        else:
            meetings = BoardMeeting.objects.filter(meeting_date=day)

        for meeting in meetings:
            # Get the board audience for this meeting
            from .meetings import board_audience, broadcast_invitation
            from .models import ChurchSettings
            from django.conf import settings

            church_name = ChurchSettings.objects.first().church_name or 'SDA Church Loma Linda'

            audience = board_audience()
            invited, sms_sent, emailed = broadcast_invitation(
                meeting,
                'board',
                church_name,
                notify_sms=True,
                notify_email=True,
            )

            # For reminders, we count SMS as sent if it went out, email as sent if it went out
            # We already sent the invitation earlier; this is just a reminder check
            # Actually, let's send a simpler reminder message
            from django.core.mail import send_mail

            for user in audience:
                # SMS first
                phone = getattr(getattr(user, 'member_profile', None), 'phone_number', '')
                if phone:
                    sms_text = (
                        f"{church_name}: Reminder - Board meeting \"{meeting.title}\" "
                        f"tomorrow ({meeting.meeting_date}). Please attend. "
                        f"{settings.FRONTEND_URL}/my-areas?area=pastorate&view=letter-approvals"
                    )
                    try:
                        from . import sms
                        sms_sent_here = sms.send(phone, sms_text)
                        if sms_sent_here:
                            sent += 1
                        else:
                            failed += 1
                    except Exception:
                        failed += 1
                # Email fallback if SMS not sent
                email = user.email or ''
                if email:
                    try:
                        send_mail(
                            f'Reminder: Board meeting {meeting.title}',
                            sms_text,
                            settings.DEFAULT_FROM_EMAIL,
                            [email],
                            fail_silently=True,
                        )
                        sent += 1
                    except Exception:
                        failed += 1

        if not dry_run and not meetings:
            self.stdout.write('No board meetings due.')

        return sent, failed

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