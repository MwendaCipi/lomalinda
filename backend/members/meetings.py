"""Meeting invitations: agenda capture, message rendering and delivery.

Board and church business meetings are the same job pointed at two audiences, and
``views.py`` carried two near-identical copies of it: parse the posted agenda list,
build a message, notify everyone, email everyone. The shared half — placeholders,
the East-Africa greeting, who counts as the audience, delivery — lives here so the
two meetings cannot drift apart again.
"""
from __future__ import annotations

import json
import re
from datetime import datetime
from zoneinfo import ZoneInfo

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.db.models import Q
from django.utils.dateparse import parse_date

from .models import ChurchNotification, ChurchSettings, format_clock

User = get_user_model()

# Members read invitations at 8 in the morning or at 9 in the evening, so the
# opening line is computed in church time rather than left as a stored phrase.
EAT = ZoneInfo('Africa/Nairobi')

DEFAULT_BOARD_INVITATION_MESSAGE = (
    '{greeting}, {name}. {church} is inviting you to a board meeting '
    'scheduled for {day}, {date} from {start_time} to {end_time}. '
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
        'date': meeting_date.strftime('%d %B %Y') if hasattr(meeting_date, 'strftime') else str(meeting_date),
        'start_time': format_clock(getattr(meeting, 'start_time', None)) or meeting_time_display(meeting),
        'end_time': format_clock(getattr(meeting, 'end_time', None)),
        'meeting_time': meeting_time_display(meeting),
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
    """Who the church considers a board member, per the configured board roles."""
    settings_obj = ChurchSettings.objects.first()
    configured_roles = (settings_obj.board_roles if settings_obj and settings_obj.board_roles
                        else ['elder', 'clerk', 'treasurer', 'finance', 'admin'])
    return User.objects.filter(is_active=True).filter(
        Q(member_profile__role__in=configured_roles) | Q(is_superuser=True) | Q(is_staff=True)
    ).distinct()


def meeting_audience(kind):
    if kind == BOARD_KIND:
        return board_audience()
    return User.objects.filter(is_active=True)


def broadcast_invitation(meeting, kind, church_name, template=None, notify_sms=True, notify_email=True):
    """Invite the audience: one in-app notification and one email per person.

    Emails go out one at a time because each carries its own greeting — the
    recipient's name — which also keeps the whole audience off every member's
    To: line.

    Returns ``(invited, emailed)`` so the caller can report what really happened.
    """
    if not (notify_sms or notify_email):
        return 0, 0

    template = template or invitation_template(kind)
    subject_kind = 'Church Board Meeting' if kind == BOARD_KIND else 'Church Business Meeting'
    audience = list(meeting_audience(kind))
    invited = emailed = 0

    for user in audience:
        message = render_message(template, invitation_context(meeting, user, church_name))
        ChurchNotification.objects.create(
            user=user,
            title=f'{subject_kind} Invitation: {meeting.title}',
            message=message,
        )
        invited += 1
        if notify_email and user.email:
            try:
                send_mail(
                    f'{subject_kind} Invitation: {meeting.title}',
                    message,
                    settings.DEFAULT_FROM_EMAIL,
                    [user.email],
                    fail_silently=True,
                )
                emailed += 1
            except Exception:
                pass

    return invited, emailed


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
