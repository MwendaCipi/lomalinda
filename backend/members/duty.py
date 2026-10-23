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
import re

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.utils import timezone

from . import sms
from .mailing import IDENTITY, connection_for, sender_for
from .meetings import eat_greeting, recipient_name, render_message
from .models import ChurchNotification, ChurchSettings, Department, DepartmentAssignment, DutyRota
from .push import push_to_user

#: The wording used when the church has not configured its own (see ChurchSettings).
DEFAULT_ASSIGNMENT_MESSAGE = (
    '{greeting}, {name}.\n\n'
    'You have been rostered for {duty} on {day}, {date} at {shift}. '
    'Your part: {role}.\n\n'
    'If you cannot serve that day, please notify the {desk} by sending a '
    'message through here {leader_chat_link} or contact the leader on '
    '{leader_phone}. {church}'
)
DEFAULT_REMINDER_MESSAGE = (
    '{greeting}, {name}. Tomorrow, {date}, at {shift} you are rostered for '
    '{duty}. Your part: {role}. If you cannot serve that day, notify the '
    '{desk} on {leader_chat_link} or call the leader on {leader_phone}. '
    'God bless you as you serve. {church}'
)
DEFAULT_PULPIT_ASSIGNMENT_MESSAGE = DEFAULT_ASSIGNMENT_MESSAGE
DEFAULT_MUSIC_ASSIGNMENT_MESSAGE = DEFAULT_ASSIGNMENT_MESSAGE

#: Where a reminder's link lands: the deaconate's rota, where the duty is read.
DUTY_ROTA_LINK = '/administration?tab=deaconate-rota'

#: The pulpit team's roster is kept on the Personal Ministries desk, so its
#: notices land there, on that desk's Pulpit Team view. The music department's
#: duties land the same way, on the music desk's Duties view.
PULPIT_ROTA_LINK = '/administration?dept=personal_ministries&view=pulpit-team'
MUSIC_ROTA_LINK = '/administration?dept=music&view=duties'


def rota_link(entry) -> str:
    """Where this line is read: the deaconate's rota, the pulpit's or music's view."""
    desk = getattr(entry, 'desk', '')
    if desk == 'pulpit':
        return PULPIT_ROTA_LINK
    if desk == 'music':
        return MUSIC_ROTA_LINK
    return DUTY_ROTA_LINK


#: Each desk keeps its rota on behalf of a real department — the one whose
#: leader the notices point to when an officer cannot serve.
DESK_DEPARTMENT_CODES = {
    DutyRota.DESK_DEACONATE: 'deaconate',
    DutyRota.DESK_PULPIT: 'personal_ministries',
    DutyRota.DESK_MUSIC: 'music',
}


def desk_name(desk: str) -> str:
    """The department a duty line speaks for, by name.

    The {desk} placeholder in the church's wording fills with this, so an
    officer is told to notify the actual ministry — "Music", "Personal
    Ministries", "Deaconate" — rather than whichever generic "duty desk"
    the template writer could not name. A desk whose department row is gone
    falls back to the generic name: a half-name beats none.
    """
    code = DESK_DEPARTMENT_CODES.get(desk or '')
    if not code:
        return ''
    row = Department.objects.filter(code=code, is_active=True).first()
    return row.name if row else ''


def desk_leader(desk: str):
    """The desk department's leader, with the two ways an officer reaches them.

    The leaders table (``DepartmentAssignment``) carries the desk's leader,
    whoever the church seated last. From them the notice takes a chat link
    (``/chat?dm=`` — a click opens the direct message with the leader in the
    church's own chat) and the leader's phone number for the days chat does
    not reach. Either may be missing — a leader without an account phone —
    and the caller drops whichever sentence stood on the missing pair.
    """
    code = DESK_DEPARTMENT_CODES.get(desk or '')
    if not code:
        return None
    assignment = (
        DepartmentAssignment.objects
        .filter(department__code=code, department__is_active=True, kind='leader')
        .select_related('member', 'member__member_profile')
        .order_by('id')
        .first()
    )
    if not assignment:
        return None
    leader = assignment.member
    profile = getattr(leader, 'member_profile', None)
    phone = (getattr(profile, 'phone_number', '') or '').strip()
    return {
        'name': recipient_name(leader),
        'phone': phone,
        'chat_link': f"{settings.FRONTEND_URL}/chat?dm={leader.pk}",
    }


#: What a line of each desk's rota is called when the desk names none — the
#: same text that desk's own save form writes into the title field, so a line
#: reads the same on its card, in a share and in the message an officer
#: receives. Without this an unnamed line reached the officer as a bare
#: "Duty", which says nothing about the rota they are being called to.
DESK_DEFAULT_TITLES = {
    DutyRota.DESK_PULPIT: 'Sabbath Pulpit Team',
    DutyRota.DESK_DEACONATE: 'Sabbath Duty Rota',
    DutyRota.DESK_MUSIC: 'Sabbath Music Duties',
}


def default_rota_title(desk: str) -> str:
    """What a line of this desk's rota is called when the desk named none."""
    return DESK_DEFAULT_TITLES.get(desk or '', 'Sabbath Duty Rota')


def duty_title(entry) -> str:
    """What a line is called on paper and on a phone.

    The desk names a duty more often than it does not, but the title is
    optional: a line without one reads by the part being served, and failing
    that by the rota it sits on rather than by nothing at all.
    """
    return (
        entry.title
        or entry.duty_type
        or default_rota_title(getattr(entry, 'desk', ''))
    ).strip()


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


def church_name_full(church_name: str = '') -> str:
    """The name a duty notice signs itself with: the full form, with "Church".

    A duty notice closes with the church's name, and that closing wants the
    name in full — "SDA Church Loma Linda" rather than the short "SDA Loma
    Linda" the app stores for screens. This is the same split the printed
    documents already make (see ``pdf_church_name``), applied to the name an
    officer is left with at the end of a text. A name the office already wrote
    with "Church", and a name without the SDA prefix, pass through untouched,
    so renaming the church keeps whatever wording was chosen.
    """
    from .pdf_generator import pdf_church_name

    return pdf_church_name(church_name)


def duty_context(entry, officer, user, church_name: str = '') -> dict:
    """The placeholder values one officer's duty message is filled with."""
    desk = getattr(entry, 'desk', '')
    leader = desk_leader(desk)
    return {
        'greeting': eat_greeting(),
        'name': recipient_name(user) if user is not None else (str(officer.get('name') or '').split(' ')[0] or 'friend'),
        'duty': duty_title(entry),
        'day': entry.duty_date.strftime('%A'),
        'date': entry.duty_date.strftime('%d %B %Y'),
        'shift': (entry.shift or '').strip(),
        'role': str(officer.get('role') or '').strip(),
        'desk': desk_name(desk) or 'church duty desk',
        'leader_name': leader['name'] if leader else '',
        'leader_chat_link': leader['chat_link'] if leader else '',
        'leader_phone': leader['phone'] if leader else '',
        'church': church_name,
    }


def duty_template(kind: str, desk: str = '') -> str:
    """The church's configured duty wording, else the shipped default.

    ``kind`` is ``'assignment'`` (sent when the officer is rostered) or
    ``'reminder'`` (the day-before SMS).  ``desk`` is ``'pulpit'``, ``'music'``
    or ``'deaconate'``; it selects the right field and default when the church
    has not written its own wording — each desk speaks its own, and the
    church may write any of them on its settings.
    """
    settings_obj = ChurchSettings.objects.first()
    if kind == 'reminder':
        field = 'default_duty_reminder_message'
        fallback = DEFAULT_REMINDER_MESSAGE
    elif desk == 'pulpit':
        field = 'default_pulpit_assignment_message'
        fallback = DEFAULT_PULPIT_ASSIGNMENT_MESSAGE
    elif desk == 'music':
        field = 'default_music_assignment_message'
        fallback = DEFAULT_MUSIC_ASSIGNMENT_MESSAGE
    else:
        field = 'default_duty_assignment_message'
        fallback = DEFAULT_ASSIGNMENT_MESSAGE
    configured = getattr(settings_obj, field, '') if settings_obj else ''
    return configured or fallback


def drop_part_sentence(template: str, wanted: tuple = ('{role}',)) -> str:
    """The template without the sentences that name what has not been filled.

    The desk rosters the day and its officers long before it knows who will
    stand where, and a line without a part is a normal line rather than a
    half-written one. Rendered as written, it reads "Your part: ." — a form
    nobody filled, sent to the officer's phone. So when the part is blank the
    sentence carrying ``{role}`` goes, and the rest reads whole. The same
    drop serves the leader's reach: a desk whose leader (or the leader's
    phone) is not on record loses the sentence that would have read "send a
    message through here  or contact the leader on ".

    Sentences alternate with the whitespace between them; a dropped sentence
    takes its trailing separator with it, so paragraphs stay paragraphs. A
    template that says nothing else is left as it is: an empty text helps
    nobody more than a stray full stop.
    """
    for placeholder in wanted:
        if placeholder not in (template or ''):
            continue
        parts = re.split(r'(?<=[.!?])(\s+)', template)
        kept = []
        skip_separator = False
        for index, part in enumerate(parts):
            if index % 2:
                if not skip_separator:
                    kept.append(part)
                skip_separator = False
                continue
            if placeholder in part:
                skip_separator = True
                continue
            kept.append(part)
        template = ''.join(kept) or template
    return template


def render_duty_message(kind: str, entry, officer, user=None, church_name: str = '') -> str:
    """One officer's notice, in the church's own words.

    Every send — the rostering notice, the day-before text, the bell, the
    letter — reads its wording through here, so a blank part is dropped the
    same way wherever the message goes out.
    """
    template = duty_template(kind, desk=getattr(entry, 'desk', ''))
    context = duty_context(entry, officer, user, church_name_full(church_name))
    if not context['role']:
        template = drop_part_sentence(template)
    if not (context['leader_chat_link'] and context['leader_phone']):
        # A desk with no reachable leader loses the sentence that names one,
        # rather than sending a half-dressed "contact ... on ."
        template = drop_part_sentence(template, ('{leader_chat_link}', '{leader_phone}'))
    return render_message(template, context)


def reminder_message(entry, officer, user=None, church_name: str = '') -> str:
    """What one officer is told the day before, in the church's own words."""
    return render_duty_message('reminder', entry, officer, user, church_name)


def assignment_message(entry, officer, user, church_name: str = '') -> str:
    """What one officer is told when the desk rosters them on a duty."""
    return render_duty_message('assignment', entry, officer, user, church_name)


def reminder_subject(entry) -> str:
    return f'Duty reminder: {duty_title(entry)} — {entry.duty_date.strftime("%d %b")}'


def assignment_subject(entry) -> str:
    return f'You are rostered: {duty_title(entry)} — {entry.duty_date.strftime("%d %b")}'


def officer_phone(officer, user) -> str:
    """The number to text: the one the desk wrote down, else the account's own."""
    typed = str(officer.get('phone') or '').strip()
    if typed:
        return typed
    profile = getattr(user, 'member_profile', None)
    return (getattr(profile, 'phone_number', '') or '').strip() if profile else ''


def notify_officer(entry, officer, user, church_name: str = '', kind: str = 'reminder') -> dict:
    """Ring one officer on one line: the bell, the letter, the text and the phone.

    ``kind`` picks the church's wording: ``'assignment'`` when the desk rosters
    them, ``'reminder'`` the day before. Each notice is its own try: a mailbox
    that refuses the letter, or a gateway that is down, must not stop the bell
    being written, and a phone with no subscription is the normal state rather
    than a failure. Returns what actually went.
    """
    report = {'bell': False, 'letter': False, 'sms': False, 'push': 0}
    subject = reminder_subject(entry) if kind == 'reminder' else assignment_subject(entry)
    body = render_duty_message(kind, entry, officer, user, church_name)

    phone = officer_phone(officer, user)
    if phone:
        try:
            report['sms'] = sms.send(phone, body)
        except Exception:
            report['sms'] = False

    try:
        ChurchNotification.objects.create(
            user=user, title=subject, message=body, link=rota_link(entry),
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
            user, title=subject, body=body.split('\n')[0], link=rota_link(entry),
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
        'texts': 0,
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
        sent = notify_officer(entry, officer, user, church_name, kind='reminder')
        report['bell'] += 1 if sent['bell'] else 0
        report['texts'] += 1 if sent['sms'] else 0
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
