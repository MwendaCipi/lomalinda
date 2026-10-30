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
from django.core.mail import EmailMultiAlternatives, send_mail

from .mailing import IDENTITY, connection_for, sender_for

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
# join, prayer, visitation, dedication, welfare, transfer — and so does the
# church pastor, whose office sits with the leaders. Administrators are
# deliberately noise-reduced to the two doors that decide who is a member:
# join requests (the office cannot admit one without them) and membership
# transfers (somebody is being received or sent away). The care desks —
# prayer, visitation, dedication, welfare — stay off their plate. An account
# holding both roles still hears both.
ELDER_ROLE_CODES = frozenset({'elder', 'first_elder', 'second_elder', 'third_elder'})
CLERK_ROLE_CODES = frozenset({'clerk'})
PASTOR_ROLE_CODES = frozenset({'pastor'})

# Desks whose work belongs to a department lead hear that lead too — the same
# roles each desk already admits as viewers. Chaplaincy walks the prayer and
# visitation desks; the children leader receives dedications; welfare belongs
# to the welfare leader. A request kind absent here routes to the office only.
# The desks that decide membership itself — a join ask and a membership
# transfer — reach the administrators along with the elders and the clerk.
JOIN_OR_TRANSFER_KINDS = frozenset({'join', 'transfer'})

DESK_EXTRA_ROLE_CODES = {
    'prayer': {'chaplaincy'},
    'visitation': {'chaplaincy'},
    'dedication': {'children_ministry'},
    'welfare': {'welfare_leader'},
}


def request_audience(kind='', audience=''):
    """Active accounts that should hear about a request of this kind.

    A prayer request may name who it is for — the elders' desk, the pastor, or
    the whole congregation — and that choice answers for itself: the desk it
    names is who is told. Every other request routes to the office roster.
    """
    from .models import MemberProfile

    if kind == 'prayer' and audience == 'church':
        # The whole congregation prays: every active account is told.
        return User.objects.filter(is_active=True).distinct()
    if kind == 'prayer' and audience == 'pastor':
        wanted = set(PASTOR_ROLE_CODES)
    elif kind == 'prayer' and audience == 'elders':
        wanted = set(ELDER_ROLE_CODES) | set(CLERK_ROLE_CODES) | DESK_EXTRA_ROLE_CODES.get('prayer', set())
    else:
        wanted = set(ELDER_ROLE_CODES) | set(CLERK_ROLE_CODES) | set(PASTOR_ROLE_CODES)
        # The administrators are deliberately noise-reduced to the two doors
        # that decide membership itself — everything else is the elders' and
        # the clerk's to answer.
        if kind in JOIN_OR_TRANSFER_KINDS:
            wanted.add(ADMIN_ROLE)
        wanted |= DESK_EXTRA_ROLE_CODES.get(kind, set())
    audience_ids = set()
    for profile in MemberProfile.objects.select_related('user').filter(user__is_active=True):
        if set(profile.get_roles()) & wanted:
            audience_ids.add(profile.user_id)
    return User.objects.filter(id__in=audience_ids, is_active=True).distinct()


def request_desk_tab(kind: str) -> str:
    """Which console tab answers a request of this kind.

    A join ask — someone new asking to join the church — answers from
    Administration's own Join Requests toggle, where every kind of join ask
    stands in one queue: the office either admits a person or it does not,
    and it should not have to remember which queue the person arrived in.
    Every other request is still filed in the Requests queue it was read from.
    """
    return 'join-requests' if kind == 'join' else 'requests'


def request_desk_link(kind, request_id):
    """The link that lands on the requests desk with one request open.

    Points straight at the desk, not at the sign-in page: a reader who is
    already signed in goes straight there, and one who is not is bounced
    to sign-in by the desk itself with the destination preserved.
    """
    return f'{settings.FRONTEND_URL}/administration?tab={request_desk_tab(kind)}&request={kind}-{request_id}'


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


def request_email_html(*, heading: str, body_text: str, link: str, church_name: str) -> str:
    """The request letter as email-client-safe HTML.

    The desk name leads in its own dark block, the sentence follows, and the
    destination becomes a button rather than a bare URL. Everything
    user-supplied is escaped — names arrive from public forms, and an
    unescaped name is HTML injection straight into an elder's inbox. If the
    sentence carries the link (the default wording does), the bare URL is
    lifted out of the text so the button is the one way through; a custom
    template without ``{link}`` simply keeps its full sentence.
    """
    import html as html_module

    body_html = html_module.escape(body_text).replace('\n', '<br />')
    stripped = body_html.replace(html_module.escape(link), '').rstrip()
    if stripped.endswith(':'):
        body_html = stripped
    button = (
        f'<a href="{html_module.escape(link, quote=True)}" '
        'style="display:inline-block;background:#b36b3c;color:#ffffff;text-decoration:none;'
        'font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;'
        'padding:10px 22px;border-radius:999px;">Open the requests desk</a>'
    )
    return (
        '<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#f7f4ee;">'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        'style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;'
        'overflow:hidden;border:1px solid #dfdbd1;">'
        '<tr><td style="background:#26352f;padding:14px 24px;">'
        f'<span style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;'
        f'letter-spacing:2px;color:#ffffff;">{html_module.escape(heading)}</span>'
        '</td></tr>'
        '<tr><td style="padding:24px;font-family:Georgia,serif;font-size:15px;line-height:24px;color:#26352f;">'
        f'{body_html}'
        f'<div style="margin-top:20px;">{button}</div>'
        '</td></tr>'
        '<tr><td style="padding:14px 24px;background:#faf9f5;border-top:1px solid #dfdbd1;'
        'font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#617068;">'
        f'{html_module.escape(church_name)} &middot; Sent to the office that answers this desk.'
        '</td></tr>'
        '</table></body></html>'
    )


def send_request_notification(kind, request_id, *, submitted_by, church_name, submitted_at=None, audience=''):
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
        subject = f'{subject} · {submitted_at.strftime("%d%m%Y")}'

    desk_link = f'/administration?tab={request_desk_tab(kind)}&request={kind}-{request_id}'
    full_link = request_desk_link(kind, request_id)
    # The letter opens with the desk named, all caps, before anything else:
    # an inbox scan should read the desk before the sender's name registers.
    body = f"{label.upper()}\n\n{render_message(template, context_common)}"
    html_body = request_email_html(
        heading=label.upper(),
        body_text=render_message(template, context_common),
        link=full_link,
        church_name=church_name,
    )

    sent = 0
    already_sent = set()
    listeners = list(request_audience(kind, audience))
    for user in listeners:
        address = (user.email or '').strip()
        # Two accounts can share one mailbox; that inbox gets one letter, not two.
        if not address or address.lower() in already_sent:
            continue
        already_sent.add(address.lower())
        try:
            message = EmailMultiAlternatives(subject, body, settings.DEFAULT_FROM_EMAIL, [address])
            message.attach_alternative(html_body, 'text/html')
            message.send(fail_silently=True)
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
        for user in listeners
    ])

    # And, for those who enabled it, the phone itself: an encrypted web push
    # through each browser's service worker, wakeable with the app closed.
    try:
        from .push import push_request_notification

        push_request_notification(kind, subject, body, desk_link, audience)
    except Exception:
        pass

    # And SMS directly to the officers' phones
    try:
        from . import sms

        sms_text = f"{church_name}: New {label} from {context_common['user_name']}. Review: {full_link}"
        for user in listeners:
            phone = getattr(getattr(user, 'member_profile', None), 'phone_number', '')
            if phone:
                try:
                    sms.send(phone, sms_text)
                except Exception:
                    pass
    except Exception:
        pass

    return sent


def send_membership_approval_email(user, *, church_name, name=None, phone=None):
    """Tell a member their join request was approved, so they can sign in.

    ``name`` is what the join form collected. The account itself may carry no
    name yet — plenty of people register and let the office fill the profile in
    — and greeting the person who typed their name a moment ago as "friend" is
    the one thing this letter must not do. Also sends SMS with the sign-in link.
    """
    recipient = (name or '').strip() or recipient_name(user)
    login_link = f'{settings.FRONTEND_URL}/login'
    context = {
        'name': recipient,
        'church': church_name,
        'link': login_link,
    }
    body = render_message(membership_approval_template(), context)
    address = (getattr(user, 'email', '') or '').strip()
    email_sent = False
    if address:
        try:
            send_mail(
                f'Your request to join {church_name} has been approved',
                body,
                sender_for(IDENTITY),
                [address],
                connection=connection_for(IDENTITY),
                fail_silently=True,
            )
            email_sent = True
        except Exception:
            pass

    # Send SMS notification with login link
    phone_number = phone or getattr(getattr(user, 'member_profile', None), 'phone_number', '')
    if phone_number:
        try:
            from . import sms
            sms_text = (
                f"{church_name}: Hello {recipient}, your request to join has been approved! "
                f"Your account is now active. Sign in here: {login_link}"
            )
            sms.send(phone_number, sms_text)
        except Exception:
            pass

    return email_sent


def notify_request_safely(kind, request_id, **kwargs):
    """Fire and forget: a notice must never break the request it announces."""
    try:
        return send_request_notification(kind, request_id, **kwargs)
    except Exception:
        return 0
