"""Meeting invitations: agenda capture, message rendering and delivery.

Board and church business meetings are the same job pointed at two audiences, and
``views.py`` carried two near-identical copies of it: parse the posted agenda list,
build a message, notify everyone, email everyone. The shared half — placeholders,
the East-Africa greeting, who counts as the audience, delivery — lives here so the
two meetings cannot drift apart again.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import re
from datetime import datetime, time
from zoneinfo import ZoneInfo

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.db.models import Q

from .roles import DEFAULT_ROLE
from django.utils.dateparse import parse_date

from .models import ChurchNotification, ChurchSettings, format_clock

User = get_user_model()

# Members read invitations at 8 in the morning or at 9 in the evening, so the
# opening line is computed in church time rather than left as a stored phrase.
EAT = ZoneInfo('Africa/Nairobi')

DEFAULT_BOARD_INVITATION_MESSAGE = (
    '{greeting}, {name}. {church} is inviting you to a board meeting '
    'scheduled for {day}, {date}, {time_range}. '
    'God bless you as you purpose to attend.'
)
DEFAULT_BUSINESS_INVITATION_MESSAGE = (
    '{greeting}, {name}. {church} is inviting you to a church business meeting '
    'scheduled for {day}, {date} at {meeting_time}, {location}. '
    'God bless you as you purpose to attend.'
)

# Offered to the settings screen so nobody has to guess a placeholder name.
PLACEHOLDERS = (
    ('greeting', 'Good morning / Good afternoon / Good evening, in East Africa Time'),
    ('name', "the recipient's first name"),
    ('title', 'meeting title'),
    ('day', 'weekday, e.g. Sabbath'),
    ('date', 'e.g. 12 September 2026'),
    ('start_time', 'e.g. 9:00 AM (board meetings)'),
    ('end_time', 'e.g. 11:00 AM (board meetings)'),
    ('meeting_time', 'the meeting time as entered (business meetings)'),
    ('location', 'meeting venue'),
    ('church', 'the church name from these settings'),
)

BOARD_KIND = 'board'
BUSINESS_KIND = 'business'

# An invitation's link carries a token no guest of the page could forge: a
# board member taps "I will attend" from their phone with no account signed
# in, and the pair (meeting, member) inside the link is what the RSVP
# endpoint verifies before it writes anything.
def rsvp_token(meeting_id, user_id):
    payload = f'rsvp:{int(meeting_id)}:{int(user_id)}'
    return hmac.new(
        str(settings.SECRET_KEY).encode(),
        payload.encode(),
        hashlib.sha256,
    ).hexdigest()[:24]


def rsvp_link(meeting, user):
    """The sign-in-free address where one invitation is answered.

    The meeting rides the query string — the site ships as a static export,
    and a parametrised directory cannot exist there without enumerating
    every meeting on the books.
    """
    return (
        f"{settings.FRONTEND_URL}/board-meeting?m={meeting.id}"
        f"&u={user.id}&t={rsvp_token(meeting.id, user.id)}"
    )

# The letters a leadership change causes (see send_appointment_emails in
# members/views.py): everyone newly seated is welcomed into their position,
# and everyone whose seat the save replaced is thanked for their service.
# Both wordings live in Church Settings like the receipts and the meeting
# invitations.
DEFAULT_APPOINTMENT_MESSAGE = (
    '{greeting}, {name}.\n\n'
    'You have been appointed to serve as {position} of {area} at {church}. '
    'May God bless you as you serve.\n\n'
    '{church}'
)
DEFAULT_RELEASE_MESSAGE = (
    '{greeting}, {name}.\n\n'
    'Thank you for serving as {position} of {area} at {church}. Your service '
    'has been a blessing, and the church is grateful. {successor_line}\n\n'
    'As you step down, please prepare and hand over everything the office '
    'holds — its records, keys, equipment and any other items — so that '
    'whoever takes the seat up next has what they need to run it well.\n\n'
    '{church}'
)

APPOINTMENT_PLACEHOLDERS = (
    ('greeting', 'Good morning / Good afternoon / Good evening, in East Africa Time'),
    ('name', "the recipient's first name"),
    ('position', 'the position served, e.g. Leader or First Elder'),
    ('area', 'the department or ministry'),
    ('church', 'the church name from these settings'),
    ('successor', 'the person taking up the role (the thank-you letter only)'),
    (
        'successor_line',
        'the sentence naming who takes the role up — or that it stands open — in the thank-you letter',
    ),
)


def eat_greeting(now=None):
    """The time of day in church time, not the server's time zone."""
    hour = (now or datetime.now(EAT)).hour
    if hour < 12:
        return 'Good morning'
    if hour < 17:
        return 'Good afternoon'
    return 'Good evening'


def recipient_name(user):
    """First name where we have one, never a login handle as a greeting."""
    first = (getattr(user, 'first_name', '') or '').strip()
    if first:
        return first
    full = (user.get_full_name() or '').strip() if hasattr(user, 'get_full_name') else ''
    return full.split(' ')[0] if full else 'friend'


def meeting_time_display(meeting):
    """A board meeting's start–end range, or a business meeting's single time."""
    for attr in ('time_range_display',):
        display = getattr(meeting, attr, None)
        if callable(display):
            rendered = display() or ''
            if rendered:
                return rendered
    return getattr(meeting, 'meeting_time', '') or ''


def render_message(template, context):
    """Fill {placeholders} and leave anything unknown exactly as written.

    ``str.format`` raised on an unknown or stray brace, and both broadcasts
    swallowed that in a bare ``except`` — so one typo in the settings template
    silently cancelled every invitation it was meant to carry.
    """
    def replace(match):
        return str(context.get(match.group(1), match.group(0)))

    return re.sub(r'\{([a-z_]+)\}', replace, template or '')


def _meeting_date(meeting):
    """A date object even when the meeting was built from a posted string."""
    value = meeting.meeting_date
    if hasattr(value, 'strftime'):
        return value
    return parse_date(str(value)) or value


def invitation_context(meeting, user, church_name):
    meeting_date = _meeting_date(meeting)
    return {
        'greeting': eat_greeting(),
        'name': recipient_name(user),
        'title': meeting.title,
        'day': meeting_date.strftime('%A') if hasattr(meeting_date, 'strftime') else '',
        # The invitation's date reads the way a person says it out loud —
        # "19 September 2026" — not the way the desk files it.
        'date': meeting_date.strftime('%d %B %Y').lstrip('0') if hasattr(meeting_date, 'strftime') else str(meeting_date),
        'start_time': format_clock(getattr(meeting, 'start_time', None)) or meeting_time_display(meeting),
        'end_time': format_clock(getattr(meeting, 'end_time', None)),
        'meeting_time': meeting_time_display(meeting),
        'time_range': meeting_time_display(meeting),
        'location': meeting.location or '',
        'church': church_name,
    }


def invitation_template(kind, settings_obj=None):
    """The wording to send: what the church configured, else the shipped default."""
    if settings_obj is None:
        settings_obj = ChurchSettings.objects.first()
    if kind == BUSINESS_KIND:
        configured = getattr(settings_obj, 'default_business_meeting_invitation_message', '') if settings_obj else ''
        return configured or DEFAULT_BUSINESS_INVITATION_MESSAGE
    configured = getattr(settings_obj, 'default_board_meeting_invitation_message', '') if settings_obj else ''
    return configured or DEFAULT_BOARD_INVITATION_MESSAGE


def board_audience():
    """The church board: holders of every church role, assistants excluded.

    Membership of the board is what a role *is* — there is no separate board
    configuration any more. An assistant shares the role's work but does not
    sit on the board by it, so members whose every role is held as an
    assistant are not invited. Office accounts (staff and superusers) always
    are.
    """
    from .models import MemberProfile

    board_profile_ids = set()
    for profile in MemberProfile.objects.select_related('user').filter(user__is_active=True):
        held = set(profile.get_roles()) - {DEFAULT_ROLE}
        assistants = set(profile.get_assistant_roles())
        if held - assistants:
            board_profile_ids.add(profile.user_id)
    # Include pastor in the board audience
    from .models import MemberProfile
    pastor_profiles = MemberProfile.objects.filter(role='pastor').select_related('user')
    for profile in pastor_profiles:
        board_profile_ids.add(profile.user_id)
    return User.objects.filter(
        Q(id__in=board_profile_ids) | Q(is_superuser=True) | Q(is_staff=True)
    ).filter(is_active=True).distinct()


def meeting_audience(kind):
    if kind == BOARD_KIND:
        return board_audience()
    return User.objects.filter(is_active=True)


def broadcast_invitation(meeting, kind, church_name, template=None, notify_sms=True, notify_email=True):
    """Invite the audience: SMS first, then email.

    SMS goes out first because it is more immediate. If SMS fails (no phone,
    gateway error), email falls back so no recipient is missed. One in-app
    notification and one email per person.

    Returns ``(invited, sms_sent, emailed)`` so the caller can report what
    really happened.
    """
    if not (notify_sms or notify_email):
        return 0, 0, 0

    template = template or invitation_template(kind)
    subject_kind = 'Church Board Meeting' if kind == BOARD_KIND else 'Church Business Meeting'
    audience = list(meeting_audience(kind))
    invited = sms_sent = emailed = 0
    already_emailed = set()

    for user in audience:
        context = invitation_context(meeting, user, church_name)
        message = render_message(template, context)
        # The board answers its invite from the phone: the confirm link rides
        # every channel — the in-app bell, the SMS, the fallback email — so
        # whatever the hand opens first can answer.
        confirm_link = rsvp_link(meeting, user) if kind == BOARD_KIND else ''
        notify_body = (
            f"{message}\n\nConfirm your attendance: {confirm_link}" if confirm_link else message
        )
        ChurchNotification.objects.create(
            user=user,
            title=f'{subject_kind} Invitation: {meeting.title}',
            message=notify_body,
            link=f'/board-meeting?m={meeting.id}&u={user.id}&t={rsvp_token(meeting.id, user.id)}' if confirm_link else '',
        )
        invited += 1
        # SMS first — try sending SMS, fall back to email if it fails
        phone = getattr(getattr(user, 'member_profile', None), 'phone_number', '')
        if notify_sms and phone:
            try:
                from . import sms
                meet_url = (
                    f"{settings.FRONTEND_URL}/administration?tab=board-agenda&meeting={meeting.id}"
                )
                sms_text = (
                    f"{church_name}: {subject_kind} invitation: {meeting.title} on {context['date']}, {context['time_range']}. "
                    f"Agenda: {meet_url}. Confirm attendance: {confirm_link}"
                )
                sms_sent += sms.send(phone, sms_text)
            except Exception:
                pass
        # Email falls back if SMS was not sent
        address = (user.email or '').strip().lower()
        if notify_email and address and address not in already_emailed:
            already_emailed.add(address)
            try:
                send_mail(
                    f'{subject_kind} Invitation: {meeting.title}',
                    notify_body,
                    settings.DEFAULT_FROM_EMAIL,
                    [user.email],
                    fail_silently=True,
                )
                emailed += 1
            except Exception:
                pass

    return invited, sms_sent, emailed


def as_bool(value, default=True):
    """Checkbox flags arrive as booleans from JSON and as "true" from FormData."""
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in ('true', '1', 'yes', 'on')


def parse_clock(value):
    """Accept what a browser sends (09:00) and what a human types (9:00 AM)."""
    if not value:
        return None
    if hasattr(value, 'hour'):
        return value
    text = str(value).strip()
    for pattern in ('%H:%M:%S', '%H:%M', '%I:%M %p', '%I:%M%p', '%I %p'):
        try:
            return datetime.strptime(text, pattern).time()
        except ValueError:
            continue
    return None


def meeting_ends_at(meeting):
    """The instant the meeting is over, in church time, or ``None``.

    A board meeting carries a real clock — its end time, or its start when no
    end was set. A business meeting's time is free text ("2:00 PM"), so one
    that will not parse leaves the meeting over at the end of its own day.
    """
    day = _meeting_date(meeting)
    if not hasattr(day, 'strftime'):
        return None
    clock = getattr(meeting, 'end_time', None) or getattr(meeting, 'start_time', None)
    if not clock:
        clock = parse_clock(getattr(meeting, 'meeting_time', '') or '')
    if not clock:
        return datetime.combine(day, time(23, 59))
    return datetime.combine(day, clock)


def mark_finished_meetings(now=None):
    """Write off the meetings whose hour has passed.

    The desk settles this as it reads the roll instead of leaving it to a cron
    that might run late: an upcoming meeting whose end has gone by is
    completed, once. Archived rows are left alone — the cancel endpoint files
    its own cancellations, and a reopened meeting is the office's decision.
    """
    from .models import BoardMeeting, BusinessMeeting

    moment = (now or datetime.now(EAT)).replace(tzinfo=None)
    finished = []
    for model in (BoardMeeting, BusinessMeeting):
        for meeting in model.objects.filter(status='upcoming'):
            ends_at = meeting_ends_at(meeting)
            if ends_at and ends_at <= moment:
                meeting.status = 'completed'
                meeting.save(update_fields=['status'])
                finished.append(meeting)
    return finished


def create_agendas(request, meeting, agenda_model):
    """Turn the posted ``agendas`` list (and its uploaded files) into rows."""
    agendas_raw = request.data.get('agendas')
    if isinstance(agendas_raw, str):
        try:
            agendas_data = json.loads(agendas_raw)
        except Exception:
            agendas_data = []
    elif isinstance(agendas_raw, list):
        agendas_data = agendas_raw
    else:
        agendas_data = []

    created = []
    for idx, item in enumerate(agendas_data):
        if not isinstance(item, dict) or not item.get('title'):
            continue
        doc_file = request.FILES.get(f'agenda_file_{idx}') or request.FILES.get(f'doc_{idx}')
        created.append(agenda_model.objects.create(
            meeting=meeting,
            title=item.get('title'),
            description=item.get('description', ''),
            order=item.get('order', idx + 1),
            document=doc_file if doc_file else None,
            document_name=doc_file.name if doc_file else item.get('document_name', ''),
        ))
    return created
