"""Request notices: who hears about a request, in whose words.

Every desk that takes a request from the public — join, prayer, visitation,
child dedication, welfare and membership transfer — ends the same way: somebody
has to answer it. Rather than six copies of "send the elders an email", the
wording, the audience and the delivery live here.

The wording is editable in church settings, with ``{placeholders}`` filled per
recipient ({greeting} is the East-Africa time of day, as in the meeting
invitations this borrows its vocabulary from), and the message carries a link
that opens the requests desk with that one request in view.
"""
from __future__ import annotations

from urllib.parse import quote

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail

from .meetings import eat_greeting, recipient_name, render_message
from .roles import ADMIN_ROLE

User = get_user_model()

# The shipped wording, used when the church has not written its own. Kept here
# as well as in the model default so an empty setting still sends a sentence
# rather than a blank letter.
DEFAULT_REQUEST_NOTIFICATION_MESSAGE = (
    '{greeting}, {user_name} has submitted a {request}. Log in to respond to it: {link}'
)
DEFAULT_MEMBERSHIP_APPROVAL_MESSAGE = (
    'Dear {name},\n\n'
    'Your request to join {church} has been approved. You can now sign in at {link} '
    'to take part in the life of the church.\n\n'
    'God bless you.'
)

# Offered to the settings screen so nobody has to guess a placeholder name —
# the tokens listed there are exactly the ones substituted here.
REQUEST_PLACEHOLDERS = (
    ('greeting', 'Good morning / Good afternoon / Good evening, in East Africa Time'),
    ('user_name', 'the name of the person who submitted the request'),
    ('request', 'what they submitted, e.g. "prayer request"'),
    ('link', 'a link that opens the requests desk with this request in view'),
    ('church', 'the church name from these settings'),
)
APPROVAL_PLACEHOLDERS = (
    ('name', "the member's first name"),
    ('church', 'the church name from these settings'),
    ('link', 'the sign-in page'),
)

# What the {request} token reads as, per desk. Lower case because it is always
# dropped into the middle of a sentence.
REQUEST_LABELS = {
    'join': 'join request',
    'prayer': 'prayer request',
    'visitation': 'visitation request',
    'dedication': 'child dedication request',
    'welfare': 'welfare request',
    'transfer': 'membership transfer request',
}

# Who answers the church's requests: its administrators and its elders. The
# elder roles take no assistants, and an administrator is a system role, so
# there is nothing to exclude here the way the board audience excludes
# assistants. A plain member's own request is not announced to them.
AUDIENCE_ROLE_CODES = frozenset({
    ADMIN_ROLE,
    'elder',
    'first_elder',
    'second_elder',
    'third_elder',
})


def request_audience():
    """Active accounts holding an administrative or eldership role."""
    from .models import MemberProfile

    audience_ids = set()
    for profile in MemberProfile.objects.select_related('user').filter(user__is_active=True):
        if set(profile.get_roles()) & AUDIENCE_ROLE_CODES:
            audience_ids.add(profile.user_id)
    return User.objects.filter(id__in=audience_ids, is_active=True).distinct()


def request_desk_link(kind, request_id):
    """The sign-in link that lands on the requests desk with one request open.

    The requests desk is behind the sign-in, so the link carries the
    destination rather than pointing at it directly — an elder reading the
    email on a phone may not be signed in yet.
    """
    destination = f'/administration?tab=requests&request={kind}-{request_id}'
    return f'{settings.FRONTEND_URL}/login?next={quote(destination, safe="")}'


def request_notification_template(settings_obj=None):
    from .models import ChurchSettings

    if settings_obj is None:
        settings_obj = ChurchSettings.objects.first()
    configured = (getattr(settings_obj, 'default_request_notification_message', '') or '').strip()
    return configured or DEFAULT_REQUEST_NOTIFICATION_MESSAGE


def membership_approval_template(settings_obj=None):
    from .models import ChurchSettings

    if settings_obj is None:
        settings_obj = ChurchSettings.objects.first()
    configured = (getattr(settings_obj, 'default_membership_approval_message', '') or '').strip()
    return configured or DEFAULT_MEMBERSHIP_APPROVAL_MESSAGE


def send_request_notification(kind, request_id, *, submitted_by, church_name, submitted_at=None):
    """Email the elders and administrators that a request is waiting.

    Returns how many letters left the building. A failure is never allowed to
    fail the member's request: the submission matters more than the notice.
    """
    label = REQUEST_LABELS.get(kind, 'request')
    template = request_notification_template()
    link = request_desk_link(kind, request_id)
    context_common = {
        'greeting': eat_greeting(),
        'user_name': (submitted_by or '').strip() or 'Someone',
        'request': label,
        'link': link,
        'church': church_name,
    }
    subject = f'New {label} from {context_common["user_name"]}'
    if submitted_at is not None:
        subject = f'{subject} · {submitted_at.strftime("%d %b %Y")}'

    sent = 0
    already_sent = set()
    for user in request_audience():
        address = (user.email or '').strip()
        # Two accounts can share one mailbox; that inbox gets one letter, not two.
        if not address or address.lower() in already_sent:
            continue
        already_sent.add(address.lower())
        message = render_message(template, context_common)
        try:
            send_mail(subject, message, settings.DEFAULT_FROM_EMAIL, [address], fail_silently=True)
            sent += 1
        except Exception:
            continue
    return sent


def send_membership_approval_email(user, *, church_name):
    """Tell a member their join request was approved, so they can sign in."""
    address = (getattr(user, 'email', '') or '').strip()
    if not address:
        return False
    context = {
        'name': recipient_name(user),
        'church': church_name,
        'link': f'{settings.FRONTEND_URL}/login',
    }
    body = render_message(membership_approval_template(), context)
    try:
        send_mail(
            f'Your request to join {church_name} has been approved',
            body,
            settings.DEFAULT_FROM_EMAIL,
            [address],
            fail_silently=True,
        )
        return True
    except Exception:
        return False


def notify_request_safely(kind, request_id, **kwargs):
    """Fire and forget: a notice must never break the request it announces."""
    try:
        return send_request_notification(kind, request_id, **kwargs)
    except Exception:
        return 0
