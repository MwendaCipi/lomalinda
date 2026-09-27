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
    '{greeting}, {user_name} has submitted a {request}. Open the site to respond to it: {link}'
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

# Who answers the church's requests. Elders and the clerk take every desk —
# join, prayer, visitation, dedication, welfare, transfer. Administrators are
# deliberately noise-reduced: join requests are the ones that gate an account
# (the office cannot admit a member without them), so that is the only desk
# that reaches the admin role. An account holding both roles still hears both.
ELDER_ROLE_CODES = frozenset({'elder', 'first_elder', 'second_elder', 'third_elder'})
CLERK_ROLE_CODES = frozenset({'clerk'})


def request_audience(kind=''):
    """Active accounts that should hear about a request of this kind."""
    from .models import MemberProfile

    wanted = set(ELDER_ROLE_CODES) | set(CLERK_ROLE_CODES)
    if kind == 'join':
        wanted.add(ADMIN_ROLE)
    audience_ids = set()
    for profile in MemberProfile.objects.select_related('user').filter(user__is_active=True):
        if set(profile.get_roles()) & wanted:
            audience_ids.add(profile.user_id)
    return User.objects.filter(id__in=audience_ids, is_active=True).distinct()


def request_desk_link(kind, request_id):
    """The link that lands on the requests desk with one request open.

    Points straight at the desk, not at the sign-in page: a reader who is
    already signed in goes straight there, and one who is not is bounced to
    sign-in by the desk itself with the destination preserved.
    """
    return f'{settings.FRONTEND_URL}/administration?tab=requests&request={kind}-{request_id}'


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
    """Email the right office holders that a request is waiting.

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

    desk_link = f'/administration?tab=requests&request={kind}-{request_id}'
    # The letter opens with the desk named, all caps, before anything else:
    # an inbox scan should read the desk before the sender's name registers.
    body = f"{label.upper()}\n\n{render_message(template, context_common)}"

    sent = 0
    already_sent = set()
    audience = list(request_audience(kind))
    for user in audience:
        address = (user.email or '').strip()
        # Two accounts can share one mailbox; that inbox gets one letter, not two.
        if not address or address.lower() in already_sent:
            continue
        already_sent.add(address.lower())
        try:
            send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [address], fail_silently=True)
            sent += 1
        except Exception:
            continue

    # The same news also lands in the bell: an office holder who hasn't opened
    # their email still sees the request waiting in the app, and tapping it
    # opens the requests desk with that request highlighted.
    from .models import ChurchNotification

    ChurchNotification.objects.bulk_create([
        ChurchNotification(
            user=user,
            title=subject,
            message=body,
            link=desk_link,
        )
        for user in audience
    ])

    # And, for those who enabled it, the phone itself: an encrypted web push
    # through each browser's service worker, wakeable with the app closed.
    try:
        from .push import push_request_notification

        push_request_notification(kind, subject, body, desk_link)
    except Exception:
        pass
    return sent


def send_membership_approval_email(user, *, church_name, name=None):
    """Tell a member their join request was approved, so they can sign in.

    ``name`` is what the join form collected. The account itself may carry no
    name yet — plenty of people register and let the office fill the profile in
    — and greeting the person who typed their name a moment ago as "friend" is
    the one thing this letter must not do.
    """
    address = (getattr(user, 'email', '') or '').strip()
    if not address:
        return False
    context = {
        'name': (name or '').strip() or recipient_name(user),
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
