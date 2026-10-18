"""The deaconate's duty rota, and the reminder that goes out before a duty.

The rota is the church's record of who serves when. Where the desk picked an
officer off the church's roll, the line carries the account behind the name —
and this module is what turns that into a notice: the bell in the app, the
letter to the officer's mailbox, and the push that wakes the phone. The daily
cron (``manage.py send_duty_reminders``) sends them the day before the duty.

An officer the desk typed by hand — a deacon who keeps no account in the
church's app — is still on the rota; there is simply nobody to ring, and the
line stays a paper record. Every line is stamped as it is reminded, so a
second run of the cron, or one run by hand, never rings the same duty twice.
"""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.utils import timezone

from .mailing import IDENTITY, connection_for, sender_for
from .models import ChurchNotification, DutyRota
from .push import push_to_user

#: Where a reminder's link lands: the deaconate's rota, where the duty is read.
DUTY_ROTA_LINK = '/administration?tab=deaconate-rota'


def duty_title(entry) -> str:
    """What a line is called on paper and on a phone.

    The desk names a duty more often than it does not, but the title is
    optional: a line without one reads by the part being served, and a bare
    date still reads as a duty.
    """
    return (entry.title or entry.duty_type or 'Duty').strip()


def duty_when(entry) -> str:
    """The day and the shift, as the reminder says them."""
    day = entry.duty_date.strftime('%A, %d %B %Y')
    shift = (entry.shift or '').strip()
    return f'{day} · {shift}' if shift else day


def rostered_officers(entry):
    """The officers on a line, whichever shape the desk wrote them in.

    Lines are read years after they were written, and a line written before
    the Add Officer modal carries bare names: both shapes come out as an
    officer dict, with the name always present and the rest when it was taken
    down.
    """
    for item in entry.assigned_team or []:
        if isinstance(item, dict):
            name = str(item.get('name') or '').strip()
            if name:
                yield {**item, 'name': name}
        elif isinstance(item, str) and item.strip():
            yield {'name': item.strip()}


def reminder_recipients(entry):
    """``[(officer, user)]`` for the officers on this line who hold an account.

    Only an officer picked from the roll carries a ``member_id``; a name typed
    by hand, or one whose account has since been closed, has nobody behind it
    and is left out — the rota still prints them, the cron simply passes on.
    """
    officers = list(rostered_officers(entry))
    ids = {officer.get('member_id') for officer in officers if officer.get('member_id')}
    if not ids:
        return []
    accounts = {
        user.pk: user
        for user in get_user_model().objects.filter(pk__in=ids, is_active=True)
    }
    return [
        (officer, accounts[officer['member_id']])
        for officer in officers
        if officer.get('member_id') in accounts
    ]


def reminder_message(entry, officer) -> str:
    """What one officer is being told, in the words the desk would use."""
    part = str(officer.get('role') or '').strip()
    lines = [f'You are rostered on the deaconate rota for {duty_title(entry)}.']
    lines.append(f'When: {duty_when(entry)}')
    if part:
        lines.append(f'Your part: {part}')
    lines.append('')
    lines.append('If you cannot serve that day, tell the deaconate desk so another officer can take it.')
    lines.append('The rota is here: /administration?tab=deaconate-rota')
    return '\n'.join(lines)


def reminder_subject(entry) -> str:
    return f'Duty reminder: {duty_title(entry)} — {entry.duty_date.strftime("%d %b")}'


def notify_officer(entry, officer, user, church_name: str = '') -> dict:
    """Ring one officer on one line: the bell, the letter, the phone.

    Each notice is its own try: a mailbox that refuses the letter must not
    stop the bell being written, and a phone with no subscription is the
    normal state rather than a failure. Returns what actually went.
    """
    report = {'bell': False, 'letter': False, 'push': 0}
    subject = reminder_subject(entry)
    body = reminder_message(entry, officer)
    if church_name:
        body = f'{body}\n\n{church_name}'

    try:
        ChurchNotification.objects.create(
            user=user, title=subject, message=body, link=DUTY_ROTA_LINK,
        )
        report['bell'] = True
    except Exception:  # a notice never breaks the run that sends it
        pass

    address = (getattr(user, 'email', '') or '').strip()
    if address:
        try:
            sent = send_mail(
                subject, body, sender_for(IDENTITY), [address],
                connection=connection_for(IDENTITY), fail_silently=True,
            )
            report['letter'] = bool(sent)
        except Exception:
            report['letter'] = False

    # A duty is a request to serve, not mass communication: it rides past the
    # announcement switch, exactly as the other duty notices do.
    try:
        report['push'] = push_to_user(
            user, title=subject, body=body.split('\n')[0], link=DUTY_ROTA_LINK,
        )
    except Exception:
        report['push'] = 0
    return report


def send_duty_reminder(entry, church_name: str = '', force: bool = False) -> dict:
    """Remind everyone on one line, and stamp it so it is not reminded again.

    Returns ``{'line', 'recipients', 'bell', 'letters', 'pushes', 'stamped'}``.
    ``force`` rings the line again even if it was already reminded — the
    desk's own re-send, never the cron's. A line with nobody to ring (or
    nobody who holds an account) is still stamped: there is nothing to send,
    and re-reading it every day would send nothing every day.
    """
    report = {
        'line': entry,
        'recipients': 0,
        'bell': 0,
        'letters': 0,
        'pushes': 0,
        'stamped': False,
    }
    if entry.reminder_sent_at and not force:
        return report

    recipients = reminder_recipients(entry)
    report['recipients'] = len(recipients)
    # Two officers can share one mailbox; that inbox gets one letter.
    written = set()
    for officer, user in recipients:
        sent = notify_officer(entry, officer, user, church_name)
        report['bell'] += 1 if sent['bell'] else 0
        address = (getattr(user, 'email', '') or '').strip().lower()
        if sent['letter'] and address not in written:
            written.add(address)
            report['letters'] += 1
        report['pushes'] += sent['push']

    entry.reminder_sent_at = timezone.now()
    entry.save(update_fields=['reminder_sent_at'])
    report['stamped'] = True
    return report


def lines_due(on_date=None, days: int = 1, include_reminded: bool = False):
    """The rota lines inside the reminder window, earliest duty first.

    ``days`` counts forward from ``on_date`` (today by default): 1 is the
    duty falling tomorrow, which is what the daily cron sends. A line already
    reminded is left out unless ``include_reminded`` asks for it — the cron's
    own run must never ring a Sabbath twice.
    """
    start = on_date or timezone.localdate()
    end = start + timedelta(days=max(int(days), 1))
    lines = DutyRota.objects.filter(duty_date__gt=start, duty_date__lte=end)
    if not include_reminded:
        lines = lines.filter(reminder_sent_at__isnull=True)
    return lines.order_by('duty_date', 'id')
