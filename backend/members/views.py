from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, User
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.core.validators import validate_email
from django.http import HttpResponse, HttpResponseRedirect
from django.db import transaction
from django.db.models import Count, Q, Sum
from django.db.models.functions import Coalesce, TruncMonth
from django.utils import timezone
from django.utils.crypto import get_random_string
from django.utils.dateparse import parse_date
from datetime import date, datetime, timedelta
import logging
import uuid
import re
import json
import os
import io
import secrets
import threading
import time
from decimal import Decimal
from html.parser import HTMLParser
from urllib.parse import parse_qs, urljoin
import requests

logger = logging.getLogger(__name__)

from rest_framework import generics
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework import permissions
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from tenants.models import GoogleIdentity
from config.authentication import sign_in_payload

from .models import Announcement, AnnouncementResponse, BoardMeeting, BoardMeetingAgenda, BusinessMeeting, BusinessMeetingAgenda, CampaignCardAssignment, CashContribution, ChildDedicationRequest, ChurchBudget, ChurchCorrespondence, ChurchFinancialReport, ChurchNotification, ChurchSettings, Contribution, ContributionReconciliation, EnrollmentRequest, Expenditure, ExternalResourceLink, format_invitation_code, Friend, FundraisingCampaign, giver_display_name, InKindContribution, InventoryItem, InventoryMovement, Invitation, MemberProfile, CURRENT_PRIVACY_POLICY_VERSION, CURRENT_TERMS_OF_USE_VERSION, MpesaRefund, MembershipRemovalRequest, MembershipTransferRequest, PendingTestimony, PrayerRequest, ProfileChangeRequest, Profession, SabbathEvent, SupportSubmission, Testimony, TreasuryAccount, TreasuryAccountTransaction, VisitationRequest
from .google_auth import GoogleCredentialError, verify_google_credential
from .mpesa import MpesaConfigurationError, initiate_b2c_refund, initiate_stk_push_for_context, normalize_mpesa_phone
from .mpesa_tokens import allocation_lines, pack_callback_context, unpack_callback_context
from .password_policy import MIN_LENGTH as PASSWORD_MIN_LENGTH, password_problems, validate_church_password
from .paystack import PaystackConfigurationError, initialize_checkout, parse_webhook, verify_webhook_signature
from .requests import notify_request_safely, send_membership_approval_email
from .treasury import credit_account, credit_contribution_lines
from .throttling import PublicTokenThrottle
from .roles import (
    DEFAULT_ROLE,
    ROLE_CODES,
    ROLE_GROUP_MAP,
    assignment_error,
    check_system_role_change,
    normalize_roles,
    parse_role_codes,
    role_labels,
    role_register,
    sync_role_groups,
    unknown_role_codes,
)
from .meetings import (
    BOARD_KIND,
    BUSINESS_KIND,
    as_bool,
    broadcast_invitation,
    create_agendas,
    parse_clock,
)
from .serializers import AnnouncementSerializer, AnnouncementResponseSerializer, BoardMeetingSerializer, BoardMeetingAgendaSerializer, BusinessMeetingSerializer, BusinessMeetingAgendaSerializer, CampaignCardAssignmentSerializer, CashContributionSerializer, ChildDedicationRequestSerializer, ChurchBudgetSerializer, ChurchCorrespondenceSerializer, ChurchFinancialReportSerializer, ChurchNotificationSerializer, ChurchSettingsSerializer, ContributionInitiateSerializer, MemberEmailSerializer, ContributionReconciliationSerializer, ContributionSerializer, EnrollmentAdminSerializer, EnrollmentCompleteSerializer, EnrollmentRequestSerializer, ExpenditureSerializer, FundraisingCampaignSerializer, InKindContributionSerializer, InventoryItemSerializer, InventoryMovementSerializer, InvitationAcceptSerializer, InvitationSerializer, MembershipRemovalRequestSerializer, MembershipTransferRequestSerializer, MpesaRefundSerializer, PrayerRequestSerializer, ProfileChangeRequestSerializer, ProfessionSerializer, RegisterSerializer, SabbathEventSerializer, SupportSubmissionSerializer, TestimonySerializer, TreasuryAccountSerializer, TreasuryAccountTransactionSerializer, UserDetailSerializer, VisitationRequestSerializer


# Django 5.1 removed User.objects.make_random_password, so temporary passwords
# are generated straight from Django's crypto helpers instead. The alphabet skips
# characters that are easy to confuse when a password is read out or typed (0/O, 1/l/I).
TEMPORARY_PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
PASSWORD_UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
PASSWORD_DIGITS = '23456789'
PASSWORD_SYMBOLS = '@#!$%&*?'


def generate_temporary_password(length=12):
    """A generated password always satisfies the church's policy (members/password_policy.py)."""
    length = max(length, PASSWORD_MIN_LENGTH)
    characters = [
        secrets.choice(PASSWORD_UPPERCASE),
        secrets.choice(PASSWORD_DIGITS),
        secrets.choice(PASSWORD_SYMBOLS),
    ]
    characters += [secrets.choice(TEMPORARY_PASSWORD_ALPHABET) for _ in range(length - len(characters))]
    secrets.SystemRandom().shuffle(characters)
    return ''.join(characters)


def render_receipt_message(template, donor_name, amount_display, purpose):
    """Fill the configurable receipt message's placeholders.

    The template lives in Church Settings and is the message itself: it should
    carry its own greeting (the shipped default starts "Dear {name}"). It may
    use {name}, {amount} and {purpose} — or {account}, the app's user-facing
    word for a giving purpose. Both spellings are filled; anything left
    brace-wrapped (a typo, a future placeholder) is stripped rather than
    shipped raw.
    """
    message = template or ''
    replacements = {
        'name': donor_name,
        'amount': amount_display,
        'account': purpose,
        'purpose': purpose,
    }
    for key, value in replacements.items():
        message = message.replace(f'{{{key}}}', value).replace(f'{{{key})', value)
    return re.sub(r'\{[a-z_]+[})]', '', message).strip()


def receipt_email_signature():
    return "Warm regards,\nTreasury,\nSDA Church Loma Linda, Meru"


def receipt_summary(*, account, amount, payment_channel, receipt_ref, date_display):
    return (
        "Receipt Summary:\n"
        f"Account: {account}\n"
        f"Amount: {amount}\n"
        f"Payment Channel: {payment_channel}\n"
        f"Receipt No: {receipt_ref}\n"
        f"Date: {date_display}"
    )


def send_enrollment_email(enrollment):
    church_name = current_church_name()
    link = f"{settings.FRONTEND_URL}/enroll/confirm?token={enrollment.token}"
    account_label = 'friend account' if enrollment.joining_mode == 'friend' else 'church account'
    send_mail(
        f'Verify your {church_name_plain(church_name)} account',
        f"Hello {enrollment.first_name or 'there'},\n\n"
        f"Thank you for choosing to join {church_name} as a {account_label}.\n\n"
        f"Please click the link below to verify your email and complete setting up your account:\n{link}\n\n"
        f"This link is valid for 48 hours.\n\n"
        f"Warm regards,\n{church_name}",
        settings.DEFAULT_FROM_EMAIL,
        [enrollment.email],
        fail_silently=True,
    )


# Church roles, their labels and their Django groups live in members/roles.py.
# ROLE_GROUP_MAP is re-exported above for callers such as create_account.

# How the church is named in every email: subject, body and signature. Church
# Settings wins (so the office can rename the church without a code change);
# this is the fallback used when no ChurchSettings row exists yet.
CHURCH_DEFAULT_NAME = 'SDA Loma Linda, Meru'

# Fallback for churches with no ChurchSettings row: invitations last a week.
DEFAULT_INVITATION_LIFETIME = timedelta(days=7)


def invitation_link_lifetime():
    """How long an emailed invitation stays usable, as the office configured it."""
    try:
        church_settings = ChurchSettings.objects.first()
        if church_settings and church_settings.invitation_link_lifetime_days:
            return timedelta(days=church_settings.invitation_link_lifetime_days)
    except Exception:
        pass
    return DEFAULT_INVITATION_LIFETIME


def current_church_name():
    """The church's name as it is written: email bodies, page copy, documents."""
    try:
        church_settings = ChurchSettings.objects.first()
        if church_settings and church_settings.church_name:
            return church_settings.church_name
    except Exception:
        pass
    return CHURCH_DEFAULT_NAME


def church_name_plain(name=None):
    """Church name where it modifies what follows, or where it sits in a header.

    'your SDA Loma Linda, Meru account' reads wrong — the comma there would
    separate the name from the noun it owns — and a bare comma inside a From or
    Subject header is an address-list separator, so the comma is dropped there.
    A name the office wrote without a comma ('SDA Milimani') is returned as is.
    """
    return (name or current_church_name()).replace(',', '')


def church_name_clause(name=None):
    """Church name where it opens a clause and a verb follows it.

    Reads 'SDA Loma Linda, Meru, has invited you…' — the apposition opened by
    the name's own comma is closed here. A name without a comma ('SDA Milimani')
    simply reads as the subject of the sentence.
    """
    name = name or current_church_name()
    return f'{name},' if ',' in name else name


def invitation_url(invitation):
    """The accept-invite link carrying this invitation's raw token.

    Only call this for a token the app itself has just generated: the raw value
    exists in memory at that moment, while the database keeps only its hash.
    """
    return f"{settings.FRONTEND_URL}/accept-invite?token={invitation.raw_token}"


def invitation_code_text(invitation):
    """The typed invitation code, printed as 'ABCD-EFGH'.

    Like the link token, the raw code lives only in the memory of the process
    that generated it: the database keeps its hash. An invitation read back
    from the database therefore has no code to show, and this returns ''.
    """
    return format_invitation_code(invitation.raw_code) if invitation.raw_code else ''


def send_invitation_email(invitation):
    church_name = current_church_name()
    invitee = invitation.display_name() or 'there'
    account_label = invitation.get_account_type_display()
    # A plain member or friend carries no special access, so the email does not
    # mention roles at all; only a special-role invitation names its access.
    special_codes = [code for code in invitation.role_codes() if code != DEFAULT_ROLE]
    access_clause = (
        f" with the following access: {role_labels(special_codes)}."
        if special_codes else '.'
    )
    # The code goes in the letter beside the link: a mail app that refuses to
    # open the link (or a link broken across two lines) must not leave the
    # invitee with nothing to type.
    code = invitation_code_text(invitation)
    subject = f'You are invited to {church_name_plain(church_name)}'
    body = (
        f"Hello {invitee},\n\n"
        f"{church_name_clause(church_name)} has invited you to create your own account as a {account_label}"
        f"{access_clause}\n\n"
        "Click the link below to choose your username and password:\n"
        f"{invitation_url(invitation)}\n\n"
        + (
            "If the link will not open, go to "
            f"{settings.FRONTEND_URL}/accept-invite and enter this invitation code:\n"
            f"{code}\n\n"
            if code else ''
        )
        + f"This invitation is valid until {timezone.localtime(invitation.expires_at).strftime('%d %B %Y')}.\n"
        "Once your account is ready you can sign in at "
        f"{settings.FRONTEND_URL}/login\n\n"
        f"Warm regards,\n{church_name}"
    )
    send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [invitation.email], fail_silently=False)


def roster_queryset():
    """The church's roster — the one list behind Users and the printed roll.

    A superuser is the owner of the installation, not a member: it holds no
    church office (and may hold no member profile at all), so listing it put an
    account nobody can pastor among the congregation. Django's
    ``is_staff``/``is_superuser`` flags are only ever set for those system
    accounts — a church office is a role code, not a staff flag.

    Somebody who registered through the public join form is a *request*, not a
    member: their account is created inactive and sits in the Requests desk
    until a leader answers it. Listing them asked the office to manage people it
    has not accepted. They join this roster the moment their request is
    approved, and nowhere before it.
    """
    return User.objects.filter(is_superuser=False).exclude(
        enrollment_requests__status__in=('verification_pending', 'pending', 'rejected')
    )


def can_manage_invitations(user):
    """Church administrators and clerks may invite accounts."""
    if not user or not user.is_authenticated:
        return False
    if user.is_staff or user.is_superuser:
        return True
    profile = getattr(user, 'member_profile', None)
    return bool(profile and profile.has_role('admin', 'clerk'))


def send_password_reset_email(user, uid, token):
    church_name = current_church_name()
    link = f"{settings.FRONTEND_URL}/reset-password?uid={uid}&token={token}"
    send_mail(
        f'Reset your {church_name_plain(church_name)} password',
        f"Hello {user.first_name or user.username},\n\n"
        f"We received a request to reset the password for your {church_name_plain(church_name)} account.\n"
        f"Click the link below to choose a new one:\n{link}\n\n"
        "If you did not request this, you can ignore this email — your password stays as it is.\n\n"
        f"Warm regards,\n{church_name}",
        settings.DEFAULT_FROM_EMAIL,
        [user.email],
        fail_silently=False,
    )


def _deliver_receipt_message(*, subject, body, email='', phone='', mark_sent):
    """Attempt every available receipt channel and report whether one succeeded."""
    email_sent = False
    sms_sent = False
    sms_configured = bool(getattr(settings, 'SMS_API_URL', '') and getattr(settings, 'SMS_API_KEY', ''))
    if email:
        try:
            send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [email], fail_silently=False)
            email_sent = True
        except Exception:
            # A receipt that never went out must not read as sent — and the
            # treasurer must be able to learn why from the server log rather
            # than from a silent “Pending” badge.
            logger.exception('Receipt email to %s failed to send.', email)

    if phone:
        sms_api_url = getattr(settings, 'SMS_API_URL', '')
        sms_api_key = getattr(settings, 'SMS_API_KEY', '')
        if sms_api_url and sms_api_key:
            try:
                response = requests.post(
                    sms_api_url,
                    json={'to': phone, 'message': body, 'from': getattr(settings, 'SMS_SENDER_ID', current_church_name())},
                    headers={'Authorization': f'Bearer {sms_api_key}'},
                    timeout=10,
                )
                response.raise_for_status()
                sms_sent = True
            except Exception:
                logger.exception('Receipt SMS to %s failed to send.', phone)

    sent = email_sent or sms_sent
    if sent:
        mark_sent()
    return {
        'email_sent': email_sent,
        'sms_sent': sms_sent,
        'sms_configured': sms_configured,
    }


def send_contribution_receipt(contribution):
    if contribution.receipt_sent_at or contribution.status != 'completed':
        return

    church_settings = ChurchSettings.objects.get_or_create(pk=1)[0]
    local_now = timezone.localtime()
    receipt_reference = contribution.mpesa_receipt_number or contribution.paystack_reference or str(contribution.id)
    donor_name = giver_display_name(
        contribution.donor_name,
        member=contribution.member,
        email=contribution.donor_email,
        phone=contribution.phone_number,
    ) or 'friend'
    amount_display = f"{contribution.currency} {contribution.amount:,.2f}"
    receipt_message = render_receipt_message(
        church_settings.default_receipt_message,
        donor_name,
        amount_display,
        contribution.purpose,
    )
    date_display = timezone.localtime(contribution.paid_at or local_now).strftime('%d %B %Y, %H:%M')
    # The settings template is the whole message (greeting included); only the
    # structured summary and signature are appended around it.
    body = (
        f"{receipt_message}\n\n"
        f"{receipt_summary(account=contribution.purpose, amount=amount_display, payment_channel=contribution.get_payment_method_display(), receipt_ref=receipt_reference, date_display=date_display)}\n\n"
        f"{receipt_email_signature()}"
    )
    email = contribution.donor_email or (contribution.member.email if contribution.member else '')
    delivery = _deliver_receipt_message(
        subject=f"Giving receipt — {contribution.purpose}",
        body=body,
        email=email,
        phone=contribution.phone_number,
        mark_sent=lambda: None,
    )
    if delivery['email_sent'] or delivery['sms_sent']:
        contribution.receipt_sent_at = timezone.now()
        contribution.save(update_fields=['receipt_sent_at'])


def send_cash_receipt(cash, *, send_sms=True, send_email=True):
    """Send a manually recorded receipt through both selected channels."""
    if cash.receipt_sent_at or cash.entry_type != 'individual':
        return {'email_sent': False, 'sms_sent': False, 'sms_configured': bool(getattr(settings, 'SMS_API_URL', '') and getattr(settings, 'SMS_API_KEY', ''))}
    settings_obj = ChurchSettings.objects.get_or_create(pk=1)[0]
    donor_name = giver_display_name(
        cash.donor_name, email=cash.giver_email, phone=cash.giver_phone,
    ) or 'friend'
    amount_display = f"KES {cash.amount:,.2f}"
    message = render_receipt_message(
        settings_obj.default_receipt_message,
        donor_name,
        amount_display,
        cash.purpose,
    )
    body = (
        f"{message}\n\n"
        f"{receipt_summary(account=cash.purpose, amount=amount_display, payment_channel=cash.get_payment_method_display(), receipt_ref=cash.receipt_number or f'CASH-{cash.id}', date_display=cash.received_on)}\n\n"
        f"{receipt_email_signature()}"
    )
    delivery = _deliver_receipt_message(
        subject=f"Giving receipt — {cash.purpose}",
        body=body,
        email=cash.giver_email if send_email else '',
        phone=cash.giver_phone if send_sms else '',
        mark_sent=lambda: None,
    )
    if delivery['email_sent'] or delivery['sms_sent']:
        cash.receipt_sent_at = timezone.now()
        cash.save(update_fields=['receipt_sent_at'])
    return delivery


def cash_receipt_delivery_message(delivery, *, email_requested, sms_requested, has_email, has_phone):
    """One honest line about where a cash receipt actually went.

    Success is only claimed when a channel really delivered; when nothing
    was sent, the reasons say why (no address, SMS not configured, a
    channel switched off) instead of reporting a generic completion.
    """
    email_sent = bool(delivery.get('email_sent'))
    sms_sent = bool(delivery.get('sms_sent'))
    if email_sent and sms_sent:
        return 'Receipt sent by email and SMS.'
    if email_sent:
        if sms_requested and not delivery.get('sms_configured'):
            return 'Email sent; SMS was not sent because SMS is not configured.'
        return 'Receipt sent by email.'
    if sms_sent:
        return 'Receipt sent by SMS.'
    if not email_requested and not sms_requested:
        return 'The receipt was not sent because no delivery channel was selected.'
    reasons = []
    if email_requested:
        reasons.append('this giver has no email address' if not has_email else 'the email could not be sent')
    if sms_requested:
        if not delivery.get('sms_configured'):
            reasons.append('SMS is not configured')
        elif not has_phone:
            reasons.append('this giver has no phone number')
        else:
            reasons.append('the SMS could not be sent')
    return 'The receipt was not sent: ' + ' and '.join(reasons) + '.'


def is_finance_manager(user):
    if not user or not user.is_authenticated:
        return False
    if user.is_staff or user.is_superuser:
        return True
    profile = getattr(user, 'member_profile', None)
    official_roles = (
        'admin', 'clerk', 'elder', 'youth_leader', 'choir_director',
        'children_ministry', 'men_ministry', 'women_ministry', 'chaplaincy',
        'treasurer'
    )
    return bool(profile and profile.has_role(*official_roles))


def is_treasurer_or_admin(user):
    if not user or not user.is_authenticated:
        return False
    if user.is_staff or user.is_superuser:
        return True
    profile = getattr(user, 'member_profile', None)
    return bool(profile and profile.has_role('treasurer', 'admin'))


def user_has_role(user, *codes):
    """True if the user's member profile holds any of the given role codes."""
    profile = getattr(user, 'member_profile', None)
    return bool(profile and profile.has_role(*codes))


MISSION_READING_SOURCES = {
    'children': 'https://adventistmission.org/mission-awareness/mission-quarterlies/children/articles/',
    'adults': 'https://adventistmission.org/mission-awareness/mission-quarterlies/youth-and-adult/articles',
}
SSNET_SOURCE = 'https://ssnet.org/'
SSNET_WEEKLY_LESSON_URL = 'https://ssnet.org/lessons/current.html'
ADULT_LESSON_SOURCE = SSNET_SOURCE
# The Young Adult (YA) lesson is the InVerse series, published by SSPM. Its reader
# is a JavaScript app fed by the Adventech Sabbath School content API, so the page
# for any given week has to be resolved from that API rather than scraped out of
# the HTML shell the site serves.
YA_LESSON_URL = 'https://inverse.sspmadventist.org/study'
YA_LESSON_SITE = 'https://inverse.sspmadventist.org'
YA_LESSON_QUARTERLIES_URL = 'https://sabbath-school.adventech.io/api/v2/en/quarterlies/index.json'
YA_LESSON_QUARTERLY_URL = 'https://sabbath-school.adventech.io/api/v2/en/quarterlies/{quarter}/index.json'
YA_LESSON_GROUP = 'InVerse'
YA_LESSON_DATE_FORMAT = '%d/%m/%Y'
CHILDREN_LESSON_SOURCES = {
    'beginner': 'https://beginner.aliveinjesus.info/students',
    'kindergarten': 'https://kindergarten.aliveinjesus.info/students',
    'primary': 'https://primary.aliveinjesus.info/students',
    'junior': 'https://www.juniorpowerpoints.org/page2447',
    'teens': 'https://www.cornerstoneconnections.net/lessons',
}


class _MissionLinkParser(HTMLParser):
    def __init__(self, source_url, path_fragment):
        super().__init__()
        self.source_url = source_url
        self.path_fragment = path_fragment
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag != 'a':
            return
        href = dict(attrs).get('href', '')
        if not href or href.startswith('#'):
            return
        url = urljoin(self.source_url, href)
        is_article_path = self.path_fragment in url and re.search(r'/articles/[^/?#]+/?$', url) is not None
        if is_article_path and url.rstrip('/') != self.source_url.rstrip('/') and url not in self.links:
            self.links.append(url)


class _WeeklyLessonParser(HTMLParser):
    def __init__(self, source_url):
        super().__init__()
        self.source_url = source_url
        self.current_href = None
        self.current_text = []
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag == 'a':
            self.current_href = dict(attrs).get('href', '')
            self.current_text = []

    def handle_data(self, data):
        if self.current_href is not None:
            self.current_text.append(data)

    def handle_endtag(self, tag):
        if tag != 'a' or not self.current_href:
            return
        text = ' '.join(''.join(self.current_text).split())
        match = re.search(r'Lesson\s+(\d{1,2})\s+-\s+([A-Za-z]+\s+\d{1,2})', text, flags=re.IGNORECASE)
        href = urljoin(self.source_url, self.current_href)
        if match and re.search(r'/assets/(juniors|teens)/Lessons/\d{4}/Q\d/English/(Student|Teacher)/', href):
            year_match = re.search(r'/Lessons/(\d{4})/Q(\d)/', href)
            self.links.append({
                'number': int(match.group(1)),
                'date': datetime.strptime(f"{year_match.group(1)} {match.group(2)}", '%Y %B %d').date(),
                'audience': 'teachers' if '/Teacher/' in href else 'students',
                'url': href,
            })
        self.current_href = None
        self.current_text = []


class _SsnetQuarterParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.current_href = None
        self.current_text = []
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag == 'a':
            self.current_href = dict(attrs).get('href', '')
            self.current_text = []

    def handle_data(self, data):
        if self.current_href is not None:
            self.current_text.append(data)

    def handle_endtag(self, tag):
        if tag != 'a' or not self.current_href:
            return
        href = urljoin(SSNET_SOURCE, self.current_href)
        text = ' '.join(''.join(self.current_text).split())
        if re.search(r'/lessons/\d{2}[a-d]/?$', href) or re.search(r'20\d{2}\s+Q[1-4]', text, flags=re.IGNORECASE):
            self.links.append({'url': href, 'text': text})
        self.current_href = None
        self.current_text = []


class _SsnetLessonParser(HTMLParser):
    def __init__(self, source_url):
        super().__init__()
        self.source_url = source_url
        self.current_href = None
        self.current_text = []
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag == 'a':
            self.current_href = dict(attrs).get('href', '')
            self.current_text = []

    def handle_data(self, data):
        if self.current_href is not None:
            self.current_text.append(data)

    def handle_endtag(self, tag):
        if tag != 'a' or not self.current_href:
            return
        href = urljoin(self.source_url, self.current_href)
        text = ' '.join(''.join(self.current_text).split())
        lesson_match = re.search(r'/less(\d{2})\.html$', href)
        if lesson_match:
            self.links.append({'number': int(lesson_match.group(1)), 'url': href, 'text': text})
        teacher_match = re.search(r'/helps/lesshp(\d+)\.html$', href)
        if teacher_match:
            self.links.append({'number': int(teacher_match.group(1)), 'url': href, 'text': text, 'teacher': True})
        self.current_href = None
        self.current_text = []


def current_ssnet_quarter_url():
    response = _get_with_retries(SSNET_SOURCE)
    parser = _SsnetQuarterParser()
    parser.feed(response.text)
    today = timezone.localdate()
    current = next((link['url'] for link in parser.links if re.search(rf'{today.year}\s+Q{((today.month - 1) // 3) + 1}', link['text'], flags=re.IGNORECASE)), None)
    return current or (parser.links[-1]['url'] if parser.links else SSNET_SOURCE)


def _current_ssnet_lesson_urls():
    quarter_url = current_ssnet_quarter_url()
    response = _get_with_retries(quarter_url)
    parser = _SsnetLessonParser(quarter_url)
    parser.feed(response.text)
    lessons = [link for link in parser.links if not link.get('teacher')]
    if not lessons:
        return quarter_url, quarter_url
    today = timezone.localdate()
    quarter_start = today.replace(month=((today.month - 1) // 3) * 3 + 1, day=1)
    first_sabbath = quarter_start - timedelta(days=(quarter_start.weekday() - 5) % 7)
    current_number = min(max(((today - first_sabbath).days // 7) + 1, 1), 13)
    lesson = next((item for item in lessons if item['number'] == current_number), lessons[-1])
    lesson_page = _get_with_retries(lesson['url'])
    lesson_parser = _SsnetLessonParser(lesson['url'])
    lesson_parser.feed(lesson_page.text)
    teacher = next((item for item in lesson_parser.links if item.get('teacher') and item['number'] == lesson['number']), None)
    return lesson['url'], teacher['url'] if teacher else quarter_url


def first_mission_story_url(audience):
    source_url = MISSION_READING_SOURCES[audience]
    path_fragment = '/children/' if audience == 'children' else '/youth-and-adult/'
    response = _get_with_retries(source_url)
    response.raise_for_status()
    parser = _MissionLinkParser(source_url, path_fragment)
    parser.feed(response.text)
    if not parser.links:
        return source_url
    # The current Adventist Mission page places the adult weekly article
    # after one introductory article, while the children's weekly article is first.
    return parser.links[1] if audience == 'adults' and len(parser.links) > 1 else parser.links[0]


def _get_with_retries(url, attempts=2):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    for attempt in range(attempts):
        try:
            response = requests.get(url, headers=headers, timeout=4)
            if response.status_code < 400:
                return response
        except Exception:
            if attempt == attempts - 1:
                raise
        time.sleep(1)
    raise requests.RequestException("Request failed")


def cached_resource_url(key):
    link = ExternalResourceLink.objects.filter(key=key).first()
    return link.url if link and link.resolved_at >= timezone.now() - timedelta(days=8) else None


def save_resource_url(key, url):
    ExternalResourceLink.objects.update_or_create(key=key, defaults={'url': url, 'resolved_at': timezone.now()})
    return url


def lesson_week_start(day):
    """The Sunday that opens the lesson week containing ``day``.

    Sabbath School lessons run Sunday to Saturday, so the week is anchored on
    Sunday rather than Python's Monday.
    """
    return day - timedelta(days=(day.weekday() + 1) % 7)


def cached_weekly_resource_url(key):
    """A stored link that is only good for the lesson week it was resolved in.

    The flat N-day cache the other materials links use can outlive the week it
    was resolved in, which would keep serving last week's lesson for days, so a
    weekly link is reused only while today still falls in the same
    Sunday-to-Saturday week as the resolution.
    """
    link = ExternalResourceLink.objects.filter(key=key).first()
    if not link:
        return None
    resolved_on = timezone.localtime(link.resolved_at).date()
    return link.url if lesson_week_start(resolved_on) == lesson_week_start(timezone.localdate()) else None


def _get_json(url):
    response = _get_with_retries(url)
    response.raise_for_status()
    return response.json()


def _covers_day(period, day):
    """True if a quarterly or lesson entry's date range holds ``day``."""
    try:
        start = datetime.strptime(period['start_date'], YA_LESSON_DATE_FORMAT).date()
        end = datetime.strptime(period['end_date'], YA_LESSON_DATE_FORMAT).date()
    except (KeyError, TypeError, ValueError):
        return False
    return start <= day <= end


def current_adult_lesson_url():
    return SSNET_WEEKLY_LESSON_URL


def current_ya_lesson_url():
    """The InVerse (Young Adult) page for this week's lesson.

    The quarterly list carries the InVerse quarterlies with their date ranges,
    and each of a quarterly's lessons is one week, so the lesson covering today
    is the page to send readers to. The quarterly page is the fallback for the
    rare day a quarterly is live but no lesson has started yet; the generic
    study page covers everything else.
    """
    today = timezone.localdate()
    quarterlies = _get_json(YA_LESSON_QUARTERLIES_URL)
    quarterly = next((
        item for item in quarterlies
        if (item.get('quarterly_group') or {}).get('name') == YA_LESSON_GROUP and _covers_day(item, today)
    ), None)
    if not quarterly:
        return YA_LESSON_URL
    lessons = _get_json(YA_LESSON_QUARTERLY_URL.format(quarter=quarterly['id'])).get('lessons') or []
    lesson = next((item for item in lessons if _covers_day(item, today)), None)
    quarterly_page = f'{YA_LESSON_SITE}/en/{quarterly["id"]}'
    return f'{quarterly_page}/{lesson["id"]}' if lesson else quarterly_page


def current_adult_pdf_url(kind):
    lesson_url = current_adult_lesson_url()
    page = _get_with_retries(lesson_url)
    pdfs = [urljoin(lesson_url, href) for href in re.findall(r'href=["\']([^"\']+\.pdf)["\']', page.text, flags=re.IGNORECASE)]
    marker = 'EAQ' if kind == 'lesson' else 'ETQ'
    return next((url for url in pdfs if marker in url), ADULT_LESSON_SOURCE)


def first_children_lesson_url(division, audience):
    source_url = CHILDREN_LESSON_SOURCES[division]
    page = _get_with_retries(source_url)
    if division in ('junior', 'teens'):
        parser = _WeeklyLessonParser(source_url)
        parser.feed(page.text)
        lessons = [link for link in parser.links if link['audience'] == audience]
        if not lessons:
            return source_url
        today = timezone.localdate()
        upcoming = [lesson for lesson in lessons if lesson['date'] >= today]
        target_date = min(upcoming, key=lambda lesson: lesson['date'])['date'] if upcoming else max(lessons, key=lambda lesson: lesson['date'])['date']
        target = next(lesson for lesson in lessons if lesson['date'] == target_date)
        return target['url']
    script_urls = re.findall(r'<script[^>]+src="([^"]+)"', page.text)
    today = timezone.localdate()
    quarter_start = today.replace(month=((today.month - 1) // 3) * 3 + 1, day=1)
    current_week = min(max(((today - quarter_start).days // 7) + 1, 1), 13)
    target_host = urljoin(source_url, '/').split('//', 1)[1].split('.', 1)[0]
    target_host = f'app.{target_host}.aliveinjesus.info'
    pattern = re.compile(rf'https://{re.escape(target_host)}/resources/en/aij/(\d{{4}})-(\d{{2}})-([^/]+)/{current_week:02d}(?:"|,)')
    candidates = []
    for script_url in script_urls:
        script = _get_with_retries(urljoin(source_url, script_url))
        candidates.extend(match.group(0)[:-1] for match in pattern.finditer(script.text))
    if not candidates:
        return source_url.replace('/students', f'/{audience}')
    destination = sorted(set(candidates), key=lambda url: tuple(map(int, re.search(r'/aij/(\d{4})-(\d{2})-', url).groups())), reverse=True)[0]
    if audience == 'teachers':
        destination = re.sub(r'-(bg|kd|pr|jr)/(?=\d{2}$)', r'-\1-tg/', destination)
    return destination


class RegisterView(generics.CreateAPIView):
    permission_classes = [AllowAny]
    serializer_class = RegisterSerializer


class EnrollmentRequestView(generics.CreateAPIView):
    permission_classes = [AllowAny]
    serializer_class = EnrollmentRequestSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        privacy_accepted = serializer.validated_data.pop('privacy_accepted', False)
        terms_accepted = serializer.validated_data.pop('terms_accepted', False)
        validated_data = dict(serializer.validated_data)
        if privacy_accepted:
            validated_data['privacy_accepted_at'] = timezone.now()
            validated_data['privacy_policy_version'] = CURRENT_PRIVACY_POLICY_VERSION
        if terms_accepted:
            validated_data['terms_accepted_at'] = timezone.now()
            validated_data['terms_of_use_version'] = CURRENT_TERMS_OF_USE_VERSION
        email = validated_data['email'].lower().strip()
        token = uuid.uuid4()
        enrollment, _ = EnrollmentRequest.objects.update_or_create(
            email=email,
            defaults={
                **validated_data,
                'email': email,
                'token': token,
                'status': 'verification_pending',
                'expires_at': timezone.now() + timedelta(hours=48),
            }
        )
        try:
            send_enrollment_email(enrollment)
        except Exception:
            pass
        return Response({
            'message': 'A verification link has been sent to your email. Please check your inbox (and spam folder) to complete your account setup.',
            'token': str(enrollment.token)
        }, status=status.HTTP_200_OK)


class EnrollmentVerifyView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        enrollment = EnrollmentRequest.objects.filter(token=request.query_params.get('token'), status__in=('verification_pending', 'approved'), expires_at__gt=timezone.now()).first()
        if not enrollment:
            return Response({'detail': 'This enrollment link is invalid or expired.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'email': enrollment.email, 'first_name': enrollment.first_name, 'last_name': enrollment.last_name, 'joining_mode': enrollment.joining_mode})


class EnrollmentCompleteView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = EnrollmentCompleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        enrollment = EnrollmentRequest.objects.filter(token=serializer.validated_data['token'], status__in=('verification_pending', 'approved'), expires_at__gt=timezone.now()).first()
        if not enrollment:
            return Response({'detail': 'This enrollment link is invalid or expired.'}, status=status.HTTP_400_BAD_REQUEST)
        if User.objects.filter(username=serializer.validated_data['username']).exists():
            return Response({'username': 'That username is already in use.'}, status=status.HTTP_400_BAD_REQUEST)
        if User.objects.filter(email__iexact=enrollment.email).exists():
            return Response({'email': 'An account already exists for this email.'}, status=status.HTTP_400_BAD_REQUEST)
        user = User.objects.create_user(username=serializer.validated_data['username'], email=enrollment.email, first_name=enrollment.first_name, last_name=enrollment.last_name, password=serializer.validated_data['password'], is_active=enrollment.status == 'approved')
        from .models import MemberProfile
        MemberProfile.objects.create(
            user=user,
            phone_number=enrollment.phone_number,
            account_type={'friend': 'friend', 'sabbath_school': 'sabbath_school'}.get(enrollment.joining_mode, 'member'),
            privacy_accepted_at=enrollment.privacy_accepted_at or timezone.now(),
            privacy_policy_version=enrollment.privacy_policy_version or CURRENT_PRIVACY_POLICY_VERSION,
            terms_accepted_at=enrollment.terms_accepted_at or timezone.now(),
            terms_of_use_version=enrollment.terms_of_use_version or CURRENT_TERMS_OF_USE_VERSION,
        )
        enrollment.user = user
        enrollment.status = 'completed' if user.is_active else 'pending'
        enrollment.privacy_accepted_at = timezone.now()
        enrollment.privacy_policy_version = CURRENT_PRIVACY_POLICY_VERSION
        enrollment.terms_accepted_at = timezone.now()
        enrollment.terms_of_use_version = CURRENT_TERMS_OF_USE_VERSION
        enrollment.save(update_fields=['user', 'status', 'privacy_accepted_at', 'privacy_policy_version', 'terms_accepted_at', 'terms_of_use_version'])
        if not user.is_active:
            # The request only becomes something to answer now: the person has
            # verified their address and chosen their account, so the office is
            # told about a request it can act on rather than an unverified form.
            notify_request_safely(
                'join',
                enrollment.pk,
                submitted_by=f'{enrollment.first_name} {enrollment.last_name}'.strip() or enrollment.email,
                church_name=current_church_name(),
                submitted_at=enrollment.created_at,
            )
        return Response({'message': 'Your account request has been submitted for review. You can sign in after approval.' if not user.is_active else 'Your account is ready. You can now sign in.'}, status=status.HTTP_201_CREATED)


class EnrollmentAdminListView(generics.ListAPIView):
    """Join requests (friends, baptism, transfer-ins) for the leadership queue.

    Enrollment completions land as inactive accounts with status ``pending``;
    without this list they had no place to surface for review.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = EnrollmentAdminSerializer

    def get_queryset(self):
        profile = getattr(self.request.user, 'member_profile', None)
        if self.request.user.is_staff or (profile and profile.has_role('admin', 'clerk', 'elder')):
            return EnrollmentRequest.objects.select_related('user').order_by('-created_at')
        return EnrollmentRequest.objects.none()


class EnrollmentDecisionView(APIView):
    """Approve or reject a join request.

    Approval activates the account (once it exists) so the person can finally
    sign in; rejection keeps it disabled. Requests still awaiting email
    verification can be decided early too: approving lets the link complete
    straight into an active account, rejecting burns the link.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        profile = getattr(request.user, 'member_profile', None)
        if not (request.user.is_staff or (profile and profile.has_role('admin', 'clerk', 'elder'))):
            return Response({'detail': 'Only church officials can review join requests.'}, status=status.HTTP_403_FORBIDDEN)
        enrollment = EnrollmentRequest.objects.select_related('user').filter(pk=pk).first()
        if not enrollment:
            return Response({'detail': 'Join request not found.'}, status=status.HTTP_404_NOT_FOUND)
        decision = request.data.get('status')
        if decision not in ('approved', 'rejected'):
            return Response({'detail': 'Use approved or rejected for join review.'}, status=status.HTTP_400_BAD_REQUEST)

        enrollment.status = decision
        enrollment.save(update_fields=['status'])
        if enrollment.user_id:
            user = enrollment.user
            user.is_active = decision == 'approved'
            user.save(update_fields=['is_active'])
            if decision == 'approved':
                message = (
                    'Your request to join as a friend of the church has been approved. You can now sign in.'
                    if enrollment.joining_mode == 'friend'
                    else 'Your request to join the church has been approved. You can now sign in.'
                )
            else:
                message = 'Your request to join the church has not been approved. Please contact the church office for more information.'
            ChurchNotification.objects.create(
                user=user,
                title='Join Request Approved' if decision == 'approved' else 'Join Request Not Approved',
                message=message,
            )
            if decision == 'approved':
                # The in-app notice only reaches someone who signs in; the email
                # is what tells them the door is open in the first place. The
                # name comes from the join form, since the account may not have
                # one yet.
                send_membership_approval_email(
                    user,
                    church_name=current_church_name(),
                    name=enrollment.first_name,
                )
        return Response(EnrollmentAdminSerializer(enrollment).data, status=status.HTTP_200_OK)


class InvitationListCreateView(generics.ListCreateAPIView):
    """Invite someone by email to create their own church account.

    The inviter chooses the account type and role(s); the invitee follows the
    emailed link to pick a username and password, then signs in normally.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = InvitationSerializer

    def get_queryset(self):
        if not can_manage_invitations(self.request.user):
            return Invitation.objects.none()
        # Past its expiry an invitation is no longer pending: flip stale rows
        # on read so the console's Pending list holds only live invitations.
        Invitation.objects.filter(status='pending', expires_at__lte=timezone.now()).update(status='expired')
        return Invitation.objects.all()

    def create(self, request, *args, **kwargs):
        if not can_manage_invitations(request.user):
            return Response({'detail': 'Only church administrators or clerks can invite accounts.'}, status=status.HTTP_403_FORBIDDEN)

        email = str(request.data.get('email') or '').strip().lower()
        if not email:
            return Response({'email': 'Enter an email address to invite.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_email(email)
        except Exception:
            return Response({'email': 'Enter a valid email address.'}, status=status.HTTP_400_BAD_REQUEST)

        if User.objects.filter(email__iexact=email).exists():
            return Response({'email': 'An account already exists for this email address.'}, status=status.HTTP_400_BAD_REQUEST)

        first_name = str(request.data.get('first_name') or '').strip()
        last_name = str(request.data.get('last_name') or '').strip()
        raw_name = str(request.data.get('name') or request.data.get('full_name') or '').strip()
        if raw_name and not (first_name and last_name):
            parts = raw_name.split()
            if len(parts) == 1:
                first_name, last_name = parts[0], ''
            elif len(parts) == 2:
                first_name, last_name = parts[0], parts[1]
            else:
                first_name, last_name = ' '.join(parts[:-1]), parts[-1]

        if not first_name:
            return Response({'first_name': 'Enter the name of the person you are inviting.'}, status=status.HTTP_400_BAD_REQUEST)

        submitted_roles = parse_role_codes(request.data.get('roles') or request.data.get('role'))
        unknown = unknown_role_codes(submitted_roles)
        if unknown:
            return Response({'roles': f"Unknown role code(s): {', '.join(unknown)}"}, status=status.HTTP_400_BAD_REQUEST)
        # Account type (member/friend) describes the person's status; only
        # permission-bearing roles belong in the invitation's role list.
        roles_param = [code for code in submitted_roles if code != DEFAULT_ROLE]
        # Administrator is a system role: only administrators may hand it out.
        error = check_system_role_change(request.user, None, [], roles_param)
        if error:
            return Response({'roles': error}, status=status.HTTP_403_FORBIDDEN)

        account_type = str(request.data.get('account_type') or 'member').strip()
        if account_type not in ('member', 'friend', 'sabbath_school'):
            account_type = 'member'

        invitation = Invitation.objects.filter(email__iexact=email, status='pending').first()
        if invitation is None:
            invitation = Invitation(email=email)
        invitation.first_name = first_name
        invitation.last_name = last_name
        invitation.phone_number = str(request.data.get('phone_number') or '').strip()
        invitation.account_type = account_type
        invitation.roles = ', '.join(roles_param)
        invitation.set_token()
        invitation.set_code()
        invitation.status = 'pending'
        invitation.invited_by = request.user
        invitation.expires_at = timezone.now() + invitation_link_lifetime()
        invitation.save()

        email_sent = False
        try:
            send_invitation_email(invitation)
            email_sent = True
            invitation.sent_at = timezone.now()
            invitation.save(update_fields=['sent_at'])
        except Exception:
            email_sent = False

        payload = InvitationSerializer(invitation).data
        payload['invite_url'] = invitation_url(invitation)
        payload['invite_code'] = invitation_code_text(invitation)
        payload['email_sent'] = email_sent
        if not email_sent:
            payload['detail'] = (
                'The invitation was created but the email could not be sent. '
                'Share the invitation link with them directly instead.'
            )
        return Response(payload, status=status.HTTP_201_CREATED)


class InvitationDetailView(APIView):
    """Withdraw a pending invitation, or resend its email."""

    permission_classes = [IsAuthenticated]

    def _get(self, request, pk):
        if not can_manage_invitations(request.user):
            return None, Response({'detail': 'Only church administrators or clerks can manage invitations.'}, status=status.HTTP_403_FORBIDDEN)
        invitation = Invitation.objects.filter(pk=pk).first()
        if invitation is None:
            return None, Response({'detail': 'Invitation not found.'}, status=status.HTTP_404_NOT_FOUND)
        return invitation, None

    def delete(self, request, pk):
        invitation, error = self._get(request, pk)
        if error:
            return error
        if invitation.status == 'accepted':
            return Response({'detail': 'That invitation has already been accepted.'}, status=status.HTTP_400_BAD_REQUEST)
        invitation.status = 'revoked'
        invitation.save(update_fields=['status'])
        return Response({'detail': 'Invitation withdrawn.'})

    def post(self, request, pk):
        invitation, error = self._get(request, pk)
        if error:
            return error
        if invitation.status == 'accepted':
            return Response({'detail': 'That invitation has already been accepted.'}, status=status.HTTP_400_BAD_REQUEST)
        invitation.set_token()
        invitation.set_code()
        invitation.status = 'pending'
        invitation.expires_at = timezone.now() + invitation_link_lifetime()
        invitation.save()
        email_sent = False
        try:
            send_invitation_email(invitation)
            email_sent = True
            invitation.sent_at = timezone.now()
            invitation.save(update_fields=['sent_at'])
        except Exception:
            email_sent = False
        payload = InvitationSerializer(invitation).data
        payload['invite_url'] = invitation_url(invitation)
        payload['invite_code'] = invitation_code_text(invitation)
        payload['email_sent'] = email_sent
        if not email_sent:
            payload['detail'] = 'The invitation is ready, but the email could not be sent. Share the link directly instead.'
        return Response(payload)


class InvitationVerifyView(APIView):
    """Public: is this invitation link still usable, and who is it for?"""

    permission_classes = [AllowAny]
    # Public token lookups are rate limited per client address: the token is
    # unguessable, but probing should not be free. Verify and accept share one
    # budget so splitting attempts across the two endpoints buys nothing.
    throttle_classes = [PublicTokenThrottle]
    throttle_scope = 'invitation_public'

    def get(self, request):
        invitation = Invitation.from_token_or_code(
            token=request.query_params.get('token'),
            code=request.query_params.get('code'),
        )
        if invitation is None or invitation.status == 'revoked':
            return Response({'detail': 'This invitation is not valid. Please ask the church office for a new one.'}, status=status.HTTP_400_BAD_REQUEST)
        if invitation.status == 'accepted':
            return Response({'detail': 'This invitation has already been used. You can sign in with your account.'}, status=status.HTTP_400_BAD_REQUEST)
        if invitation.expires_at <= timezone.now():
            return Response({'detail': 'This invitation has expired. Please ask the church office to invite you again.'}, status=status.HTTP_400_BAD_REQUEST)
        # A plain member/friend invitation has no special access to announce,
        # so the accept-invite page stays quiet about access for it.
        special_codes = [code for code in invitation.role_codes() if code != DEFAULT_ROLE]
        return Response({
            'email': invitation.email,
            'first_name': invitation.first_name,
            'last_name': invitation.last_name,
            'phone_number': invitation.phone_number,
            'account_type': invitation.account_type,
            'account_type_display': invitation.get_account_type_display(),
            'roles': invitation.role_codes(),
            'roles_display': role_labels(special_codes),
            'church_name': current_church_name(),
            'expires_at': invitation.expires_at,
        })


class InvitationAcceptView(APIView):
    """Public: the invitee sets their own username and password."""

    permission_classes = [AllowAny]
    throttle_classes = [PublicTokenThrottle]
    throttle_scope = 'invitation_public'

    def post(self, request):
        serializer = InvitationAcceptSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # Link first, then the code beside it: either one identifies the same
        # invitation, so an invitee whose mail app will not open the link still
        # has a way in.
        invitation = Invitation.from_token_or_code(
            token=serializer.validated_data.get('token'),
            code=serializer.validated_data.get('code'),
        )
        if invitation is None or invitation.status == 'revoked':
            return Response({'detail': 'This invitation is not valid. Please ask the church office for a new one.'}, status=status.HTTP_400_BAD_REQUEST)
        if invitation.status == 'accepted':
            return Response({'detail': 'This invitation has already been used. You can sign in with your account.'}, status=status.HTTP_400_BAD_REQUEST)
        if invitation.expires_at <= timezone.now():
            return Response({'detail': 'This invitation has expired. Please ask the church office to invite you again.'}, status=status.HTTP_400_BAD_REQUEST)

        first_name = serializer.validated_data.get('first_name', '').strip() or invitation.first_name.strip()
        last_name = serializer.validated_data.get('last_name', '').strip() or invitation.last_name.strip()
        phone_number = serializer.validated_data.get('phone_number', '').strip() or invitation.phone_number.strip()
        if not first_name:
            return Response({'first_name': 'Enter your first name.'}, status=status.HTTP_400_BAD_REQUEST)
        if not last_name:
            return Response({'last_name': 'Enter your last name.'}, status=status.HTTP_400_BAD_REQUEST)
        if phone_number and not re.fullmatch(r'\d{10}', re.sub(r'\D', '', phone_number)):
            return Response({'phone_number': 'Enter a valid 10-digit phone number.'}, status=status.HTTP_400_BAD_REQUEST)
        phone_number = re.sub(r'\D', '', phone_number)

        username = serializer.validated_data['username'].strip()
        password = serializer.validated_data['password']
        if User.objects.filter(username__iexact=username).exists():
            return Response({'username': 'That username is already taken. Please choose another one.'}, status=status.HTTP_400_BAD_REQUEST)
        if User.objects.filter(email__iexact=invitation.email).exists():
            return Response({'detail': 'An account already exists for this email address. Try signing in or resetting your password.'}, status=status.HTTP_400_BAD_REQUEST)

        candidate = User(username=username, email=invitation.email, first_name=first_name, last_name=last_name)
        try:
            validate_password(password, candidate)
        except Exception as error:
            messages = getattr(error, 'messages', None) or [str(error)]
            return Response({'password': messages}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            user = User.objects.create_user(
                username=username,
                email=invitation.email,
                first_name=first_name,
                last_name=last_name,
                password=password,
            )
            profile, _ = MemberProfile.objects.get_or_create(user=user)
            codes = [code for code in invitation.role_codes() if code != DEFAULT_ROLE]
            profile.role = codes[0] if codes else ''
            profile.roles = ', '.join(codes)
            profile.account_type = invitation.account_type
            consent_time = timezone.now()
            profile.privacy_accepted_at = consent_time
            profile.privacy_policy_version = CURRENT_PRIVACY_POLICY_VERSION
            profile.terms_accepted_at = consent_time
            profile.terms_of_use_version = CURRENT_TERMS_OF_USE_VERSION
            if phone_number:
                profile.phone_number = phone_number
            profile.save()

            group_names = sorted({ROLE_GROUP_MAP[code] for code in codes if code in ROLE_GROUP_MAP})
            if group_names:
                user.groups.set(Group.objects.filter(name__in=group_names))

            invitation.user = user
            invitation.status = 'accepted'
            invitation.accepted_at = timezone.now()
            invitation.save(update_fields=['user', 'status', 'accepted_at'])

        return Response({
            'message': 'Your account is ready. You can now sign in with your username and password.',
            'username': user.username,
        }, status=status.HTTP_201_CREATED)


class GoogleLoginView(APIView):
    """Public: sign in with a Google account instead of a password.

    Only accounts that already exist can come in this way. An unknown Google
    address is never handed a new account — membership is granted by the church,
    not by whoever holds a Gmail address — and an account still awaiting
    leadership approval is refused, exactly as the password endpoint refuses it.
    Nothing in the request is believed about who the member is: the address comes
    from the signed token, never from the request body.
    """

    permission_classes = [AllowAny]
    authentication_classes = []
    # The credential is verified before anything else, but this endpoint signs an
    # unauthenticated caller in, so it carries the same small hourly budget as
    # the other public, token-minting endpoints.
    throttle_classes = [PublicTokenThrottle]
    throttle_scope = 'google_signin'

    def post(self, request):
        try:
            claims = verify_google_credential(str(request.data.get('credential') or '').strip())
        except GoogleCredentialError as error:
            return Response(
                {'detail': str(error)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE if error.unavailable else status.HTTP_400_BAD_REQUEST,
            )

        identity = GoogleIdentity.objects.select_related('user').filter(sub=claims['sub']).first()
        if identity is None:
            user = self._account_for_email(claims['email'])
            if user is None:
                return Response(
                    {'detail': 'No church account uses that Google address. Create an account first, or sign in with your username and password.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            # First sign-in from this Google account: record the link so later
            # sign-ins key on the Google subject id alone, which survives the
            # member renaming their Gmail address. A request racing this one may
            # insert the same link first; the row that lands is the one that counts.
            identity, _ = GoogleIdentity.objects.get_or_create(
                sub=claims['sub'],
                defaults={'user': user, 'email': claims['email']},
            )
        user = identity.user
        if str(identity.email).lower() != claims['email']:
            identity.email = claims['email']
            identity.save(update_fields=['email'])
        if not user.is_active:
            return Response(
                {'detail': 'Your account is still waiting for approval. Please contact the church office.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return Response(sign_in_payload(user))

    @staticmethod
    def _account_for_email(email):
        """The one church account carrying this Google address, or None.

        The address is not unique in the database (Django's default user model
        does not enforce it), so an address shared by two accounts is refused
        rather than guessed at: signing in the wrong member would be worse than
        asking them to use their password.
        """
        matches = list(User.objects.filter(email__iexact=email).order_by('pk')[:2])
        return matches[0] if len(matches) == 1 else None


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        password = str(request.data.get('password') or '')
        confirm_password = str(request.data.get('confirm_password') or '')
        if password != confirm_password:
            return Response({'confirm_password': 'The two passwords do not match.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_church_password(password)
        except Exception as error:
            return Response({'password': getattr(error, 'messages', None) or [str(error)]}, status=status.HTTP_400_BAD_REQUEST)

        request.user.set_password(password)
        request.user.save(update_fields=['password'])
        profile = getattr(request.user, 'member_profile', None)
        if profile:
            profile.must_change_password = False
            profile.save(update_fields=['must_change_password'])
        return Response({'message': 'Your password has been changed successfully.'})


class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get('email', '').strip()
        user = User.objects.filter(email__iexact=email, is_active=True).first()
        if user:
            send_password_reset_email(user, user.pk, default_token_generator.make_token(user))
        return Response({'message': 'If an account exists for that email, a password reset link has been sent.'})


class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        user = User.objects.filter(pk=request.data.get('uid'), is_active=True).first()
        token = request.data.get('token')
        if not user or not default_token_generator.check_token(user, token):
            return Response({'detail': 'This password reset link is invalid or expired.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_password(request.data.get('password', ''), user)
        except Exception as error:
            return Response({'password': list(error.messages)}, status=status.HTTP_400_BAD_REQUEST)
        user.set_password(request.data['password'])
        user.save(update_fields=['password'])
        return Response({'message': 'Your password has been reset. You can now sign in.'})


def announcement_emails_run_inline():
    """True while mail never really leaves the box: tests and development.

    Django's test runner swaps SMTP for the in-memory backend (tests read their
    assertions out of that outbox, which a background thread cannot reach in
    time), and development prints mail to the console. Both are instant, so the
    broadcast simply runs in the request there. Only a real SMTP send — the
    throttled, minutes-long one — is pushed to a background thread.
    """
    return not settings.EMAIL_BACKEND.endswith('smtp.EmailBackend')


def dispatch_announcement_emails_safely(announcement_id):
    """Run the announcement broadcast off the request cycle, failures logged.

    Threaded because the throttled pace makes a whole-congregation broadcast a
    minutes-long job that must not hold an officer's request open (or a gunicorn
    worker). ``fail_silently=False`` sends raise inside the loop; anything that
    escapes it — a database error, a closed connection at the very first open —
    is logged here so a failed broadcast is a visible log line, not silence.
    """
    try:
        announcement = Announcement.objects.get(id=announcement_id)
    except Announcement.DoesNotExist:
        # Deleted between the post and the thread's start — nothing to send.
        return
    try:
        send_announcement_emails(announcement)
    except Exception:
        logger.exception('Announcement email broadcast for #%s failed', announcement_id)


def can_manage_announcements(user):
    """Leadership test shared by the announcement endpoints.

    Posting is a right carried by roles (see ``roles.DEFAULT_ROLE_RIGHTS`` and
    the Church Roles Configuration screen), so the test is now rights-based:
    every held role counts — including its assistant holders — and the
    administrator role carries every right by definition. Django staff and
    superusers still count as administrators so the site owner can always
    post, edit and delete.
    """
    if not user or not user.is_authenticated:
        return False
    if user.is_staff or user.is_superuser:
        return True
    from .roles import user_has_right
    return user_has_right(user, 'announcements')


# One broadcast at a time: the per-message pause only keeps the sending
# velocity gentle if two officers posting at once cannot stack two loops — the
# second broadcast waits for the first to finish.
_announcement_broadcast_lock = threading.Lock()


def send_announcement_emails(announcement):
    """Deliver an announcement, one broadcast at a time.

    Serialised: the second officer's posting waits rather than doubling the
    sending rate.
    """
    _announcement_broadcast_lock.acquire()
    try:
        return _send_announcement_emails_locked(announcement)
    finally:
        _announcement_broadcast_lock.release()


def _send_announcement_emails_locked(announcement):
    """Deliver an announcement to each member's own inbox, greeted by name.

    One message per recipient rather than one message with the whole
    congregation in its ``To`` header: every member is addressed the way a
    receipt addresses them ("Dear {name},") and no member sees anyone else's
    address.

    The sends share one SMTP connection so a large congregation stays a quick
    job rather than a connection per member — but with a deliberate pause
    between messages. A machine-gun loop with no gap is exactly the "unusual
    sending activity" that got the mailbox blocked mid-broadcast (SMTP 550
    5.4.6): Zoho and Gmail alike police sending velocity, not just daily
    totals. The pause is configured in settings (ANNOUNCEMENT_SEND_DELAY), and
    the whole broadcast can ride a separate mailbox via the
    ANNOUNCEMENT_EMAIL_* settings so bulk volume never spends the main
    account's velocity budget. A send that fails is logged with its recipient
    and the server's answer instead of being swallowed — the Sep 25 failure
    looked like success because nobody could see it.
    """
    from django.contrib.auth.models import User
    from django.core.mail import EmailMessage, get_connection

    church_name = current_church_name()
    subject = f"Church Announcement: {announcement.title}"
    attachment_bytes = None
    attachment_name = None
    if announcement.attachment:
        try:
            with announcement.attachment.open('rb') as fh:
                attachment_bytes = fh.read()
            attachment_name = announcement.attachment.name.rsplit('/', 1)[-1]
        except Exception:
            attachment_bytes = None

    connection = get_connection(
        host=settings.ANNOUNCEMENT_EMAIL_HOST,
        port=settings.ANNOUNCEMENT_EMAIL_PORT,
        username=settings.ANNOUNCEMENT_EMAIL_HOST_USER,
        password=settings.ANNOUNCEMENT_EMAIL_HOST_PASSWORD,
        use_tls=settings.ANNOUNCEMENT_EMAIL_USE_TLS,
        timeout=settings.EMAIL_TIMEOUT,
    )
    try:
        connection.open()
    except Exception:
        connection = None

    sent = 0
    failed = 0
    seen = set()
    try:
        for email, body in announcement_email_recipients(announcement, church_name):
            message = EmailMessage(subject, body, settings.ANNOUNCEMENT_FROM_EMAIL, [email], connection=connection)
            if attachment_bytes:
                # The flyer or document rides along with the email; the SMS
                # channel stays text-only by design.
                message.attach(attachment_name, attachment_bytes)
            try:
                message.send(fail_silently=False)
                sent += 1
            except Exception as exc:
                # One blocked recipient must not hide the rest — but it must
                # also not disappear. A throttled mailbox answers 550 with its
                # reason; that answer belongs in the logs.
                failed += 1
                logger.warning('Announcement email to %s failed: %s', email, exc)
                # A refusal mid-broadcast usually means the mailbox itself has
                # been blocked or the connection went stale; continuing
                # one-by-one only burns the rest of the list on a dead
                # connection. Distinguish the two by counting failures.
                if failed >= settings.ANNOUNCEMENT_MAX_CONSECUTIVE_FAILURES:
                    logger.error(
                        'Announcement broadcast aborted after %d consecutive failures '
                        '(last error: %s). %d recipients were not reached.',
                        failed, exc, max(0, announcement_recipient_count(announcement, church_name) - sent - failed),
                    )
                    break
            if settings.ANNOUNCEMENT_SEND_DELAY > 0:
                time.sleep(settings.ANNOUNCEMENT_SEND_DELAY)
    finally:
        if connection is not None:
            try:
                connection.close()
            except Exception:
                pass
    if failed:
        logger.warning('Announcement broadcast finished: %d sent, %d failed.', sent, failed)
    return sent


def announcement_email_recipients(announcement, church_name):
    """Yield ``(address, body)`` pairs for an announcement's email audience.

    Split from ``send_announcement_emails`` so the size of the audience can be
    counted (for the failure log) without re-sending anything.
    """
    from django.contrib.auth.models import User

    seen = set()
    # An audience addresses the email to the ministry offices named: a post to
    # the choir goes to the choir's holders, not the whole congregation. Empty
    # audience keeps the broadcast to everyone.
    recipients = User.objects.filter(is_active=True).exclude(email='')
    audience_codes = list(getattr(announcement, 'audience', None) or [])
    if audience_codes:
        # The audience addresses the email to the ministry offices named: a
        # post to the choir goes to the choir's holders, not the congregation.
        holder_ids = set()
        for profile in MemberProfile.objects.select_related('user').filter(user__is_active=True):
            if set(profile.get_roles()) & set(audience_codes):
                holder_ids.add(profile.user_id)
        recipients = User.objects.filter(id__in=holder_ids, is_active=True).exclude(email='')
    for first_name, last_name, username, email in (
        recipients.values_list('first_name', 'last_name', 'username', 'email')
    ):
        address = (email or '').strip()
        if not address or address.lower() in seen:
            continue
        seen.add(address.lower())
        # Same convention as a receipt: the member's own name, or a plain
        # 'friend' when the account carries none.
        name = ' '.join(part for part in (first_name, last_name) if part).strip() or 'friend'
        body = f"Dear {name},\n\n{announcement.title}\n\n{announcement.text}"
        if announcement.detail:
            body += f"\n\n{announcement.detail}"
        body += f"\n\n{church_name}"
        yield address, body


def announcement_recipient_count(announcement, church_name):
    """How many inboxes the broadcast addresses (for honest failure logs)."""
    return sum(1 for _ in announcement_email_recipients(announcement, church_name))


class CanManageAnnouncements(permissions.BasePermission):
    """Posting is a leadership right, decided before the body is validated.

    The check used to sit in ``perform_create``, which runs after the serializer:
    a member without the right was told their announcement dates were missing
    rather than that posting was never theirs to do.
    """

    def has_permission(self, request, view):
        return can_manage_announcements(request.user)


class AnnouncementView(generics.ListCreateAPIView):
    serializer_class = AnnouncementSerializer

    def get_permissions(self):
        return [IsAuthenticated(), CanManageAnnouncements()] if self.request.method == 'POST' else [AllowAny()]

    def get_queryset(self):
        from django.db.models import Q
        from django.utils import timezone
        today = timezone.now().date()
        
        is_admin = can_manage_announcements(self.request.user)

        if is_admin and self.request.query_params.get('include_unpublished') == 'true':
            queryset = Announcement.objects.all()
        else:
            queryset = Announcement.objects.filter(published=True)

        # The event the announcement is about is its clock: a post comes down
        # the day after its event's last date (an undated post falls back to a
        # legacy display window if one was ever set — the window fields are
        # retired from the form). The management screen opts out to see what
        # has lapsed.
        if self.request.query_params.get('include_expired') != 'true':
            dated_alive = (
                # A finished event range is gone; a single-day event that is
                # today or ahead is still alive.
                Q(event_date_to__isnull=False, event_date_to__gte=today)
                | Q(event_date_to__isnull=True, event_date_from__isnull=False, event_date_from__gte=today)
            )
            undated_alive = (
                Q(event_date_from__isnull=True, event_date_to__isnull=True)
                & (Q(expires_at__isnull=True) | Q(expires_at__gte=today))
            )
            queryset = queryset.filter(dated_alive | undated_alive)
        if self.request.query_params.get('include_scheduled') != 'true':
            # An event dated in the future is not hidden — it leads the feed —
            # but a legacy start date still holds older posts back.
            queryset = queryset.filter(Q(starts_at__isnull=True) | Q(starts_at__lte=today))
        search = self.request.query_params.get('search', '').strip()
        if search:
            queryset = queryset.filter(Q(title__icontains=search) | Q(text__icontains=search) | Q(detail__icontains=search))
        if self.request.user.is_authenticated:
            return queryset
        return queryset.filter(visibility__in=['public_website', 'all'])

    def list(self, request, *args, **kwargs):
        """The event's start date is the announcement's position.

        The starting date of the event determines where a post sits in the
        feed: the soonest-starting event leads, and a running event (today
        inside its range) leads those. Announcements without an event keep
        their posting order (newest first) behind the dated ones.
        """
        queryset = list(self.filter_queryset(self.get_queryset()))
        today = timezone.localdate()

        def urgency(announcement):
            if announcement.event_date_from is None:
                return None
            start = announcement.event_date_from
            end = announcement.event_date_to or announcement.event_date_from
            if start <= today <= end:
                return 0  # running: today is the day
            return (start - today).days  # days until it begins

        queryset.sort(key=lambda a: a.created_at, reverse=True)
        dated = [a for a in queryset if urgency(a) is not None]
        # Stable sort: ties inside one distance band keep newest posting first.
        dated.sort(key=urgency)
        undated = [a for a in queryset if urgency(a) is None]
        return Response(self.get_serializer(dated + undated, many=True).data)

    def perform_create(self, serializer):
        # Leadership was already established by CanManageAnnouncements.
        announcement = serializer.save()

        # Handle Site / SMS / Email broadcast
        sharing_raw = (announcement.sharing_option or '').lower()
        channels = [c.strip() for c in sharing_raw.replace(';', ',').split(',') if c.strip()]
        send_email = any(c in ('email', 'all') for c in channels) or sharing_raw in ('email', 'all')
        send_sms = any(c in ('sms', 'all') for c in channels) or sharing_raw in ('sms', 'all')
        show_site = any(c in ('site', 'all') for c in channels) or sharing_raw in ('site', 'all') or not channels

        # Publish strictly by channel choice: an announcement that goes out on
        # the site is visible; email/SMS-only ones stay off the site.
        announcement.published = show_site
        announcement.save(update_fields=['published'])

        if send_email:
            # The broadcast takes a real-time pause between messages (a pace
            # mail hosts accept), so it runs in a background thread and the
            # officer posting never waits on it — or trips gunicorn's worker
            # timeout when the congregation is large. In development and the
            # test suite the send runs inline: tests assert on mail.outbox,
            # which a thread cannot reach before the assertion runs.
            if announcement_emails_run_inline():
                try:
                    send_announcement_emails(announcement)
                except Exception:
                    logger.exception('Announcement email broadcast failed')
            else:
                threading.Thread(
                    target=dispatch_announcement_emails_safely,
                    args=(announcement.id,),
                    name=f'announcement-email-{announcement.id}',
                    daemon=True,
                ).start()

        if send_sms:
            try:
                from django.contrib.auth.models import User
                # Same audience rule as the email: a post addressed to a
                # ministry notifies its holders, otherwise the congregation.
                sms_recipients = User.objects.filter(is_active=True)
                audience_codes = list(announcement.audience or [])
                if audience_codes:
                    holder_ids = set()
                    for profile in MemberProfile.objects.select_related('user').filter(user__is_active=True):
                        if set(profile.get_roles()) & set(audience_codes):
                            holder_ids.add(profile.user_id)
                    sms_recipients = sms_recipients.filter(id__in=holder_ids)
                for u in sms_recipients:
                    ChurchNotification.objects.create(
                        user=u,
                        title=f"SMS Announcement: {announcement.title}",
                        message=announcement.text or announcement.title,
                    )
            except Exception:
                pass


class AnnouncementDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = AnnouncementSerializer

    def get_permissions(self):
        # Anyone may read a published announcement; only authenticated
        # leaders may change or remove one.
        if self.request.method in ('PUT', 'PATCH', 'DELETE'):
            return [IsAuthenticated()]
        return [AllowAny()]

    def get_queryset(self):
        # Drafts (unpublished) stay invisible by id too, not just in lists.
        if can_manage_announcements(self.request.user):
            return Announcement.objects.all()
        return Announcement.objects.filter(published=True)

    def perform_update(self, serializer):
        if not can_manage_announcements(self.request.user):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only church administrators, clerks or elders can edit announcements.')
        # Editing the sharing channels re-decides site visibility, so an
        # announcement whose channels gain or lose "site" flips accordingly.
        announcement = serializer.save()
        sharing_raw = (announcement.sharing_option or '').lower()
        channels = [c.strip() for c in sharing_raw.replace(';', ',').split(',') if c.strip()]
        show_site = any(c in ('site', 'all') for c in channels) or sharing_raw in ('site', 'all') or not channels
        if announcement.published != show_site:
            announcement.published = show_site
            announcement.save(update_fields=['published'])

    def perform_destroy(self, instance):
        if not can_manage_announcements(self.request.user):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only church administrators, clerks or elders can delete announcements.')
        instance.delete()


class AnnouncementActionView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, pk):
        try:
            announcement = Announcement.objects.get(pk=pk, published=True)
        except Announcement.DoesNotExist:
            return Response({'detail': 'Announcement not found.'}, status=status.HTTP_404_NOT_FOUND)

        action_type = request.data.get('action_type', announcement.action_type)
        pledge_amount = request.data.get('pledge_amount')
        response_text = request.data.get('response_text', '')
        respondent_name = request.data.get('respondent_name', '')
        respondent_phone = request.data.get('respondent_phone', '')

        user = request.user if request.user.is_authenticated else None
        if user and not respondent_name:
            respondent_name = user.get_full_name() or user.username

        response_obj = AnnouncementResponse.objects.create(
            announcement=announcement,
            user=user,
            action_type=action_type,
            pledge_amount=pledge_amount if pledge_amount else None,
            response_text=response_text,
            respondent_name=respondent_name,
            respondent_phone=respondent_phone,
        )

        return Response({
            'detail': 'Action recorded successfully.',
            'id': response_obj.id,
            'action_type': response_obj.action_type,
        }, status=status.HTTP_201_CREATED)


class MissionReadingRedirectView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, audience):
        fallback = MISSION_READING_SOURCES.get(audience, MISSION_READING_SOURCES['adults'])
        if audience not in MISSION_READING_SOURCES:
            return HttpResponseRedirect(fallback)
        key = f'mission_{audience}'
        destination = cached_resource_url(key)
        if destination and not re.search(rf'/mission-quarterlies/{"children" if audience == "children" else "youth-and-adult"}/articles/[^/?#]+/?$', destination):
            destination = None
        if not destination:
            try:
                destination = save_resource_url(key, first_mission_story_url(audience))
            except Exception:
                destination = fallback
        return HttpResponseRedirect(destination or fallback)


class AdultLessonRedirectView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        destination = cached_resource_url('adult_lesson')
        if destination and destination.startswith('https://sabbath.school'):
            destination = None
        if not destination:
            try:
                destination = save_resource_url('adult_lesson', current_adult_lesson_url())
            except Exception:
                destination = SSNET_WEEKLY_LESSON_URL
        return HttpResponseRedirect(destination or SSNET_WEEKLY_LESSON_URL)


class YaLessonRedirectView(APIView):
    """The Young Adult (YA) lesson page for the current week.

    Inverse publishes a whole quarter behind one study page, so this week's
    lesson is resolved from the content API once a week and the stored page is
    reused for the rest of that lesson week.
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        destination = cached_weekly_resource_url('ya_lesson')
        if not destination:
            try:
                destination = save_resource_url('ya_lesson', current_ya_lesson_url())
            except Exception:
                destination = YA_LESSON_URL
        return HttpResponseRedirect(destination or YA_LESSON_URL)


class AdultLessonPdfRedirectView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, kind):
        if kind not in ('lesson', 'teachers'):
            return HttpResponseRedirect(ADULT_LESSON_SOURCE)
        key = f'adult_pdf_{kind}'
        destination = cached_resource_url(key)
        if not destination:
            try:
                destination = save_resource_url(key, current_adult_pdf_url(kind))
            except Exception:
                destination = ADULT_LESSON_SOURCE
        return HttpResponseRedirect(destination or ADULT_LESSON_SOURCE)


class ChildrenLessonRedirectView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, division, audience):
        fallback = CHILDREN_LESSON_SOURCES.get(division, CHILDREN_LESSON_SOURCES['primary'])
        if division not in CHILDREN_LESSON_SOURCES or audience not in ('students', 'teachers'):
            return HttpResponseRedirect(fallback)
        key = f'children_{division}_{audience}'
        destination = cached_resource_url(key)
        if not destination:
            try:
                destination = save_resource_url(key, first_children_lesson_url(division, audience))
            except Exception:
                destination = fallback.replace('/students', f'/{audience}')
        return HttpResponseRedirect(destination or fallback)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile = getattr(request.user, 'member_profile', None)
        return Response({
            'id': request.user.id,
            'username': request.user.username,
            'email': request.user.email,
            'first_name': request.user.first_name,
            'last_name': request.user.last_name,
            'phone_number': profile.phone_number if profile else '',
            'role': profile.role if profile else 'member',
            'roles': profile.get_roles() if profile else ['member'],
            'is_staff': request.user.is_staff,
            'is_superuser': request.user.is_superuser,
            'gender': profile.gender if profile else '',
            'gifts': profile.gifts if profile else '',
            'ministry': profile.ministry if profile else '',
            'disability': profile.disability if profile else '',
            'profile_update_pending': bool(profile and profile.needs_profile_update()),
        })

    def patch(self, request):
        """Let a member set or correct the email on their own account.

        Gift receipts are addressed from the account, never from the giving
        form, so a member whose account has no address could never receive
        one. This is the way out of that: the address is written to the
        account first, and the next receipt follows it. An empty string clears
        it, which is how a member says they would rather have SMS only.
        """
        serializer = MemberEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        request.user.email = serializer.validated_data['email']
        request.user.save(update_fields=['email'])
        return self.get(request)


class ProfileUpdateView(APIView):
    """The forced profile update: sex, gifts, ministry and disability.

    Members whose sign-in response says ``profile_update_pending`` land here
    before anything else. The endpoint only accepts those four fields, so the
    form can never quietly write something else, and it clears the pending
    flag only once every field carries a value — an empty gifts box cannot
    dismiss the request.
    """

    permission_classes = [IsAuthenticated]

    MINISTRY_VALUES = {code for code, _label in MemberProfile.MINISTRY_CHOICES}

    def post(self, request):
        profile = MemberProfile.objects.filter(user=request.user).first()
        if profile is None:
            profile = MemberProfile.objects.create(user=request.user)

        def as_text(value):
            """Accept a string or a list of picks; store one comma-joined line."""
            if isinstance(value, list):
                return ', '.join(str(item).strip() for item in value if str(item).strip())
            return str(value or '').strip()

        if 'gender' in request.data:
            profile.gender = as_text(request.data.get('gender'))[:20]
        if 'gifts' in request.data:
            profile.gifts = as_text(request.data.get('gifts'))
        if 'ministry' in request.data:
            ministry = as_text(request.data.get('ministry'))
            if ministry and ministry not in self.MINISTRY_VALUES:
                return Response({'ministry': 'Choose one of the listed ministries.'}, status=status.HTTP_400_BAD_REQUEST)
            profile.ministry = ministry
        if 'disability' in request.data:
            profile.disability = as_text(request.data.get('disability'))

        missing = profile.missing_profile_details()
        if missing:
            labels = {
                'gender': 'sex',
                'gifts': 'gifts & talents',
                'ministry': 'ministry',
                'disability': 'disability / special needs',
            }
            return Response(
                {'detail': f"Please complete: {', '.join(labels[field] for field in missing)}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        profile.profile_update_pending = False
        profile.save()
        return Response({'detail': 'Thank you — your details have been saved.', 'profile_update_pending': False})


class EnrollmentDetailsView(APIView):
    permission_classes = [IsAuthenticated]

    def _enrollment(self, request):
        return EnrollmentRequest.objects.filter(user=request.user).order_by('-created_at').first()

    def get(self, request):
        enrollment = self._enrollment(request)
        if not enrollment:
            return Response({'detail': 'No enrollment request is linked to this account.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'date_of_birth': enrollment.date_of_birth, 'county_of_birth': enrollment.county_of_birth, 'education_level': enrollment.education_level, 'profession': enrollment.profession, 'residence': enrollment.residence, 'current_church': enrollment.current_church})

    def patch(self, request):
        enrollment = self._enrollment(request)
        if not enrollment:
            return Response({'detail': 'No enrollment request is linked to this account.'}, status=status.HTTP_404_NOT_FOUND)
        allowed = ('date_of_birth', 'county_of_birth', 'education_level', 'profession', 'residence', 'current_church')
        for field in allowed:
            if field in request.data:
                setattr(enrollment, field, request.data.get(field) or '')
        enrollment.save(update_fields=[field for field in allowed if field in request.data])
        return self.get(request)


class MyContributionsView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ContributionSerializer

    def get_queryset(self):
        # Completed payments are the member's giving record. Cancelled or
        # failed M-Pesa attempts are terminal records of prompts that never
        # became money: they never read as pending and default views exclude
        # them, but the give page opts in with ?include_failed=1 for
        # transparency.
        statuses = ['completed']
        if self.request.query_params.get('include_failed') in ('1', 'true'):
            statuses = ['completed', 'failed', 'cancelled']
        return Contribution.objects.filter(member=self.request.user, status__in=statuses)


def ensure_giver_profile(donor_name, phone_number, donor_email):
    """
    Ensures that a giver exists as a User with a MemberProfile (account_type='friend' if new).
    Returns the User object or None.
    """
    donor_name = (donor_name or '').strip()
    phone_number = (phone_number or '').strip()
    donor_email = (donor_email or '').strip()

    if not donor_name and not phone_number and not donor_email:
        return None

    User = get_user_model()
    user = None

    if donor_email:
        user = User.objects.filter(email__iexact=donor_email).first()
    if not user and phone_number:
        clean_phone = phone_number.replace('+', '').replace(' ', '')
        user = User.objects.filter(member_profile__phone_number=clean_phone).first()

    if not user and (donor_name or phone_number or donor_email):
        name_parts = (donor_name or 'Friend').split(' ', 1)
        first_name = name_parts[0]
        last_name = name_parts[1] if len(name_parts) > 1 else ''

        clean_phone = phone_number.replace('+', '').replace(' ', '')
        slug_identifier = clean_phone if clean_phone else (donor_email.split('@')[0] if donor_email else donor_name.lower().replace(' ', ''))
        base_username = f"friend.{slug_identifier}"
        username = base_username[:140]
        count = 1
        while User.objects.filter(username=username).exists():
            username = f"{base_username[:130]}_{count}"
            count += 1

        email = donor_email if donor_email else f"{username}@friend.church"
        user = User.objects.create(
            username=username,
            email=email,
            first_name=first_name,
            last_name=last_name,
            is_active=True
        )
        user.set_unusable_password()
        user.save()

        MemberProfile.objects.create(
            user=user,
            phone_number=phone_number,
            account_type='friend',
            role='member'
        )

    return user


class TreasurerCashContributionView(generics.ListCreateAPIView):
    serializer_class = CashContributionSerializer
    permission_classes = [IsAuthenticated]

    def _require_finance_manager(self):
        if not is_finance_manager(self.request.user):
            raise PermissionDenied('Only finance managers can access cash contributions.')

    def get_queryset(self):
        self._require_finance_manager()
        queryset = CashContribution.objects.all()
        from_val = self.request.query_params.get('from_date') or self.request.query_params.get('from')
        to_val = self.request.query_params.get('to_date') or self.request.query_params.get('to')
        received_on = self.request.query_params.get('date')

        if from_val or to_val:
            today_str = timezone.localdate().isoformat()
            from_str = from_val or received_on or today_str
            to_str = to_val or received_on or today_str
            try:
                start_date = datetime.strptime(from_str, '%Y-%m-%d').date()
                end_date = datetime.strptime(to_str, '%Y-%m-%d').date()
            except ValueError:
                raise ValidationError({'date': 'Use YYYY-MM-DD.'})
            queryset = queryset.filter(received_on__range=(start_date, end_date))
        elif received_on:
            try:
                selected_date = datetime.strptime(received_on, '%Y-%m-%d').date()
            except ValueError:
                raise ValidationError({'date': 'Use YYYY-MM-DD.'})
            queryset = queryset.filter(received_on=selected_date)
        return queryset

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        if hasattr(self, 'receipt_delivery_message') and isinstance(response.data, dict):
            response.data['receipt_delivery_message'] = self.receipt_delivery_message
        return response

    def perform_create(self, serializer):
        self._require_finance_manager()
        cash = serializer.save(received_by=self.request.user)
        if not cash.receipt_number:
            cash.receipt_number = f"REC-{timezone.localdate().strftime('%Y%m')}-{cash.id:04d}"
            cash.save(update_fields=['receipt_number'])
        if cash.entry_type == 'individual':
            if cash.donor_name or cash.giver_phone or cash.giver_email:
                ensure_giver_profile(cash.donor_name, cash.giver_phone, cash.giver_email)
            send_sms = str(self.request.data.get('send_sms', 'true')).lower() in ('true', '1')
            send_email = str(self.request.data.get('send_email', 'true')).lower() in ('true', '1')
            delivery = send_cash_receipt(cash, send_sms=send_sms, send_email=send_email)
            self.receipt_delivery_message = cash_receipt_delivery_message(
                delivery,
                email_requested=send_email,
                sms_requested=send_sms,
                has_email=bool(cash.giver_email),
                has_phone=bool(cash.giver_phone),
            )
        elif cash.entry_type == 'anonymous':
            if not cash.donor_name.strip():
                cash.donor_name = 'Anonymous Giver'
                cash.save(update_fields=['donor_name'])
        # Money keyed in at the desk is money in the treasury: the account the
        # receipt names is credited now, so the treasurer never has to enter
        # the same figure twice. Anonymous rows credit their account too — the
        # giver is unknown, the money is not.
        credit_account(
            purpose=cash.purpose,
            amount=cash.amount,
            description=f"Contribution — {cash.get_payment_method_display()} ({cash.purpose})",
            reference=cash.receipt_number or f'CASH-{cash.id}',
            created_by=self.request.user,
        )


class ContributionReconciliationView(APIView):
    permission_classes = [IsAuthenticated]

    def _selected_date_range(self, request):
        from_val = request.query_params.get('from_date') or request.query_params.get('from')
        to_val = request.query_params.get('to_date') or request.query_params.get('to')
        date_val = request.query_params.get('date')

        today_str = timezone.localdate().isoformat()
        if from_val or to_val:
            from_str = from_val or date_val or today_str
            to_str = to_val or date_val or today_str
        elif date_val:
            from_str = date_val
            to_str = date_val
        else:
            from_str = today_str
            to_str = today_str

        try:
            start_date = datetime.strptime(from_str, '%Y-%m-%d').date()
            end_date = datetime.strptime(to_str, '%Y-%m-%d').date()
        except ValueError:
            raise ValidationError({'date': 'Use YYYY-MM-DD.'})

        return start_date, end_date

    def _require_finance_manager(self, request):
        if not is_finance_manager(request.user):
            raise PermissionDenied('Only finance managers can reconcile contributions.')

    def _response(self, start_date, end_date):
        from django.db.models import Sum, Q
        digital_filter = Q(status='completed', giving_type='financial') & (
            Q(paid_at__date__gte=start_date, paid_at__date__lte=end_date) |
            Q(paid_at__isnull=True, created_at__date__gte=start_date, created_at__date__lte=end_date)
        )
        digital = Contribution.objects.filter(digital_filter)
        cash = CashContribution.objects.filter(received_on__range=(start_date, end_date))
        digital_recorded = digital.aggregate(total=Sum('amount'))['total'] or Decimal('0')
        cash_recorded = cash.aggregate(total=Sum('amount'))['total'] or Decimal('0')

        purposes_dict = {}

        for c in digital:
            p = c.purpose.strip() if c.purpose else 'Combined Offering'
            if p not in purposes_dict:
                purposes_dict[p] = {'purpose': p, 'mpesa': Decimal('0'), 'bank_transfer': Decimal('0'), 'cheque': Decimal('0'), 'cash': Decimal('0')}
            pm = (c.payment_method or 'mpesa').lower().strip()
            if pm in ['mpesa', 'bank_transfer', 'cheque', 'cash']:
                purposes_dict[p][pm] += c.amount
            elif 'airtel' in pm or 'card' in pm or 'stripe' in pm or 'paystack' in pm:
                # Legacy mobile-money/card methods roll up into M-Pesa
                purposes_dict[p]['mpesa'] += c.amount
            elif 'bank' in pm or 'deposit' in pm or 'transfer' in pm:
                purposes_dict[p]['bank_transfer'] += c.amount
            elif 'cheque' in pm or 'check' in pm:
                purposes_dict[p]['cheque'] += c.amount
            else:
                purposes_dict[p]['mpesa'] += c.amount

        for c in cash:
            p = c.purpose.strip() if c.purpose else 'Combined Offering'
            if p not in purposes_dict:
                purposes_dict[p] = {'purpose': p, 'mpesa': Decimal('0'), 'bank_transfer': Decimal('0'), 'cheque': Decimal('0'), 'cash': Decimal('0')}

            pm = (c.payment_method or 'cash').lower().strip()
            if pm in ['mpesa', 'bank_transfer', 'cheque', 'cash']:
                purposes_dict[p][pm] += c.amount
            elif 'card' in pm or 'paybill' in pm or 'airtel' in pm:
                purposes_dict[p]['mpesa'] += c.amount
            elif 'bank' in pm or 'deposit' in pm or 'transfer' in pm:
                purposes_dict[p]['bank_transfer'] += c.amount
            else:
                purposes_dict[p]['cash'] += c.amount

        purpose_breakdown = []
        for p, row in sorted(purposes_dict.items()):
            row_total = row['mpesa'] + row['bank_transfer'] + row['cheque'] + row['cash']
            purpose_breakdown.append({
                'purpose': p,
                'mpesa': str(row['mpesa']),
                'bank_transfer': str(row['bank_transfer']),
                'cheque': str(row['cheque']),
                'cash': str(row['cash']),
                'total': str(row_total),
            })

        total_mpesa = sum((Decimal(r['mpesa']) for r in purpose_breakdown), Decimal('0'))
        total_bank_transfer = sum((Decimal(r['bank_transfer']) for r in purpose_breakdown), Decimal('0'))
        total_cheque = sum((Decimal(r['cheque']) for r in purpose_breakdown), Decimal('0'))
        total_cash = sum((Decimal(r['cash']) for r in purpose_breakdown), Decimal('0'))
        grand_total = total_mpesa + total_bank_transfer + total_cheque + total_cash

        column_totals = {
            'mpesa': str(total_mpesa),
            'bank_transfer': str(total_bank_transfer),
            'cheque': str(total_cheque),
            'cash': str(total_cash),
            'total': str(grand_total),
        }

        reconciliation = ContributionReconciliation.objects.filter(reconciliation_date__range=(start_date, end_date)).order_by('-reconciliation_date').first() if start_date == end_date else None
        date_display = start_date.isoformat() if start_date == end_date else f"{start_date.isoformat()} to {end_date.isoformat()}"

        result = {
            'date': date_display,
            'from_date': start_date.isoformat(),
            'to_date': end_date.isoformat(),
            'digital_recorded': digital_recorded,
            'cash_recorded': cash_recorded,
            'total_recorded': digital_recorded + cash_recorded,
            'digital_contribution_count': digital.count(),
            'cash_contribution_count': cash.count(),
            'purpose_breakdown': purpose_breakdown,
            'totals': column_totals,
            'reconciliation': ContributionReconciliationSerializer(reconciliation).data if reconciliation else None,
        }
        return Response(result)

    def get(self, request):
        self._require_finance_manager(request)
        start_date, end_date = self._selected_date_range(request)
        return self._response(start_date, end_date)

    def put(self, request):
        self._require_finance_manager(request)
        start_date, end_date = self._selected_date_range(request)
        reconciliation, _ = ContributionReconciliation.objects.get_or_create(
            reconciliation_date=end_date,
            defaults={'reconciled_by': request.user},
        )
        serializer = ContributionReconciliationSerializer(reconciliation, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(reconciled_by=request.user)
        return self._response(start_date, end_date)


def _get_purpose_q(purpose_param):
    if not purpose_param or not purpose_param.strip():
        return Q()
    p_str = purpose_param.strip().lower()
    if "combined" in p_str:
        return Q(purpose__icontains="combined") | Q(purpose__icontains="offertory")
    elif "tithe" in p_str:
        return Q(purpose__icontains="tithe")
    elif "camp goal" in p_str or "camp offering" in p_str:
        return Q(purpose__icontains="camp goal") | Q(purpose__icontains="camp offering") | Q(purpose__icontains="camp")
    elif "camp exp" in p_str:
        return Q(purpose__icontains="camp exp") | Q(purpose__icontains="camp")
    elif "evangelism" in p_str or "msamaria" in p_str or "field" in p_str:
        return Q(purpose__icontains="msamaria") | Q(purpose__icontains="evangelism") | Q(purpose__icontains="field")
    elif "station" in p_str:
        return Q(purpose__icontains="station") | Q(purpose__icontains="development")
    elif "thirteenth" in p_str or "13th" in p_str:
        return Q(purpose__icontains="13th") | Q(purpose__icontains="thirteenth")
    elif "building" in p_str or "development" in p_str:
        return Q(purpose__icontains="development") | Q(purpose__icontains="building")
    elif "lcb" in p_str or "budget" in p_str:
        return Q(purpose__icontains="lcb") | Q(purpose__icontains="budget")
    elif "others" in p_str or "other" in p_str:
        known_keywords = ["tithe", "combined", "offertory", "camp", "msamaria", "evangelism", "station", "13th", "thirteenth", "building", "development", "lcb", "youth"]
        q = Q()
        for kw in known_keywords:
            q |= Q(purpose__icontains=kw)
        return ~q
    else:
        return Q(purpose__iexact=purpose_param) | Q(purpose__icontains=purpose_param)


class PurposeContributionsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_finance_manager(request.user):
            raise PermissionDenied('Only finance managers can view contribution details.')

        purpose = request.query_params.get('purpose', '').strip()
        from_val = request.query_params.get('from_date') or request.query_params.get('from')
        to_val = request.query_params.get('to_date') or request.query_params.get('to')
        date_val = request.query_params.get('date')

        today = timezone.localdate()
        today_str = today.isoformat()
        from_str = (from_val or date_val or '').strip()
        to_str = (to_val or date_val or '').strip() or today_str

        if not from_str:
            try:
                end_date = datetime.strptime(to_str, '%Y-%m-%d').date()
            except ValueError:
                end_date = today
            start_date = end_date - timedelta(days=30)
        else:
            try:
                start_date = datetime.strptime(from_str, '%Y-%m-%d').date()
                end_date = datetime.strptime(to_str, '%Y-%m-%d').date()
            except ValueError:
                raise ValidationError({'date': 'Use YYYY-MM-DD.'})

        if start_date > end_date:
            start_date, end_date = end_date, start_date

        digital_filter = Q(status__iexact='completed', giving_type='financial') & (
            Q(paid_at__date__gte=start_date, paid_at__date__lte=end_date) |
            Q(paid_at__isnull=True, created_at__date__gte=start_date, created_at__date__lte=end_date)
        )
        digital_qs = Contribution.objects.filter(digital_filter)
        cash_qs = CashContribution.objects.filter(received_on__range=(start_date, end_date))

        if purpose:
            p_q = _get_purpose_q(purpose)
            digital_qs = digital_qs.filter(p_q)
            cash_qs = cash_qs.filter(p_q)

        results = []

        for c in digital_qs:
            pm = (c.payment_method or 'mpesa').lower().strip()
            if 'bank_transfer' in pm or pm == 'bank_transfer':
                method_display = 'Bank-to-Bank'
            elif 'cheque' in pm or 'check' in pm:
                method_display = 'Cheque'
            elif 'cash' == pm:
                method_display = 'Cash'
            elif 'airtel' in pm:
                method_display = 'M-Pesa'
            elif 'card' in pm or 'stripe' in pm or 'paystack' in pm:
                method_display = 'M-Pesa'
            else:
                method_display = 'M-Pesa'

            donor_name = giver_display_name(c.donor_name, member=c.member, email=c.donor_email, phone=c.phone_number) or 'Anonymous Giver'
            results.append({
                'id': f"digital-{c.id}",
                'raw_id': c.id,
                'source': 'digital',
                'giving_type': c.giving_type,
                'purpose': c.purpose,
                'amount': str(c.amount),
                'donor_name': donor_name,
                'giver_phone': c.phone_number,
                'giver_email': c.donor_email or (c.member.email if c.member else ''),
                'payment_method': method_display,
                'receipt_number': c.mpesa_receipt_number or c.paystack_reference or f"REC-DIG-{c.id}",
                'received_at': c.paid_at.isoformat() if c.paid_at else c.created_at.isoformat(),
                'receipt_sent_at': c.receipt_sent_at.isoformat() if c.receipt_sent_at else None,
                'status': 'Completed',
            })

        for c in cash_qs:
            pm = (c.payment_method or 'cash').lower().strip()
            if pm == 'mpesa':
                method_display = 'M-Pesa'
            elif pm == 'bank_transfer':
                method_display = 'Bank-to-Bank'
            elif pm == 'cheque':
                method_display = 'Cheque'
            else:
                method_display = 'Cash'

            if c.entry_type == 'collection':
                donor_name = c.donor_name.strip() if c.donor_name.strip() else 'General Collection'
            elif c.entry_type == 'anonymous':
                donor_name = 'Anonymous Giver'
            else:
                donor_name = giver_display_name(c.donor_name, email=c.giver_email, phone=c.giver_phone) or 'Anonymous Giver'

            results.append({
                'id': f"cash-{c.id}",
                'raw_id': c.id,
                'source': 'cash',
                'giving_type': 'cash',
                'purpose': c.purpose,
                'amount': str(c.amount),
                'donor_name': donor_name,
                'giver_phone': c.giver_phone if c.entry_type == 'individual' else '',
                'giver_email': c.giver_email if c.entry_type == 'individual' else '',
                'payment_method': method_display,
                'receipt_number': c.receipt_number or f"REC-{c.id}",
                'notes': c.notes,
                'received_at': c.received_on.isoformat() if isinstance(c.received_on, date) else str(c.received_on),
                'receipt_sent_at': c.receipt_sent_at.isoformat() if c.receipt_sent_at else None,
                'status': 'Recorded',
            })

        results.sort(key=lambda x: x['received_at'], reverse=True)
        return Response(results)


class ContributionLiveStatsView(APIView):
    """Completed-giving totals per account for the member Live Reports page.

    The page's banner sums these rows, so only money that actually arrived
    (status ``completed``) counts toward what the church has received.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.db.models import Count, Sum
        rows = (
            Contribution.objects.filter(status='completed')
            .values('purpose')
            .annotate(total=Sum('amount'), count=Count('id'))
            .order_by('-total')
        )
        return Response([
            {
                'category': row['purpose'],
                'label': row['purpose'],
                'total': float(row['total'] or 0),
                'count': row['count'],
            }
            for row in rows
        ])


class ContributionRecentView(APIView):
    """Newest completed gifts — digital and recorded cash — for the live feed."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        items = []
        for row in Contribution.objects.filter(status='completed').order_by('-paid_at')[:12]:
            moment = row.paid_at or row.created_at
            items.append({
                'sort_at': moment,
                # Cash rows use negative ids so React keys stay unique across both lists.
                'id': row.id,
                'category': row.purpose,
                'label': row.purpose,
                'amount': float(row.amount),
                'donor_name': giver_display_name(row.donor_name, member=row.member, email=row.donor_email, phone=row.phone_number),
                'created_at': moment.isoformat(),
            })
        for row in CashContribution.objects.filter(entry_type='individual').order_by('-created_at')[:12]:
            items.append({
                'sort_at': row.created_at,
                'id': -row.id,
                'category': row.purpose,
                'label': row.purpose,
                'amount': float(row.amount),
                'donor_name': giver_display_name(row.donor_name, email=row.giver_email, phone=row.giver_phone),
                'created_at': row.created_at.isoformat(),
            })
        items.sort(key=lambda item: item['sort_at'], reverse=True)
        for item in items:
            item.pop('sort_at')
        return Response(items[:8])


def can_view_church_finances(user):
    """Who may see the church-wide money picture on the dashboard.

    The officers who keep the books: the treasurer and finance team, plus the
    clerk, elders and administrators who answer for them. Members still see
    their own giving — this gates the *whole church's* figures.
    """
    if not user or not user.is_authenticated:
        return False
    if user.is_staff or user.is_superuser:
        return True
    profile = getattr(user, 'member_profile', None)
    return bool(profile and profile.has_role('admin', 'clerk', 'elder', 'treasurer'))


def _week_start(day):
    """The Sunday that begins ``day``'s week — the church's week runs Sabbath to Friday."""
    return day - timedelta(days=(day.weekday() + 1) % 7)


def _month_start(day):
    return day.replace(day=1)


# Gifts that belong to the church as a body rather than to one person: nobody
# can be named for them, so they must never be counted as individual givers.
GROUPED_GIVERS = frozenset({'anonymous', 'collection', 'uncredited'})


def _giver_identity(member_id, email, phone, name, fallback='uncredited'):
    """One stable key per giver, strongest identity first.

    A member who gives by phone and again by email is one giver, not two, so the
    linked account wins over the email, which wins over the phone number, which
    wins over the typed name. Anything unidentified falls back to ``uncredited``
    so the dashboard can say how much money has no giver behind it.
    """
    if member_id:
        return f'member:{member_id}'
    cleaned_email = (email or '').strip().lower()
    if cleaned_email:
        return f'email:{cleaned_email}'
    digits = ''.join(character for character in (phone or '') if character.isdigit())
    if digits:
        return f'phone:{digits[-9:]}'
    cleaned_name = (name or '').strip().lower()
    if cleaned_name:
        return f'name:{cleaned_name}'
    return fallback


def _clamped_weeks(raw, default=12, low=4, high=26):
    """The window an officer asked for, clamped so ``?weeks=`` cannot walk the ledger."""
    try:
        requested = int(raw)
    except (TypeError, ValueError):
        return default
    return max(low, min(high, requested))


class DashboardAnalyticsView(APIView):
    """Church funds and giving analytics for the dashboard's charts.

    Only real money is counted: a digital gift counts once its status is
    ``completed`` (when the money actually arrived), an expense on the date it
    was recorded, and both are bucketed into the same weeks so a bar of income
    and a bar of spending always describe the same seven days. Gifts the finance
    team keyed in by hand (CashContribution) are included alongside M-Pesa and
    bank gifts, so the series agrees with the ledger instead of only half of it.
    """

    permission_classes = [IsAuthenticated]
    # The week chart follows whatever window the officer picked; the month chart
    # always covers a full year, so the two answer different questions.
    DEFAULT_WEEKS = 12
    MIN_WEEKS = 4
    MAX_WEEKS = 26
    TREND_MONTHS = 12
    TOP_ACCOUNTS = 8

    def get(self, request):
        if not can_view_church_finances(request.user):
            return Response(
                {'detail': 'Only church officers can view the financial dashboard.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        weeks_count = _clamped_weeks(
            request.query_params.get('weeks'), self.DEFAULT_WEEKS, self.MIN_WEEKS, self.MAX_WEEKS
        )
        today = timezone.localdate()
        this_week = _week_start(today)
        window_start = this_week - timedelta(weeks=weeks_count - 1)

        weeks = [window_start + timedelta(weeks=index) for index in range(weeks_count)]
        buckets = [
            {
                'week_start': week.isoformat(),
                'label': week.strftime('%-d %b'),
                'income': 0.0,
                'expense': 0.0,
                'gifts': 0,
            }
            for week in weeks
        ]

        def bucket_for(day):
            """The window bucket ``day`` belongs to, or None when it is outside it."""
            if day is None or day < window_start:
                return None
            index = (day - window_start).days // 7
            return buckets[index] if 0 <= index < len(buckets) else None

        # ── Window: the 12-week series, and the giving behind it ──────────────
        purpose_totals = {}
        method_totals = {}
        window_income = 0.0

        payment_labels = dict(Contribution.PAYMENT_METHOD_CHOICES)

        def add_income(day, amount, purpose, method, count=1):
            nonlocal window_income
            bucket = bucket_for(day)
            if bucket is None:
                return
            bucket['income'] += amount
            bucket['gifts'] += count
            window_income += amount
            if purpose:
                purpose_totals[purpose] = purpose_totals.get(purpose, 0.0) + amount
            label = payment_labels.get(method, (method or 'Other').replace('_', ' ').title())
            method_totals[label] = method_totals.get(label, 0.0) + amount

        # Only the window is read: a dashboard must not walk the whole ledger.
        # A completed gift dated by its payment, falling back to when the row was
        # written for the few older rows that arrived without a paid_at.
        digital = Contribution.objects.filter(status='completed').filter(
            Q(paid_at__date__gte=window_start) | Q(paid_at__isnull=True, created_at__date__gte=window_start)
        )
        for row in digital:
            moment = row.paid_at or row.created_at
            add_income(timezone.localtime(moment).date(), float(row.amount), row.purpose, row.payment_method)

        for row in CashContribution.objects.filter(received_on__gte=window_start):
            # Recorded cash lands in the ledger on the day it was received.
            add_income(row.received_on, float(row.amount), row.purpose, row.payment_method)

        expense_totals = {}
        expense_account_totals = {}
        window_expense = 0.0
        expense_labels = dict(Expenditure.CATEGORY_CHOICES)
        for row in Expenditure.objects.filter(expenditure_date__gte=window_start).select_related('account'):
            bucket = bucket_for(row.expenditure_date)
            if bucket is None:
                continue
            amount = float(row.amount)
            bucket['expense'] += amount
            window_expense += amount
            label = expense_labels.get(row.category, (row.category or 'Other').replace('_', ' ').title())
            expense_totals[label] = expense_totals.get(label, 0.0) + amount
            account_label = row.account.name if row.account else 'Not charged to an account'
            expense_account_totals[account_label] = expense_account_totals.get(account_label, 0.0) + amount

        # ── The headline figures, over the periods people ask about ───────────
        month_start = _month_start(today)
        last_month_end = month_start - timedelta(days=1)
        last_month_start = _month_start(last_month_end)
        year_start = today.replace(month=1, day=1)

        def income_between(start, end):
            digital_total = Contribution.objects.filter(
                status='completed', paid_at__date__gte=start, paid_at__date__lte=end,
            ).aggregate(total=Sum('amount'))['total'] or 0
            cash_total = CashContribution.objects.filter(
                received_on__gte=start, received_on__lte=end,
            ).aggregate(total=Sum('amount'))['total'] or 0
            return float(digital_total) + float(cash_total)

        def expense_between(start, end):
            total = Expenditure.objects.filter(
                expenditure_date__gte=start, expenditure_date__lte=end,
            ).aggregate(total=Sum('amount'))['total'] or 0
            return float(total)

        accounts = TreasuryAccount.objects.all().order_by('-balance')
        pending_refunds = MpesaRefund.objects.filter(status='pending')

        # The roster counts exclude system accounts, exactly as the member list does.
        roster = User.objects.filter(is_superuser=False)

        # ── The window before this one, for a like-for-like comparison ────────
        previous_start = window_start - timedelta(weeks=weeks_count)
        previous_end = window_start - timedelta(days=1)
        previous_income = income_between(previous_start, previous_end)
        previous_expense = expense_between(previous_start, previous_end)
        income_ytd = income_between(year_start, today)
        expense_ytd = expense_between(year_start, today)

        # ── Who gave it: counts and averages, never a league table of names ───
        giver_keys = set()
        grouped_total = 0.0
        gift_count = 0
        gift_total = 0.0
        largest_gift = 0.0
        last_gift_on = None

        def note_gift(key, amount, day):
            nonlocal grouped_total, gift_count, gift_total, largest_gift, last_gift_on
            gift_count += 1
            gift_total += amount
            if amount > largest_gift:
                largest_gift = amount
            if day and (last_gift_on is None or day > last_gift_on):
                last_gift_on = day
            if key in GROUPED_GIVERS:
                grouped_total += amount
            else:
                giver_keys.add(key)

        # The very rows the window's income was built from — no extra filter — so
        # the giver count and the bar chart can never disagree with each other.
        for row in Contribution.objects.filter(status='completed').filter(
            Q(paid_at__date__gte=window_start) | Q(paid_at__isnull=True, created_at__date__gte=window_start)
        ).values('member_id', 'donor_email', 'phone_number', 'donor_name', 'amount', 'paid_at', 'created_at'):
            note_gift(
                _giver_identity(row['member_id'], row['donor_email'], row['phone_number'], row['donor_name']),
                float(row['amount'] or 0),
                timezone.localtime(row['paid_at'] or row['created_at']).date(),
            )

        for row in CashContribution.objects.filter(received_on__gte=window_start).values(
            'entry_type', 'donor_name', 'giver_phone', 'giver_email', 'amount', 'received_on'
        ):
            if row['entry_type'] == 'anonymous':
                key = 'anonymous'
            elif row['entry_type'] == 'collection':
                key = 'collection'
            else:
                key = _giver_identity(None, row['giver_email'], row['giver_phone'], row['donor_name'])
            note_gift(key, float(row['amount'] or 0), row['received_on'])

        giver_stats = {
            'gifts': gift_count,
            'givers': len(giver_keys),
            'average': round(gift_total / gift_count, 2) if gift_count else 0.0,
            'largest': largest_gift,
            # Whole-congregation money — collections and anonymous gifts — that
            # no individual can be thanked for.
            'grouped_total': grouped_total,
            'last_gift_on': last_gift_on.isoformat() if last_gift_on else None,
        }

        # ── The year so far, month by month ──────────────────────────────────
        first_month = month_start
        for _ in range(self.TREND_MONTHS - 1):
            first_month = _month_start(first_month - timedelta(days=1))

        month_buckets = []
        cursor = first_month
        for index in range(self.TREND_MONTHS):
            month_buckets.append({
                'month_start': cursor.isoformat(),
                # January carries its year, so a window spanning two years is readable.
                'label': cursor.strftime('%b %y') if cursor.month == 1 or index == 0 else cursor.strftime('%b'),
                'income': 0.0,
                'expense': 0.0,
                'gifts': 0,
            })
            cursor = _month_start(cursor + timedelta(days=32))

        def month_position(day):
            return (day.year - first_month.year) * 12 + (day.month - first_month.month)

        digital_months = (
            Contribution.objects.filter(status='completed')
            .filter(Q(paid_at__date__gte=first_month) | Q(paid_at__isnull=True, created_at__date__gte=first_month))
            .annotate(month=TruncMonth(Coalesce('paid_at', 'created_at')))
            .values('month')
            .annotate(total=Sum('amount'), gifts=Count('id'))
        )
        for row in digital_months:
            position = month_position(timezone.localtime(row['month']).date())
            if 0 <= position < len(month_buckets):
                month_buckets[position]['income'] += float(row['total'] or 0)
                month_buckets[position]['gifts'] += row['gifts'] or 0

        for row in (
            CashContribution.objects.filter(received_on__gte=first_month)
            .annotate(month=TruncMonth('received_on'))
            .values('month')
            .annotate(total=Sum('amount'), gifts=Count('id'))
        ):
            position = month_position(row['month'])
            if 0 <= position < len(month_buckets):
                month_buckets[position]['income'] += float(row['total'] or 0)
                month_buckets[position]['gifts'] += row['gifts'] or 0

        for row in (
            Expenditure.objects.filter(expenditure_date__gte=first_month)
            .annotate(month=TruncMonth('expenditure_date'))
            .values('month')
            .annotate(total=Sum('amount'))
        ):
            position = month_position(row['month'])
            if 0 <= position < len(month_buckets):
                month_buckets[position]['expense'] += float(row['total'] or 0)

        # ── This year's budget against what has actually moved ───────────────
        budget = ChurchBudget.objects.filter(year=today.year).first()
        budget_block = {
            'year': today.year,
            'has_budget': budget is not None,
            'income_target': float(budget.total_income) if budget else 0.0,
            'expense_target': float(budget.total_expenses) if budget else 0.0,
            'income_actual': income_ytd,
            'expense_actual': expense_ytd,
        }

        # ── Where the church's money actually sits, by kind of account ───────
        funds_by_type = {}
        for account in accounts:
            row = funds_by_type.setdefault(
                account.account_type,
                {'label': account.get_account_type_display(), 'total': 0.0, 'count': 0},
            )
            row['total'] += float(account.balance)
            row['count'] += 1
        funds_composition = sorted(funds_by_type.values(), key=lambda row: -row['total'])

        return Response({
            'window_weeks': weeks_count,
            'window_start': window_start.isoformat(),
            'as_of': today.isoformat(),
            'series': buckets,
            'previous': {
                'income': previous_income,
                'expense': previous_expense,
                'start': previous_start.isoformat(),
                'end': previous_end.isoformat(),
            },
            'monthly': month_buckets,
            'budget': budget_block,
            'funds': {
                'total_liquidity': float(
                    accounts.aggregate(total=Sum('balance'))['total'] or 0
                ),
                'by_type': funds_composition,
                'accounts': [
                    {
                        'id': account.id,
                        'name': account.name,
                        'account_type': account.account_type,
                        'type_label': account.get_account_type_display(),
                        'balance': float(account.balance),
                    }
                    for account in accounts
                ],
                'account_count': accounts.count(),
            },
            'giving': {
                'this_month': income_between(month_start, today),
                'last_month': income_between(last_month_start, last_month_end),
                'this_year': income_ytd,
                'window_total': window_income,
                'givers': giver_stats,
                'by_account': [
                    {'label': label, 'total': total}
                    for label, total in sorted(purpose_totals.items(), key=lambda item: -item[1])[:self.TOP_ACCOUNTS]
                ],
                'by_method': [
                    {'label': label, 'total': total}
                    for label, total in sorted(method_totals.items(), key=lambda item: -item[1])
                ],
            },
            'expenditure': {
                'this_month': expense_between(month_start, today),
                'this_year': expense_ytd,
                'window_total': window_expense,
                'by_account': [
                    {'label': label, 'total': total}
                    for label, total in sorted(expense_account_totals.items(), key=lambda item: -item[1])
                ],
                'by_category': [
                    {'label': label, 'total': total}
                    for label, total in sorted(expense_totals.items(), key=lambda item: -item[1])[:self.TOP_ACCOUNTS]
                ],
            },
            'members': {
                'total': roster.count(),
                'friends': MemberProfile.objects.filter(account_type='friend').count(),
                'sabbath_school': MemberProfile.objects.filter(account_type='sabbath_school').count(),
                'new_this_month': roster.filter(date_joined__date__gte=month_start).count(),
                'ex_members': MemberProfile.objects.filter(is_disfellowshipped=True).count(),
                'pending_invitations': Invitation.objects.filter(status='pending').count(),
            },
            'pending_refunds': {
                'count': pending_refunds.count(),
                'amount': float(pending_refunds.aggregate(total=Sum('amount'))['total'] or 0),
            },
        })


class ResendContributionReceiptView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not is_finance_manager(request.user):
            raise PermissionDenied('Only finance managers can resend receipts.')

        source = request.data.get('source')
        raw_id = request.data.get('id')
        if not source or not raw_id:
            return Response({'detail': 'source and id are required.'}, status=status.HTTP_400_BAD_REQUEST)

        # get_or_create guarantees a settings row exists — first() could
        # return None on a fresh tenant and crash the attribute reads below.
        church_settings = ChurchSettings.objects.get_or_create(pk=1)[0]
        now = timezone.now()
        sent_destinations = []

        if source in ['digital']:
            contribution = Contribution.objects.filter(id=raw_id).first()
            if not contribution:
                return Response({'detail': 'Contribution record not found.'}, status=status.HTTP_404_NOT_FOUND)

            receipt_ref = contribution.mpesa_receipt_number or contribution.paystack_reference or f"REC-{contribution.id}"
            donor_name = contribution.donor_name or (contribution.member.get_full_name() if contribution.member else 'Church Member')
            email = contribution.donor_email or (contribution.member.email if contribution.member else '')
            if not email:
                return Response({'detail': 'This giver does not have a verified email address.'}, status=status.HTTP_400_BAD_REQUEST)

            if email:
                amount_display = f"KES {contribution.amount:,.2f}"
                body = (
                    f"{render_receipt_message(church_settings.default_receipt_message, donor_name, amount_display, contribution.purpose)}\n\n"
                    f"{receipt_summary(account=contribution.purpose, amount=amount_display, payment_channel=contribution.get_payment_method_display(), receipt_ref=receipt_ref, date_display=timezone.localtime(contribution.paid_at or contribution.created_at).strftime('%d %B %Y'))}\n\n"
                    f"{receipt_email_signature()}"
                )
                try:
                    send_mail(
                        f"Receipt Copy — {contribution.purpose}",
                        body,
                        settings.DEFAULT_FROM_EMAIL,
                        [email],
                        fail_silently=False,
                    )
                    sent_destinations.append(f"Email ({email})")
                except Exception:
                    return Response({'detail': 'The receipt email could not be sent. Check the email configuration and address.'}, status=status.HTTP_502_BAD_GATEWAY)

            contribution.receipt_sent_at = now
            contribution.save(update_fields=['receipt_sent_at'])

        elif source == 'cash':
            cash = CashContribution.objects.filter(id=raw_id).first()
            if not cash:
                return Response({'detail': 'Cash contribution record not found.'}, status=status.HTTP_404_NOT_FOUND)

            receipt_ref = cash.receipt_number or f"CASH-{cash.id}"
            donor_name = cash.donor_name or 'Church Member'
            email = cash.giver_email
            if not email:
                return Response({'detail': 'This giver does not have a verified email address.'}, status=status.HTTP_400_BAD_REQUEST)

            if email:
                amount_display = f"KES {cash.amount:,.2f}"
                body = (
                    f"{render_receipt_message(church_settings.default_receipt_message, donor_name, amount_display, cash.purpose)}\n\n"
                    f"{receipt_summary(account=cash.purpose, amount=amount_display, payment_channel='Cash', receipt_ref=receipt_ref, date_display=cash.received_on)}\n\n"
                    f"{receipt_email_signature()}"
                )
                try:
                    send_mail(
                        f"Receipt Copy — {cash.purpose}",
                        body,
                        settings.DEFAULT_FROM_EMAIL,
                        [email],
                        fail_silently=False,
                    )
                    sent_destinations.append(f"Email ({email})")
                except Exception:
                    return Response({'detail': 'The receipt email could not be sent. Check the email configuration and address.'}, status=status.HTTP_502_BAD_GATEWAY)

            cash.receipt_sent_at = now
            cash.save(update_fields=['receipt_sent_at'])
        else:
            return Response({'detail': 'Invalid source.'}, status=status.HTTP_400_BAD_REQUEST)

        dest_text = ", ".join(sent_destinations) if sent_destinations else "Email"
        return Response({
            'detail': f'Email sent; SMS was not sent because SMS is not configured.' if sent_destinations else 'Receipt email could not be sent.',
            'receipt_sent_at': now.isoformat(),
        })


class SupportSubmissionView(generics.ListCreateAPIView):
    permission_classes = [AllowAny]
    serializer_class = SupportSubmissionSerializer

    def get_queryset(self):
        user = self.request.user
        if user and user.is_authenticated:
            profile = getattr(user, 'member_profile', None)
            if profile and profile.has_role('admin', 'clerk', 'elder'):
                return SupportSubmission.objects.all().order_by('-id')
        return SupportSubmission.objects.none()

    def perform_create(self, serializer):
        member = self.request.user if self.request.user and self.request.user.is_authenticated else None
        instance = serializer.save(member=member)
        notify_request_safely(
            'welfare',
            instance.pk,
            submitted_by='Someone anonymous' if instance.anonymous else (instance.name or 'A church member'),
            church_name=current_church_name(),
            submitted_at=instance.created_at,
        )


class InitiateContributionView(APIView):
    permission_classes = [AllowAny]

    @transaction.atomic
    def post(self, request):
        serializer = ContributionInitiateSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)

        # M-Pesa STK push never touches the database here. A pending row used
        # to be created at initiation and completed by the callback, but rows
        # whose prompt was cancelled, timed out or simply never called back
        # piled up as pending money the church never received. The callback
        # now creates the contribution itself, carrying the initiation context
        # in the signed CallBackURL (see members/mpesa_tokens.py).
        if serializer.validated_data.get('payment_method', 'mpesa') == 'mpesa':
            return self._initiate_mpesa_stk_push(request, serializer)

        method = serializer.validated_data.get('payment_method', 'mpesa')
        allocations = serializer.validated_data['allocations']
        # One payment per account line, so the books show which account each part
        # of the gift went to. A single-account gift is simply one line.
        import uuid
        group = uuid.uuid4() if len(allocations) > 1 else None
        prefix_map = {'cash': 'CSH', 'cheque': 'CHQ', 'bank_transfer': 'BNK', 'bank_deposit': 'DEP'}
        prefix = prefix_map.get(method, 'REC')
        created = []
        for row in allocations:
            contribution = Contribution.objects.create(
                member=request.user if request.user.is_authenticated else None,
                amount=row['amount'],
                giving_type=serializer.validated_data['giving_type'],
                purpose=row['purpose'],
                phone_number=serializer.validated_data['phone_number'],
                donor_name=serializer.validated_data.get('donor_name', ''),
                donor_email=serializer.validated_data.get('donor_email', ''),
                item_description=serializer.validated_data.get('item_description', ''),
                payment_method=method,
                payment_group=group,
            )
            if contribution.payment_method in ['cash', 'cheque', 'bank_transfer']:
                contribution.status = 'completed'
                contribution.mpesa_receipt_number = f"{prefix}-{uuid.uuid4().hex[:6].upper()}"
                contribution.paid_at = timezone.now()
                contribution.save(update_fields=['status', 'mpesa_receipt_number', 'paid_at'])
                send_contribution_receipt(contribution)
            created.append(contribution)
        # Cash, cheque and bank gifts recorded here are received money: their
        # accounts move now. (M-Pesa waits for Safaricom's callback, which
        # credits through the same door.)
        for contribution in created:
            if contribution.status == 'completed':
                credit_contribution_lines(contribution)

        method_display = method.replace('_', ' ').title()
        return Response({
            'message': f'Thank you! Your {method_display} contribution has been recorded.',
            'contribution_id': str(created[0].id),
            'contribution_ids': [str(row.id) for row in created],
        }, status=status.HTTP_201_CREATED)

    def _initiate_mpesa_stk_push(self, request, serializer):
        """Start an STK push without writing a pending Contribution row.

        Nothing is recorded until Safaricom's callback confirms the money
        arrived; a prompt that was cancelled, timed out or never called back
        used to leave a pending row the church never received money for.
        The initiation context (amount, purpose, phone, giver email, the
        campaign card) travels in the signed CallBackURL — see
        members/mpesa_tokens.py — so the callback can create the contribution
        on its own, carrying the name the giver typed on the form.
        """
        data = serializer.validated_data
        phone_number = normalize_mpesa_phone(data['phone_number'])
        allocations = data['allocations']
        context = {
            # The total is what Safaricom's prompt asks for; the split rides along
            # so the callback can credit each account when the money arrives.
            'amount': str(data['amount']),
            'purpose': data['purpose'],
            'allocations': [
                {'purpose': row['purpose'], 'account': row.get('account', row['purpose'])[:12], 'amount': str(row['amount'])}
                for row in allocations
            ],
            'phone_number': phone_number,
        }
        donor_name = (data.get('donor_name') or '').strip()
        if donor_name:
            context['donor_name'] = donor_name
        # The receipt address is the account's own, set by the serializer; the
        # member id rides along so the callback can attribute the gift even if
        # the phone it was paid from is not the one on the member's profile.
        if request.user and request.user.is_authenticated:
            context['member_id'] = request.user.pk
        donor_email = (data.get('donor_email') or '').strip()
        if donor_email:
            context['donor_email'] = donor_email
        item_description = (data.get('item_description') or '').strip()
        if item_description:
            context['item_description'] = item_description
        referral_token = request.data.get('referral_token') if isinstance(request.data, dict) else None
        if referral_token:
            context['referral_token'] = str(referral_token)
        # Safaricom shows one account reference per push, so a gift split across
        # accounts is named by how many it feeds ("2ACCOUNTS", "3ACCOUNTS")
        # rather than by whichever account happened to be ticked first — the
        # first name would describe a fifth of the money. A single-account gift
        # still shows that account's own short name. Both go through
        # account_reference_for_purpose(), which uppercases and strips spaces.
        allocation_accounts = [row.get('account', row['purpose']) for row in allocations]
        prompt_reference = (
            allocation_accounts[0] if len(allocation_accounts) == 1 else f"{len(allocation_accounts)}accounts"
        )
        try:
            result = initiate_stk_push_for_context(
                phone_number=phone_number,
                amount=data['amount'],
                purpose=prompt_reference,
                context_token=pack_callback_context(context),
            )
        except MpesaConfigurationError as error:
            return Response({'detail': str(error)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except Exception as error:
            return Response({
                'detail': f'We could not send the M-Pesa prompt: {error}',
            }, status=status.HTTP_502_BAD_GATEWAY)
        return Response({
            'message': result.get('CustomerMessage', 'Paybill payment prompt sent to your phone. Enter PIN to complete.'),
        }, status=status.HTTP_200_OK)


class MpesaCallbackView(APIView):
    """Receives Daraja's STK result and creates the contribution if money moved.

    The contribution does not exist at push time; the initiation context
    rides in the signed ctx query parameter we embedded in the CallBackURL
    and Daraja echoes back verbatim. The giver's name comes from the form
    (packed into that context); the callback's own metadata and the
    giver's contact details are only fallbacks.
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        callback = request.data.get('Body', {}).get('stkCallback', {})
        result_code = callback.get('ResultCode')
        result_desc = callback.get('ResultDesc') or 'M-Pesa payment not completed'
        query_string = request.META.get('QUERY_STRING', '')
        context_token = parse_qs(query_string).get('ctx', [None])[0]
        context = unpack_callback_context(context_token)
        if not context:
            # Unpackable context (tampered, stale or a legacy push): still
            # acknowledge so Safaricom stops retrying.
            return Response({'ResultCode': 0, 'ResultDesc': 'Accepted'})

        checkout_request_id = callback.get('CheckoutRequestID') or None
        # Safaricom retries unacknowledged callbacks; never record twice —
        # for completions and failed attempts alike.
        if checkout_request_id and Contribution.objects.filter(checkout_request_id=checkout_request_id).exists():
            return Response({'ResultCode': 0, 'ResultDesc': 'Accepted'})

        if result_code == 0:
            metadata = {item.get('Name'): item.get('Value') for item in callback.get('CallbackMetadata', {}).get('Item', [])}
            payer_name = ' '.join(
                str(metadata.get(part) or '').strip()
                for part in ('FirstName', 'MiddleName', 'LastName')
            ).strip()
            if not payer_name:
                # The push callback carries the payer's MSISDN but not their
                # name — look the giver up by it (or the emailed account) so
                # a registered member is never recorded as an anonymous giver.
                payer_name = giver_display_name(
                    '',
                    email=context.get('donor_email', ''),
                    phone=str(metadata.get('PhoneNumber') or context.get('phone_number') or ''),
                )
            receipt_number = metadata.get('MpesaReceiptNumber')
            phone = str(metadata.get('PhoneNumber', context['phone_number']))
            lines = allocation_lines(context)
            group = uuid.uuid4() if len(lines) > 1 else None
            for row in lines:
                contribution = Contribution.objects.create(
                    amount=Decimal(str(row['amount'])),
                    giving_type='financial',
                    # The ledger records the wording the giver read (the
                    # description); the account stays what M-Pesa showed.
                    purpose=row['purpose'],
                    phone_number=phone,
                    donor_name=(context.get('donor_name') or '').strip() or payer_name,
                    donor_email=context.get('donor_email', ''),
                    item_description=context.get('item_description', ''),
                    payment_method='mpesa',
                    status='completed',
                    mpesa_receipt_number=receipt_number,
                    checkout_request_id=checkout_request_id,
                    payment_group=group,
                    paid_at=timezone.now(),
                )
                self._link_giver(contribution, context)
                send_contribution_receipt(contribution)
            # The money is in; the account it names moves too. One credit per
            # payment, split the way the giver split it.
            credit_contribution_lines(contribution)
        else:
            # The prompt was cancelled, timed out or otherwise failed — no
            # money moved, but keep a terminal record so the attempt is
            # visible in the giver's history. It is never 'pending' and it
            # is excluded from every completed-only total. A split gift leaves
            # one line per account here too, so the history reads the same
            # whether the prompt succeeded or not.
            lines = allocation_lines(context)
            group = uuid.uuid4() if len(lines) > 1 else None
            for row in lines:
                Contribution.objects.create(
                    amount=Decimal(str(row['amount'])),
                    giving_type='financial',
                    purpose=row['purpose'],
                    phone_number=str(context.get('phone_number', '')),
                    donor_email=context.get('donor_email', ''),
                    item_description=result_desc,
                    payment_method='mpesa',
                    status='failed',
                    checkout_request_id=checkout_request_id,
                    payment_group=group,
                )
        return Response({'ResultCode': 0, 'ResultDesc': 'Accepted'})

    def _link_giver(self, contribution, context):
        """Attribute the completed contribution to a user or campaign card."""
        msisdn = contribution.phone_number
        campaign_card = CampaignCardAssignment.objects.filter(referral_token=context.get('referral_token', '')).first() if context.get('referral_token') else None
        if campaign_card:
            contribution.campaign = campaign_card.campaign
            contribution.card_assignment = campaign_card

        matched_user = None
        member_id = context.get('member_id')
        if member_id:
            matched_user = User.objects.filter(pk=member_id).first()
        if not matched_user and msisdn:
            normalized_digits = msisdn[-9:] if len(msisdn) >= 9 else msisdn
            matched_user = User.objects.filter(username__icontains=normalized_digits).first()
        if matched_user:
            contribution.member = matched_user
            if not contribution.donor_email and matched_user.email:
                contribution.donor_email = matched_user.email

        contribution.save(update_fields=['campaign', 'card_assignment', 'member', 'donor_email'])


class MpesaC2BValidationView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        return Response({'ResultCode': 0, 'ResultDesc': 'Accepted'})


class MpesaC2BConfirmationView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        payload = request.data or {}
        trans_id = payload.get('TransID')
        if not trans_id:
            return Response({'ResultCode': 0, 'ResultDesc': 'Accepted'})

        # Extract all name components from Safaricom C2B payload
        first_name = (payload.get('FirstName') or '').strip()
        middle_name = (payload.get('MiddleName') or '').strip()
        last_name = (payload.get('LastName') or '').strip()
        full_name = ' '.join(filter(None, [first_name, middle_name, last_name]))

        msisdn = str(payload.get('MSISDN') or '').strip()
        amount_raw = payload.get('TransAmount', 0)
        try:
            amount = Decimal(str(amount_raw))
        except (ValueError, TypeError):
            amount = Decimal('0')

        purpose = (payload.get('BillRefNumber') or 'Combined Offering').strip()

        # Check if already recorded
        # A split STK gift shares one receipt number across its account lines;
        # a C2B paybill payment is always a single line, so only unsplit rows can
        # be the payment this confirmation is about.
        contribution = Contribution.objects.filter(mpesa_receipt_number=trans_id, payment_group__isnull=True).first()
        was_new_record = contribution is None
        if not contribution:
            contribution = Contribution(
                payment_method='mpesa',
                giving_type='financial',
                purpose=purpose,
            )

        contribution.status = 'completed'
        contribution.mpesa_receipt_number = trans_id
        contribution.amount = amount
        if msisdn:
            contribution.phone_number = msisdn
        if full_name:
            contribution.donor_name = full_name
        if not contribution.paid_at:
            contribution.paid_at = timezone.now()

        # Link to member user if exists and not set
        if not contribution.member and msisdn:
            normalized_digits = msisdn[-9:] if len(msisdn) >= 9 else msisdn
            matched_user = User.objects.filter(username__icontains=normalized_digits).first()
            if matched_user:
                contribution.member = matched_user
                if not contribution.donor_email and matched_user.email:
                    contribution.donor_email = matched_user.email

        contribution.save()
        send_contribution_receipt(contribution)
        # The paybill money is in; the account it names moves too. A repeated
        # confirmation finds the saved row first and never reaches a second
        # credit, because the credit only follows a fresh completion.
        if was_new_record:
            credit_contribution_lines(contribution)
        return Response({'ResultCode': 0, 'ResultDesc': 'Accepted'})


class MpesaB2CResultView(APIView):
    """Receives the async outcome of a B2C refund request from Safaricom."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        payload = request.data or {}
        originator_conversation_id = payload.get('OriginatorConversationID', '')
        refund = MpesaRefund.objects.filter(originator_conversation_id=originator_conversation_id).first()
        if not refund:
            # Safaricom requires an immediate acknowledgement, even for
            # payloads we cannot match, or it keeps retrying the callback.
            return Response({'ResultCode': 0, 'ResultDesc': 'Accepted'})

        result = payload.get('Result', {})
        result_code = result.get('ResultCode')
        result_params = {item.get('Key'): item.get('Value') for item in result.get('ResultParameters', {}).get('ResultParameter', [])}
        refund.conversation_id = payload.get('ConversationID', '') or refund.conversation_id
        refund.outcome_description = str(result.get('ResultDesc', ''))[:255]
        refund.transaction_id = str(result_params.get('TransactionID', '') or '')
        if result_code == 0:
            refund.status = 'completed'
            refund.completed_at = timezone.now()
        else:
            refund.status = 'failed'
        refund.save(update_fields=['conversation_id', 'outcome_description', 'transaction_id', 'status', 'completed_at'])
        return Response({'ResultCode': 0, 'ResultDesc': 'Accepted'})


class RefundableContributionsView(APIView):
    """Completed M-Pesa contributions a treasurer can refund, annotated with refund state."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_treasurer_or_admin(request.user):
            raise PermissionDenied('Only church treasurers or administrators can view refundable contributions.')
        contributions = (
            Contribution.objects.filter(status='completed', payment_method='mpesa')
            .select_related('member')
            .order_by('-created_at')[:200]
        )
        refunds_by_contribution = {r.contribution_id: r for r in MpesaRefund.objects.all()}
        results = []
        for c in contributions:
            donor_name = giver_display_name(c.donor_name, member=c.member, email=c.donor_email, phone=c.phone_number) or 'Anonymous Giver'
            refund = refunds_by_contribution.get(c.id)
            results.append({
                'id': c.id,
                'amount': str(c.amount),
                'purpose': c.purpose,
                'donor_name': donor_name,
                'phone_number': c.phone_number,
                'mpesa_receipt_number': c.mpesa_receipt_number or '',
                'paid_at': c.paid_at.isoformat() if c.paid_at else c.created_at.isoformat(),
                'refund': refund is not None,
                'refund_status': refund.status if refund else '',
            })
        return Response(results)


class MpesaRefundListView(generics.ListAPIView):
    """Treasurer/admin view of all M-Pesa refunds."""

    serializer_class = MpesaRefundSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if not is_treasurer_or_admin(self.request.user):
            raise PermissionDenied('Only church treasurers or administrators can view M-Pesa refunds.')
        return MpesaRefund.objects.all()


class MpesaRefundView(APIView):
    """Treasurer-initiated B2C refund of a completed M-Pesa contribution."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not is_treasurer_or_admin(request.user):
            raise PermissionDenied('Only church treasurers or administrators can refund contributions.')
        contribution = generics.get_object_or_404(Contribution, pk=pk)
        if contribution.payment_method != 'mpesa':
            return Response({'detail': 'Only M-Pesa contributions can be refunded via B2C.'}, status=status.HTTP_400_BAD_REQUEST)
        if contribution.status != 'completed':
            return Response({'detail': 'Only completed contributions can be refunded.'}, status=status.HTTP_400_BAD_REQUEST)
        if MpesaRefund.objects.filter(contribution=contribution).exists():
            return Response({'detail': 'This contribution has already been refunded.'}, status=status.HTTP_400_BAD_REQUEST)
        serializer = MpesaRefundSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        phone_number = normalize_mpesa_phone(serializer.validated_data['phone_number'])
        refund = serializer.save(
            contribution=contribution,
            amount=contribution.amount,
            phone_number=phone_number,
            initiated_by=request.user,
            originator_conversation_id=uuid.uuid4().hex,
        )
        try:
            result = initiate_b2c_refund(refund)
        except MpesaConfigurationError as exc:
            refund.delete()
            return Response({'detail': str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except Exception:
            refund.delete()
            return Response({'detail': 'M-Pesa rejected the refund request. Verify the credentials and try again.'}, status=status.HTTP_502_BAD_GATEWAY)
        refund.status = 'accepted' if result.get('ResponseCode') == '0' else 'failed'
        refund.outcome_description = str(result.get('ResponseDescription', ''))[:255]
        refund.conversation_id = str(result.get('ConversationID', '') or '')
        refund.save(update_fields=['status', 'outcome_description', 'conversation_id'])
        if refund.status != 'accepted':
            return Response({'detail': result.get('ResponseDescription', 'M-Pesa rejected the refund request.'), 'refund': MpesaRefundSerializer(refund).data}, status=status.HTTP_502_BAD_GATEWAY)
        return Response({'detail': 'Refund request accepted by M-Pesa. The member will receive the money shortly.', 'refund': MpesaRefundSerializer(refund).data}, status=status.HTTP_201_CREATED)


class PaystackWebhookView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        try:
            if not verify_webhook_signature(request.body, request.headers.get('X-Paystack-Signature', '')):
                return Response({'detail': 'Invalid webhook signature.'}, status=status.HTTP_400_BAD_REQUEST)
            event = parse_webhook(request.body)
        except (PaystackConfigurationError, ValueError, TypeError, json.JSONDecodeError):
            return Response({'detail': 'Invalid Paystack webhook.'}, status=status.HTTP_400_BAD_REQUEST)

        event_type = event.get('type')
        payment = event.get('data', {})
        contribution_id = payment.get('metadata', {}).get('contribution_id')
        contribution = Contribution.objects.filter(id=contribution_id, paystack_reference=payment.get('reference')).first()
        if not contribution:
            return Response({'received': True})
        expected_amount = int(Decimal(contribution.amount) * 100)
        already_completed = contribution.status == 'completed'
        if event_type == 'charge.success' and payment.get('status') and payment.get('amount') == expected_amount and payment.get('currency') == contribution.currency:
            contribution.status = 'completed'
            contribution.paid_at = timezone.now()
        elif event_type in ('charge.failed', 'transfer.failed'):
            contribution.status = 'failed'
        contribution.save(update_fields=['status', 'paid_at'])
        send_contribution_receipt(contribution)
        # Card money joins the account it names the moment it is confirmed —
        # but only once: a webhook re-delivery meets an already-completed row
        # and stops at the receipt.
        if contribution.status == 'completed' and not already_completed:
            credit_contribution_lines(contribution)
        return Response({'received': True})


class PrayerRequestView(generics.ListCreateAPIView):
    permission_classes = [AllowAny]
    serializer_class = PrayerRequestSerializer

    def get_queryset(self):
        user = self.request.user
        if user and user.is_authenticated:
            profile = getattr(user, 'member_profile', None)
            if profile and profile.has_role('admin', 'clerk', 'elder', 'chaplaincy'):
                return PrayerRequest.objects.all().order_by('-created_at')
        return PrayerRequest.objects.none()

    def perform_create(self, serializer):
        # An anonymous request keeps its author's name out of the notice too:
        # the desk is told a request exists, not who wrote it.
        instance = serializer.save()
        notify_request_safely(
            'prayer',
            instance.pk,
            submitted_by='Someone anonymous' if instance.anonymous else (instance.name or 'A church member'),
            church_name=current_church_name(),
            submitted_at=instance.created_at,
        )


class ChildDedicationRequestView(generics.ListCreateAPIView):
    serializer_class = ChildDedicationRequestSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        user = self.request.user
        if user and user.is_authenticated:
            profile = getattr(user, 'member_profile', None)
            if profile and profile.has_role('admin', 'clerk', 'elder', 'children_ministry'):
                return ChildDedicationRequest.objects.all().order_by('-id')
        return ChildDedicationRequest.objects.none()

    def perform_create(self, serializer):
        instance = serializer.save()
        # The parent asks, so the parent is named; the child is what the desk
        # reads first in the list itself.
        parent = (instance.father_name or instance.mother_name or '').strip()
        notify_request_safely(
            'dedication',
            instance.pk,
            submitted_by=parent or f"the family of {instance.child_name}",
            church_name=current_church_name(),
            submitted_at=instance.created_at,
        )


def get_client_ip(request):
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0].strip()
    else:
        ip = request.META.get('REMOTE_ADDR')
    return ip or None


class TestimonyView(generics.ListCreateAPIView):
    serializer_class = TestimonySerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        return Testimony.objects.filter(status='approved')

    def perform_create(self, serializer):
        user = self.request.user if self.request.user.is_authenticated else None
        ip_address = get_client_ip(self.request)
        if ip_address and Testimony.objects.filter(ip_address=ip_address, status='pending_review').exists():
            raise ValidationError({'detail': 'You already have a testimony pending approval. Please wait until it is reviewed before submitting another.'})
        name = serializer.validated_data.get('name', '')
        if user and not name:
            name = f"{user.first_name} {user.last_name}".strip() or user.username
        serializer.save(
            user=user,
            email=user.email if user else '',
            name=name,
            ip_address=ip_address,
            status='approved' if user and self.request.data.get('request_type') != 'fellowship' else 'pending_review'
        )


def send_testimony_verification_email(pending):
    church_name = current_church_name()
    link = f"{settings.FRONTEND_URL}/community/testimonies?token={pending.token}"
    send_mail(
        'Confirm your testimony submission',
        f"Hello {pending.name or 'there'},\n\n"
        f"Confirm your email and continue sharing your testimony with {church_name}:\n{link}\n\n"
        "This link expires in 30 minutes.\n\n"
        f"Warm regards,\n{church_name}",
        settings.DEFAULT_FROM_EMAIL,
        [pending.email],
        fail_silently=False,
    )


class TestimonyVerificationStartView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        email = str(request.data.get('email', '')).strip().lower()
        try:
            validate_email(email)
        except Exception:
            return Response({'email': 'Enter a valid email address.'}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.filter(email__iexact=email, is_active=True).first()
        friend = Friend.objects.filter(email__iexact=email).first()
        name = friend.name if friend and friend.name else (f"{user.first_name} {user.last_name}".strip() if user else '')
        pending = PendingTestimony.objects.create(email=email, name=name)
        try:
            send_testimony_verification_email(pending)
        except Exception:
            pending.delete()
            return Response({'detail': 'The confirmation email could not be sent.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response({'message': 'If the email can receive messages, a confirmation link has been sent.'}, status=status.HTTP_202_ACCEPTED)


class TestimonyVerificationView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def _pending(self, token):
        pending = PendingTestimony.objects.filter(token=token, status='verification_sent', created_at__gt=timezone.now() - timedelta(minutes=30)).first()
        if not pending:
            raise ValueError('This confirmation link is invalid or expired.')
        return pending

    def get(self, request):
        try:
            pending = self._pending(request.query_params.get('token'))
        except ValueError as error:
            return Response({'detail': str(error)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'name': pending.name, 'requires_name': not bool(pending.name)})

    def post(self, request):
        try:
            pending = self._pending(request.data.get('token'))
        except ValueError as error:
            return Response({'detail': str(error)}, status=status.HTTP_400_BAD_REQUEST)
        name = str(request.data.get('name', '')).strip() or pending.name
        testimony_text = str(request.data.get('testimony_text', '')).strip()
        if not name:
            return Response({'name': 'Enter your name.'}, status=status.HTTP_400_BAD_REQUEST)
        if not testimony_text:
            return Response({'testimony_text': 'Enter your testimony.'}, status=status.HTTP_400_BAD_REQUEST)
        pending.name = name
        pending.testimony_text = testimony_text
        pending.status = 'pending_review'
        pending.verified_at = timezone.now()
        pending.save(update_fields=['name', 'testimony_text', 'status', 'verified_at'])
        return Response({'message': 'Your testimony has been submitted for review.'}, status=status.HTTP_201_CREATED)


class ChurchFinancialReportsView(generics.ListAPIView):
    permission_classes = [AllowAny]
    serializer_class = ChurchFinancialReportSerializer

    def get_queryset(self):
        user = self.request.user if self.request.user.is_authenticated else None
        profile = getattr(user, 'member_profile', None) if user else None
        if profile and profile.has_role('admin', 'treasurer'):
            return ChurchFinancialReport.objects.all()
        return ChurchFinancialReport.objects.filter(published_to_members=True)


class ChurchBudgetsView(generics.ListAPIView):
    permission_classes = [AllowAny]
    serializer_class = ChurchBudgetSerializer

    def get_queryset(self):
        return ChurchBudget.objects.all()


class SabbathEventsView(generics.ListAPIView):
    permission_classes = [AllowAny]
    serializer_class = SabbathEventSerializer

    def get_queryset(self):
        return SabbathEvent.objects.filter(published=True)


class ChurchSettingsView(generics.RetrieveUpdateAPIView):
    serializer_class = ChurchSettingsSerializer

    def get_permissions(self):
        if self.request.method in ['PUT', 'PATCH']:
            return [IsAuthenticated()]
        return [AllowAny()]

    def get_object(self):
        settings, _ = ChurchSettings.objects.get_or_create(pk=1)
        return settings


class InKindContributionView(APIView):
    """In-kind (non-monetary) giving: anyone may give; leaders see all records.

    GET supports server-side filtering and pagination:
      ?from=YYYY-MM-DD&to=YYYY-MM-DD&purpose=<exact>&search=<text>&page=1&page_size=50
    """
    permission_classes = [AllowAny]
    MAX_PAGE_SIZE = 200
    DEFAULT_PAGE_SIZE = 50

    def get(self, request):
        profile = getattr(request.user, 'member_profile', None)
        is_leader = bool(
            request.user.is_authenticated and (
                request.user.is_staff
                or (profile and profile.has_role('admin', 'clerk', 'elder', 'treasurer'))
            )
        )
        if is_leader:
            queryset = InKindContribution.objects.all()
        elif request.user.is_authenticated:
            queryset = InKindContribution.objects.filter(member=request.user)
        else:
            return Response({'detail': 'Sign in to view in-kind records.'}, status=status.HTTP_401_UNAUTHORIZED)

        params = request.query_params

        def _parse_date(value):
            try:
                return date.fromisoformat(value)
            except (TypeError, ValueError):
                return None

        date_from = _parse_date(params.get('from'))
        date_to = _parse_date(params.get('to'))
        if date_from:
            queryset = queryset.filter(received_on__gte=date_from)
        if date_to:
            queryset = queryset.filter(received_on__lte=date_to)

        purpose = (params.get('purpose') or '').strip()
        if purpose and purpose != 'all':
            queryset = queryset.filter(purpose__iexact=purpose)

        search = (params.get('search') or '').strip()
        if search:
            queryset = queryset.filter(
                Q(donor_name__icontains=search)
                | Q(purpose__icontains=search)
                | Q(items__icontains=search)
                | Q(notes__icontains=search)
            )

        try:
            page_number = max(1, int(params.get('page', 1)))
        except (TypeError, ValueError):
            page_number = 1
        try:
            page_size = min(self.MAX_PAGE_SIZE, max(1, int(params.get('page_size', self.DEFAULT_PAGE_SIZE))))
        except (TypeError, ValueError):
            page_size = self.DEFAULT_PAGE_SIZE

        total = queryset.count()
        total_items = sum(
            len([line for line in (items or '').splitlines() if line.strip()])
            for items in queryset.values_list('items', flat=True)
        )

        offset = (page_number - 1) * page_size
        serializer = InKindContributionSerializer(queryset[offset:offset + page_size], many=True)
        return Response({
            'count': total,
            'total_items': total_items,
            'page': page_number,
            'page_size': page_size,
            'results': serializer.data,
        })

    def post(self, request):
        data = dict(request.data)
        if request.user.is_authenticated:
            data.setdefault('donor_name', f"{request.user.first_name} {request.user.last_name}".strip() or request.user.username)
            data.setdefault('donor_email', request.user.email or '')
            profile = getattr(request.user, 'member_profile', None)
            data.setdefault('phone_number', getattr(profile, 'phone_number', '') or '')
        serializer = InKindContributionSerializer(data=data)
        if serializer.is_valid():
            instance = serializer.save(member=request.user if request.user.is_authenticated else None)
            return Response(InKindContributionSerializer(instance).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


def giving_account_options():
    """The accounts the giving form offers, in the church's priority order.

    Treasury accounts are the one source of giving accounts — the separate
    giving-purpose list was retired. The order leads with Tithe, the offering
    funds and the budget, then camp-related accounts, then everything else by
    name (see TreasuryAccount.priority_rank). Each option carries both wordings:
    `label` is what the giver reads (the description), `account` is the short
    name Safaricom shows in the prompt.
    """
    accounts = sorted(TreasuryAccount.objects.all(), key=TreasuryAccount.priority_rank)
    return [
        {
            'id': account.id,
            'name': account.name,
            'label': (account.description or account.name).strip() or account.name,
            'account': account.name,
            'account_type': account.account_type,
            'account_type_display': account.get_account_type_display(),
        }
        for account in accounts
    ]


class GivingAccountsView(APIView):
    """Giving accounts, sourced from treasury accounts in priority order."""

    permission_classes = [AllowAny]

    def get(self, request):
        return Response(giving_account_options())


class ProfessionListCreateView(generics.ListCreateAPIView):
    permission_classes = [AllowAny]
    serializer_class = ProfessionSerializer

    def get_queryset(self):
        return Profession.objects.all().order_by('name')

    def create(self, request, *args, **kwargs):
        name = request.data.get('name', '').strip()
        if not name:
            return Response({'error': 'Name is required'}, status=status.HTTP_400_BAD_REQUEST)
        prof, created = Profession.objects.get_or_create(name=name, defaults={'is_default': False})
        return Response(ProfessionSerializer(prof).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


def broadcast_campaign_message(campaign, custom_message=None):
    from django.contrib.auth.models import User
    msg_text = custom_message or campaign.member_message or (
        f"Support our church fund drive: {campaign.title or campaign.name}. "
        f"Goal: KES {campaign.target_amount:,.2f}. Giving reference: {campaign.account_name or campaign.name}."
    )

    group_role_map = {
        'choir': 'choir_director',
        'youth': 'youth_leader',
        'children': 'children_ministry',
        'men': 'men_ministry',
        'women': 'women_ministry',
        'chaplaincy': 'chaplaincy',
        'leaders': 'elder',
    }

    target_groups = campaign.target_groups or []
    users_to_notify = set()

    if 'all_members' in target_groups or not target_groups:
        users_to_notify = set(User.objects.filter(is_active=True))
    else:
        for grp_key in target_groups:
            if grp_key in group_role_map:
                role_code = group_role_map[grp_key]
                for u in User.objects.filter(member_profile__role=role_code, is_active=True):
                    users_to_notify.add(u)
            else:
                for u in User.objects.filter(is_active=True):
                    users_to_notify.add(u)

    notifications = [
        ChurchNotification(
            user=u,
            title=f"Campaign: {campaign.title or campaign.name}",
            message=msg_text,
        )
        for u in users_to_notify
    ]
    if notifications:
        ChurchNotification.objects.bulk_create(notifications)

    # Also create or update an Announcement so it is displayed prominently
    Announcement.objects.create(
        title=f"Campaign: {campaign.title or campaign.name}",
        text=msg_text,
        detail=campaign.description or f"Campaign period: {campaign.start_date} to {campaign.end_date or 'Ongoing'}. Goal: KES {campaign.target_amount:,.2f}",
        visibility='members_only',
        action_type='camp_goal',
        is_popup=True,
        action_prompt=f"Give towards {campaign.account_name or campaign.name}",
        published=True,
        # The drive's own dates are the announcement's display window, so it
        # retires itself when the drive closes.
        starts_at=timezone.localdate(),
        expires_at=campaign.end_date,
    )

    campaign.message_sent = True
    campaign.last_message_sent_at = timezone.now()
    campaign.save(update_fields=['message_sent', 'last_message_sent_at'])
    return len(notifications)


class FundraisingCampaignListCreateView(generics.ListCreateAPIView):
    # brief=True: the list skips the per-viewer breakdowns, which scan the
    # ledger per drive and would multiply across every row of the list.
    serializer_class = FundraisingCampaignSerializer

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['brief'] = True
        return context

    def get_permissions(self):
        return [IsAuthenticated()] if self.request.method == 'POST' else [AllowAny()]

    def get_queryset(self):
        if self.request.user.is_authenticated and is_finance_manager(self.request.user):
            return FundraisingCampaign.objects.all()
        return FundraisingCampaign.objects.filter(is_active=True)

    def perform_create(self, serializer):
        if not is_treasurer_or_admin(self.request.user):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only church treasurers or administrators can create fund drives.')
        campaign = serializer.save(created_by=self.request.user)
        # Giving accounts are treasury accounts now; a drive is offered in the
        # giving form when the treasurer links it to an account, not by minting
        # a giving-purpose row for its name (the old behaviour retired).

        group_role_map = {
            'choir': ('choir_director', 'Choir Ministry'),
            'youth': ('youth_leader', 'Youth Ministries'),
            'children': ('children_ministry', 'Children Ministry'),
            'men': ('men_ministry', 'Adventist Men Ministries'),
            'women': ('women_ministry', 'Adventist Women Ministries'),
            'chaplaincy': ('chaplaincy', 'Chaplaincy'),
            'leaders': ('elder', 'Church Leaders'),
        }

        from django.contrib.auth.models import User
        users_to_assign = set()
        target_groups = campaign.target_groups or []

        if 'all_members' in target_groups or not target_groups:
            for u in User.objects.filter(is_active=True):
                users_to_assign.add((u, 'General Member'))
        else:
            for grp_key in target_groups:
                if grp_key in group_role_map:
                    role_code, grp_label = group_role_map[grp_key]
                    for u in User.objects.filter(member_profile__role=role_code):
                        users_to_assign.add((u, grp_label))
                else:
                    for u in User.objects.filter(is_active=True):
                        users_to_assign.add((u, grp_key.title()))

        if campaign.generate_card:
            for u, grp_label in users_to_assign:
                assignment, created = CampaignCardAssignment.objects.get_or_create(
                    campaign=campaign,
                    member=u,
                    defaults={'group_name': grp_label}
                )
                if created:
                    ChurchNotification.objects.create(
                        title=f"Fund Drive Invite Assigned: {campaign.name}",
                        message=f"You have been assigned a personal invite for '{campaign.title or campaign.name}'. Open your card to share your personal link!",
                    )

        # Broadcast member message if immediate dispatch is requested
        if campaign.member_message:
            is_immediate = not campaign.schedule_message or not campaign.scheduled_at or campaign.scheduled_at <= timezone.now()
            if is_immediate:
                broadcast_campaign_message(campaign)


class CampaignBroadcastView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not is_treasurer_or_admin(request.user):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only church officials or administrators can broadcast campaign messages.')
        campaign = generics.get_object_or_404(FundraisingCampaign, pk=pk)
        custom_message = request.data.get('message', '').strip() or None
        count = broadcast_campaign_message(campaign, custom_message)
        return Response({
            'detail': f'Campaign broadcast successfully sent to {count} members.',
            'count': count,
            'campaign_id': campaign.id,
            'last_message_sent_at': campaign.last_message_sent_at,
        })


class CampaignIssueCardsView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not is_treasurer_or_admin(request.user):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only church officials or administrators can issue invites.')
        campaign = generics.get_object_or_404(FundraisingCampaign, pk=pk)

        target_groups = request.data.get('target_groups', [])
        member_ids = request.data.get('member_ids', [])

        group_role_map = {
            'choir': ('choir_director', 'Choir Ministry'),
            'youth': ('youth_leader', 'Youth Ministries'),
            'children': ('children_ministry', 'Children Ministry'),
            'men': ('men_ministry', 'Adventist Men Ministries'),
            'women': ('women_ministry', 'Adventist Women Ministries'),
            'chaplaincy': ('chaplaincy', 'Chaplaincy'),
            'leaders': ('elder', 'Church Leaders'),
        }

        from django.contrib.auth.models import User
        users_to_assign = set()

        if 'all_members' in target_groups:
            for u in User.objects.filter(is_active=True):
                users_to_assign.add((u, 'General Member'))
        else:
            for grp_key in target_groups:
                if grp_key in group_role_map:
                    role_code, grp_label = group_role_map[grp_key]
                    for u in User.objects.filter(member_profile__role=role_code):
                        users_to_assign.add((u, grp_label))
                else:
                    for u in User.objects.filter(is_active=True):
                        users_to_assign.add((u, grp_key.title()))

        if member_ids:
            for u in User.objects.filter(id__in=member_ids, is_active=True):
                users_to_assign.add((u, 'Individual Member'))

        created_count = 0
        for u, grp_label in users_to_assign:
            assignment, created = CampaignCardAssignment.objects.get_or_create(
                campaign=campaign,
                member=u,
                defaults={'group_name': grp_label}
            )
            if created:
                created_count += 1
                ChurchNotification.objects.create(
                    title=f"Fund Drive Invite Issued: {campaign.name}",
                    message=f"You have been issued a personal invite for '{campaign.title or campaign.name}'. Open your card to share your personal link!",
                )

        return Response({
            'detail': f'Issued {created_count} personal invite(s) for {campaign.name}.',
            'created_count': created_count,
            'campaign_id': campaign.id,
        })


class CampaignCardAssignmentLookupView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, token):
        assignment = generics.get_object_or_404(CampaignCardAssignment, referral_token=token)
        serializer = CampaignCardAssignmentSerializer(assignment)
        return Response(serializer.data)


class MyCampaignCardsView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = CampaignCardAssignmentSerializer

    def get_queryset(self):
        return CampaignCardAssignment.objects.filter(member=self.request.user)


class FundraisingCampaignDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = FundraisingCampaignSerializer
    queryset = FundraisingCampaign.objects.all()

    def get_permissions(self):
        return [AllowAny()] if self.request.method == 'GET' else [IsAuthenticated()]

    def perform_update(self, serializer):
        if not is_treasurer_or_admin(self.request.user):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only church treasurers or administrators can edit fund drives.')
        serializer.save()

    def perform_destroy(self, instance):
        if not is_finance_manager(self.request.user):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only church officials can delete fund drives.')
        instance.delete()


class CurrentMemberView(generics.RetrieveAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = UserDetailSerializer

    def get_object(self):
        return self.request.user


class MembershipTransferRequestView(generics.ListCreateAPIView):
    permission_classes = [AllowAny]
    serializer_class = MembershipTransferRequestSerializer

    def get_queryset(self):
        return MembershipTransferRequest.objects.all()

    def perform_create(self, serializer):
        instance = serializer.save()
        notify_request_safely(
            'transfer',
            instance.pk,
            submitted_by=instance.member_name or 'A church member',
            church_name=current_church_name(),
            submitted_at=instance.created_at,
        )


class MembershipTransferRequestDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [AllowAny]
    serializer_class = MembershipTransferRequestSerializer
    queryset = MembershipTransferRequest.objects.all()

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        next_status = request.data.get('status')
        current_profile = getattr(request.user, 'member_profile', None) if request.user.is_authenticated else None
        if next_status == 'approved' and (not current_profile or not current_profile.has_role('admin', 'elder')):
            return Response({'detail': 'Only elders or administrators can approve transfer requests.'}, status=status.HTTP_403_FORBIDDEN)

        response = super().partial_update(request, *args, **kwargs)
        instance.refresh_from_db()
        if response.status_code < 400 and next_status == 'approved' and instance.transfer_type == 'outgoing':
            target_user = None
            if instance.email:
                target_user = User.objects.filter(email__iexact=instance.email).first()
            if not target_user and instance.phone_number:
                target_user = User.objects.filter(member_profile__phone_number=instance.phone_number).first()
            if target_user:
                target_profile, _ = MemberProfile.objects.get_or_create(user=target_user)
                target_profile.role = 'member'
                target_profile.roles = 'member'
                target_profile.account_type = 'friend' if instance.remain_friend else 'member'
                target_profile.is_disfellowshipped = not bool(instance.remain_friend)
                target_profile.save(update_fields=['role', 'roles', 'account_type', 'is_disfellowshipped'])
                ChurchNotification.objects.create(
                    user=target_user,
                    title="Transfer Request Approved",
                    message="Your transfer-out request has been approved.",
                )
        return response


class MembershipRemovalRequestView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = MembershipRemovalRequestSerializer

    def get_queryset(self):
        profile = getattr(self.request.user, 'member_profile', None)
        if profile and profile.has_role('admin', 'clerk', 'elder'):
            return MembershipRemovalRequest.objects.select_related('member', 'requested_by', 'reviewed_by').all()
        return MembershipRemovalRequest.objects.none()

    def perform_create(self, serializer):
        profile = getattr(self.request.user, 'member_profile', None)
        if not profile or not profile.has_role('admin', 'clerk', 'elder'):
            raise PermissionDenied('Only church officials can request member removal.')
        serializer.save(requested_by=self.request.user)


class MembershipRemovalRequestDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = MembershipRemovalRequestSerializer
    queryset = MembershipRemovalRequest.objects.select_related('member', 'requested_by', 'reviewed_by').all()

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        next_status = request.data.get('status')
        profile = getattr(request.user, 'member_profile', None)
        if next_status in ('approved', 'rejected') and (not profile or not profile.has_role('admin', 'elder')):
            return Response({'detail': 'Only elders or administrators can review removal requests.'}, status=status.HTTP_403_FORBIDDEN)
        if next_status not in ('approved', 'rejected'):
            return Response({'detail': 'Use approved or rejected for removal review.'}, status=status.HTTP_400_BAD_REQUEST)

        instance.status = next_status
        instance.reviewed_by = request.user
        instance.reviewed_at = timezone.now()
        instance.save(update_fields=['status', 'reviewed_by', 'reviewed_at'])

        if next_status == 'approved':
            target_profile, _ = MemberProfile.objects.get_or_create(user=instance.member)
            target_profile.is_disfellowshipped = True
            target_profile.role = 'member'
            target_profile.roles = 'member'
            target_profile.save(update_fields=['is_disfellowshipped', 'role', 'roles'])
            ChurchNotification.objects.create(
                user=instance.member,
                title="Membership Removal Approved",
                message="Your membership removal has been approved. Please contact church leadership for more information.",
            )
        return Response(self.get_serializer(instance).data)


class ChurchCorrespondenceView(generics.ListCreateAPIView):
    permission_classes = [AllowAny]
    serializer_class = ChurchCorrespondenceSerializer

    def get_queryset(self):
        return ChurchCorrespondence.objects.all()


class BoardMeetingView(generics.ListCreateAPIView):
    permission_classes = [AllowAny]
    serializer_class = BoardMeetingSerializer

    def get_queryset(self):
        return BoardMeeting.objects.all().prefetch_related('agendas')

    def create(self, request, *args, **kwargs):
        title = request.data.get('title')
        meeting_date = parse_date(str(request.data.get('meeting_date') or ''))
        start_time = parse_clock(request.data.get('start_time'))
        end_time = parse_clock(request.data.get('end_time'))
        location = request.data.get('location', 'Board Room / Main Sanctuary')
        agenda_summary = request.data.get('agenda', '')
        minutes = request.data.get('minutes', '')
        status_val = request.data.get('status', 'upcoming')
        notify_sms = as_bool(request.data.get('notify_sms', True))
        notify_email = as_bool(request.data.get('notify_email', True))
        custom_message = (request.data.get('notification_message') or '').strip()

        if not title or not meeting_date:
            return Response({'error': 'Title and meeting_date are required.'}, status=status.HTTP_400_BAD_REQUEST)
        if start_time and end_time and end_time <= start_time:
            return Response({'end_time': 'A meeting has to finish after it starts.'}, status=status.HTTP_400_BAD_REQUEST)

        meeting = BoardMeeting.objects.create(
            title=title,
            meeting_date=meeting_date,
            start_time=start_time,
            end_time=end_time,
            location=location,
            agenda=agenda_summary,
            minutes=minutes,
            status=status_val,
            notify_sms=notify_sms,
            notify_email=notify_email
        )

        create_agendas(request, meeting, BoardMeetingAgenda)

        # Invite the church board, using the message the secretary edited on the
        # form when there is one, and the church's configured template otherwise.
        invited, emailed = broadcast_invitation(
            meeting,
            BOARD_KIND,
            current_church_name(),
            template=custom_message or None,
            notify_sms=notify_sms,
            notify_email=notify_email,
        )

        serializer = self.get_serializer(meeting)
        data = dict(serializer.data)
        data['invitations'] = {'invited': invited, 'emailed': emailed}
        return Response(data, status=status.HTTP_201_CREATED)


class BoardMeetingDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [AllowAny]
    serializer_class = BoardMeetingSerializer
    queryset = BoardMeeting.objects.all().prefetch_related('agendas')


class BoardMeetingAddAgendaView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, pk):
        meeting = generics.get_object_or_404(BoardMeeting, pk=pk)
        title = request.data.get('title', '').strip()
        description = request.data.get('description', '').strip()
        order_val = request.data.get('order')

        if not title:
            return Response({'error': 'Agenda title is required.'}, status=status.HTTP_400_BAD_REQUEST)

        if not order_val:
            order = meeting.agendas.count() + 1
        else:
            try:
                order = int(order_val)
            except ValueError:
                order = meeting.agendas.count() + 1

        doc_file = request.FILES.get('document') or request.FILES.get('file')
        doc_name = doc_file.name if doc_file else request.data.get('document_name', '')

        BoardMeetingAgenda.objects.create(
            meeting=meeting,
            title=title,
            description=description,
            order=order,
            document=doc_file if doc_file else None,
            document_name=doc_name
        )
        serializer = BoardMeetingSerializer(meeting)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class BoardMeetingAgendaDetailView(generics.DestroyAPIView):
    permission_classes = [AllowAny]
    queryset = BoardMeetingAgenda.objects.all()


class BusinessMeetingView(generics.ListCreateAPIView):
    permission_classes = [AllowAny]
    serializer_class = BusinessMeetingSerializer
    queryset = BusinessMeeting.objects.all().prefetch_related('agendas')

    def create(self, request, *args, **kwargs):
        title = request.data.get('title')
        meeting_date = parse_date(str(request.data.get('meeting_date') or ''))
        meeting_time = request.data.get('meeting_time', '2:00 PM')
        location = request.data.get('location', 'Main Sanctuary')
        status_val = request.data.get('status', 'upcoming')
        minutes = request.data.get('minutes', '')
        notify_sms = as_bool(request.data.get('notify_sms', True))
        notify_email = as_bool(request.data.get('notify_email', True))
        custom_message = (request.data.get('notification_message') or '').strip()

        if not title or not meeting_date:
            return Response({'error': 'Title and meeting_date are required.'}, status=status.HTTP_400_BAD_REQUEST)

        meeting = BusinessMeeting.objects.create(
            title=title,
            meeting_date=meeting_date,
            meeting_time=meeting_time,
            location=location,
            status=status_val,
            minutes=minutes,
            notify_sms=notify_sms,
            notify_email=notify_email
        )

        create_agendas(request, meeting, BusinessMeetingAgenda)

        invited, emailed = broadcast_invitation(
            meeting,
            BUSINESS_KIND,
            current_church_name(),
            template=custom_message or None,
            notify_sms=notify_sms,
            notify_email=notify_email,
        )

        serializer = self.get_serializer(meeting)
        data = dict(serializer.data)
        data['invitations'] = {'invited': invited, 'emailed': emailed}
        return Response(data, status=status.HTTP_201_CREATED)


class BusinessMeetingDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [AllowAny]
    serializer_class = BusinessMeetingSerializer
    queryset = BusinessMeeting.objects.all().prefetch_related('agendas')


class BusinessMeetingAddAgendaView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, pk):
        meeting = generics.get_object_or_404(BusinessMeeting, pk=pk)
        title = request.data.get('title', '').strip()
        description = request.data.get('description', '').strip()
        order_val = request.data.get('order')

        if not title:
            return Response({'error': 'Agenda title is required.'}, status=status.HTTP_400_BAD_REQUEST)

        if not order_val:
            order = meeting.agendas.count() + 1
        else:
            try:
                order = int(order_val)
            except ValueError:
                order = meeting.agendas.count() + 1

        doc_file = request.FILES.get('document') or request.FILES.get('file')
        doc_name = doc_file.name if doc_file else request.data.get('document_name', '')

        BusinessMeetingAgenda.objects.create(
            meeting=meeting,
            title=title,
            description=description,
            order=order,
            document=doc_file if doc_file else None,
            document_name=doc_name
        )
        serializer = BusinessMeetingSerializer(meeting)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class BusinessMeetingAgendaDetailView(generics.DestroyAPIView):
    permission_classes = [AllowAny]
    queryset = BusinessMeetingAgenda.objects.all()



class ChurchNotificationView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ChurchNotificationSerializer

    def get_queryset(self):
        return ChurchNotification.objects.filter(user=self.request.user)


class VisitationRequestView(generics.ListCreateAPIView):
    permission_classes = [AllowAny]
    serializer_class = VisitationRequestSerializer

    def get_queryset(self):
        user = self.request.user
        if user and user.is_authenticated:
            profile = getattr(user, 'member_profile', None)
            if profile and profile.has_role('admin', 'clerk', 'elder', 'chaplaincy'):
                return VisitationRequest.objects.all().order_by('-id')
        return VisitationRequest.objects.none()

    def perform_create(self, serializer):
        instance = serializer.save()
        notify_request_safely(
            'visitation',
            instance.pk,
            submitted_by=instance.requester_name or 'A church member',
            church_name=current_church_name(),
            submitted_at=instance.created_at,
        )


class UserManagementView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = UserDetailSerializer

    def get_queryset(self):
        return roster_queryset().order_by('-date_joined')

    def create(self, request, *args, **kwargs):
        profile = getattr(request.user, 'member_profile', None)
        if not profile or not profile.has_role('admin', 'clerk'):
            return Response({'detail': 'Only admins or clerks can add new members.'}, status=status.HTTP_403_FORBIDDEN)

        username = (request.data.get('username') or '').strip()
        password = (request.data.get('password') or '').strip()
        email = (request.data.get('email') or '').strip()
        raw_name = (request.data.get('name') or request.data.get('full_name') or '').strip()
        first_name = (request.data.get('first_name') or '').strip()
        last_name = (request.data.get('last_name') or '').strip()

        if raw_name and (not first_name or not last_name):
            name_parts = raw_name.split()
            if len(name_parts) == 1:
                first_name = name_parts[0]
                last_name = ""
            elif len(name_parts) == 2:
                first_name = name_parts[0]
                last_name = name_parts[1]
            else:
                first_name = " ".join(name_parts[:-1])
                last_name = name_parts[-1]

        phone_number = (request.data.get('phone_number') or '').strip()
        whatsapp_number = (request.data.get('whatsapp_number') or '').strip()
        role = request.data.get('role') or 'member'
        profession = request.data.get('profession', '')
        gender = request.data.get('gender', '')
        date_of_birth = request.data.get('date_of_birth') or None
        gifts = request.data.get('gifts', '')
        if isinstance(gifts, list):
            gifts = ", ".join(str(g).strip() for g in gifts if str(g).strip())
        disability = request.data.get('disability', '')
        if isinstance(disability, list):
            disability = ", ".join(str(d).strip() for d in disability if str(d).strip())
        account_type = request.data.get('account_type') or 'member'
        if account_type not in ('member', 'friend', 'sabbath_school'):
            account_type = 'member'
        current_church = (request.data.get('current_church') or '').strip()
        baptismal_status = (request.data.get('baptismal_status') or '').strip()
        if account_type == 'friend':
            if not current_church:
                return Response({'detail': 'Current church is required for friends.'}, status=status.HTTP_400_BAD_REQUEST)
            baptismal_status = baptismal_status if baptismal_status in ('baptised', 'not_baptised', 'transfer_pending') else 'baptised'
        else:
            current_church = ''
            baptismal_status = ''

        if not first_name:
            return Response({'detail': 'Name is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if account_type == 'member' and not email:
            return Response({'detail': 'Email address is required.'}, status=status.HTTP_400_BAD_REQUEST)
        submitted_roles = parse_role_codes(request.data.get('roles') or role or request.data.get('role'))
        unknown = unknown_role_codes(submitted_roles)
        if unknown:
            return Response({'roles': f"Unknown role code(s): {', '.join(unknown)}"}, status=status.HTTP_400_BAD_REQUEST)
        roles_param = normalize_roles(submitted_roles)
        # Administrator is a system role: only administrators may hand it out.
        error = check_system_role_change(request.user, None, [], roles_param)
        if error:
            return Response({'roles': error}, status=status.HTTP_403_FORBIDDEN)

        if not username:
            clean_first = re.sub(r'[^a-zA-Z0-9]', '', first_name.lower().replace(' ', '.'))
            clean_last = re.sub(r'[^a-zA-Z0-9]', '', last_name.lower())
            base = f"{clean_first}.{clean_last}".strip('.') or 'member'
            candidate = base
            counter = 1
            while User.objects.filter(username=candidate).exists():
                candidate = f"{base}{counter}"
                counter += 1
            username = candidate

        password_generated = False
        if not password:
            password = generate_temporary_password()
            password_generated = True
        else:
            problems = password_problems(password)
            if problems:
                return Response({'password': problems}, status=status.HTTP_400_BAD_REQUEST)

        if User.objects.filter(username=username).exists():
            return Response({'detail': 'A user with this username already exists.'}, status=status.HTTP_400_BAD_REQUEST)
        if email and User.objects.filter(email=email).exists():
            return Response({'detail': 'A user with this email address already exists.'}, status=status.HTTP_400_BAD_REQUEST)

        if not username:
            # Fallback username for records without enough name parts
            username = f"{re.sub(r'[^a-zA-Z0-9]', '', first_name.lower()) or 'member'}{User.objects.count() + 1}"
            counter = 1
            while User.objects.filter(username=username).exists():
                counter += 1
                username = f"{re.sub(r'[^a-zA-Z0-9]', '', first_name.lower()) or 'member'}{User.objects.count() + counter}"

        user = User.objects.create_user(
            username=username,
            email=email,
            first_name=first_name,
            last_name=last_name,
            password=password
        )
        profile_obj, _ = MemberProfile.objects.get_or_create(user=user)
        profile_obj.phone_number = phone_number
        profile_obj.whatsapp_number = whatsapp_number
        profile_obj.role = roles_param[0]
        profile_obj.roles = ', '.join(roles_param)
        profile_obj.account_type = account_type
        profile_obj.must_change_password = True
        profile_obj.current_church = current_church
        profile_obj.baptismal_status = baptismal_status
        profile_obj.profession = profession
        profile_obj.gender = gender
        profile_obj.gifts = str(gifts or '').strip()
        profile_obj.disability = str(disability or '').strip()
        if date_of_birth:
            profile_obj.date_of_birth = date_of_birth
        profile_obj.save()
        sync_role_groups(user, roles_param)

        response_data = UserDetailSerializer(user).data
        if password_generated:
            # Surface the one-time password: the console has no password field, so
            # without this the new account would exist but nobody could sign in.
            response_data['temporary_password'] = password
        return Response(response_data, status=status.HTTP_201_CREATED)


class UserDetailUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            target_user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({'detail': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(UserDetailSerializer(target_user).data)

    def put(self, request, pk):
        return self.patch(request, pk)

    def patch(self, request, pk):
        """Propose a profile edit for the member's own approval.

        A profile is the church's record of a person, and that person is best
        placed to vouch for it: nothing written here is applied at once.
        Instead the whole edit is parked as a pending ProfileChangeRequest and
        the member is notified; their approval applies it verbatim, and their
        refusal leaves the record exactly as it was. Role changes keep the old
        immediate path — roles are the church's delegation of authority, not
        the member's personal details.
        """
        current_profile = getattr(request.user, 'member_profile', None)
        if not current_profile or not current_profile.has_role('admin', 'clerk'):
            return Response({'detail': 'Only church administrators or clerks can edit member profiles.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            target_user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({'detail': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

        # Fields the member is asked to approve, read off the account and the
        # profile in the same shapes UserDetailSerializer returns them in.
        target_profile, _ = MemberProfile.objects.get_or_create(user=target_user)
        profile_fields = {
            'first_name': 'first_name',
            'last_name': 'last_name',
            'email': 'email',
            'phone_number': 'phone_number',
            'whatsapp_number': 'whatsapp_number',
            'profession': 'profession',
            'residence': 'residence',
            'gender': 'gender',
            'date_of_birth': 'date_of_birth',
            'gifts': 'gifts',
            'disability': 'disability',
        }

        def normalise(field, value):
            if field in ('gifts', 'disability') and isinstance(value, list):
                return ", ".join(str(g).strip() for g in value if str(g).strip())
            if field == 'date_of_birth':
                return value or None
            return value

        changes = {}
        for field in profile_fields:
            if field not in request.data:
                continue
            new_value = normalise(field, request.data.get(field))
            if hasattr(target_user, profile_fields[field]):
                current_value = getattr(target_user, profile_fields[field])
            else:
                current_value = getattr(target_profile, profile_fields[field])
            if new_value != current_value:
                changes[field] = new_value

        if 'is_disfellowshipped' in request.data:
            requested = bool(request.data['is_disfellowshipped'])
            if requested != target_profile.is_disfellowshipped:
                return Response(
                    {'detail': 'Membership status changes are church business; use the Remove or disfellowship action instead.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        roles_payload = request.data.get('roles') or request.data.get('role')
        if roles_payload:
            # Roles remain the officers' to assign: they delegate authority in
            # the church and cannot wait on a member's convenience.
            unknown = unknown_role_codes(parse_role_codes(roles_payload))
            if unknown:
                return Response({'roles': f"Unknown role code(s): {', '.join(unknown)}"}, status=status.HTTP_400_BAD_REQUEST)
            error = check_system_role_change(request.user, target_user, target_profile.get_roles(), normalize_roles(roles_payload))
            if error:
                return Response({'roles': error}, status=status.HTTP_403_FORBIDDEN)
            rule_error = assignment_error(target_user, normalize_roles(roles_payload))
            if rule_error:
                field, message = rule_error
                return Response({'detail': message, field: message}, status=status.HTTP_400_BAD_REQUEST)
            roles_val = target_profile.set_roles(roles_payload, save=False)
            sync_role_groups(target_user, roles_val)
            target_profile.save(update_fields=['roles', 'role'])

        if not changes:
            # Nothing personal would change; the (possibly empty) role edit
            # above was still church business done immediately.
            return Response(UserDetailSerializer(target_user).data)

        proposal = ProfileChangeRequest.objects.create(
            member=target_user,
            proposed_by=request.user,
            changes=changes,
        )
        changed_labels = ', '.join(field.replace('_', ' ') for field in changes)
        ChurchNotification.objects.create(
            user=target_user,
            title='Your profile has a proposed update',
            message=(
                f"The church office proposed updating your {changed_labels}. "
                "Open your dashboard to approve the update or keep your current details."
            ),
        )
        return Response(
            {
                **UserDetailSerializer(target_user).data,
                'pending_change_request': ProfileChangeRequestSerializer(proposal).data,
                'detail': (
                    "The member must approve these changes. A proposal was saved "
                    "and they have been notified on their dashboard."
                ),
            },
            status=status.HTTP_202_ACCEPTED,
        )


class ProfileChangeRequestView(APIView):
    """The member's own view of proposals about their profile."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        pending = ProfileChangeRequest.objects.filter(member=request.user, status='pending').first()
        if not pending:
            return Response({'pending': False})
        return Response({'pending': True, 'change_request': ProfileChangeRequestSerializer(pending).data})


class ProfileChangeDecisionView(APIView):
    """Approve or refuse a proposed profile change. Only the member decides."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        decision = str(request.data.get('decision') or '').strip().lower()
        if decision not in ('approve', 'keep'):
            return Response({'detail': 'Choose "approve" or "keep".'}, status=status.HTTP_400_BAD_REQUEST)

        proposal = (
            ProfileChangeRequest.objects
            .filter(member=request.user, status='pending')
            .order_by('-proposed_at')
            .first()
        )
        if not proposal:
            return Response({'detail': 'You have no proposed profile changes waiting.'}, status=status.HTTP_404_NOT_FOUND)

        member = proposal.member
        profile = getattr(member, 'member_profile', None) or MemberProfile.objects.create(user=member)
        account_fields = {'first_name', 'last_name', 'email'}

        if decision == 'approve':
            for field, value in proposal.changes.items():
                if field in account_fields:
                    setattr(member, field, value)
                elif hasattr(profile, field):
                    setattr(profile, field, value)
            member.save(update_fields=[f for f in account_fields if f in proposal.changes])
            profile_fields = [f for f in proposal.changes if f not in account_fields]
            if profile_fields:
                profile.save(update_fields=profile_fields)
            proposal.status = 'approved'
            proposal.decided_at = timezone.now()
            proposal.save(update_fields=['status', 'decided_at'])
            return Response({'detail': 'Profile updated. Thank you for confirming your details.', 'status': 'approved'})

        proposal.status = 'kept'
        proposal.decided_at = timezone.now()
        proposal.save(update_fields=['status', 'decided_at'])
        return Response({'detail': 'Your details were kept as they are.', 'status': 'kept'})


class DisfellowshipView(APIView):
    """Toggle disfellowship status on a member. Clerks/admins only."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        current_profile = getattr(request.user, 'member_profile', None)
        if not current_profile or not current_profile.has_role('admin', 'clerk', 'elder'):
            return Response({'detail': 'Only church administrators or clerks can perform this action.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            target_user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({'detail': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

        target_profile, _ = MemberProfile.objects.get_or_create(user=target_user)
        action = request.data.get('action')  # 'disfellowship' or 'refellowship'

        if action == 'disfellowship':
            target_profile.is_disfellowshipped = True
            target_profile.role = 'member'  # demote
            target_profile.roles = 'member'
            target_profile.save(update_fields=['is_disfellowshipped', 'role', 'roles'])
            # Send notification
            ChurchNotification.objects.create(
                user=target_user,
                title="Membership Status Update",
                message="Your church membership status has been updated. Please contact the church clerk for more information.",
            )
            return Response({'detail': 'Member has been disfellowshipped.', 'is_disfellowshipped': True})
        elif action == 'refellowship':
            target_profile.is_disfellowshipped = False
            target_profile.save(update_fields=['is_disfellowshipped'])
            ChurchNotification.objects.create(
                user=target_user,
                title="Membership Restored",
                message="Your church membership has been restored. Welcome back to the fellowship!",
            )
            return Response({'detail': 'Member has been refellowshipped.', 'is_disfellowshipped': False})
        else:
            return Response({'detail': 'Invalid action. Use "disfellowship" or "refellowship".'}, status=status.HTTP_400_BAD_REQUEST)


class MemberListPDFView(APIView):
    """Generate and return a PDF list of all church members."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        current_profile = getattr(request.user, 'member_profile', None)
        if not current_profile or not current_profile.has_role('admin', 'clerk', 'elder'):
            return Response({'detail': 'Only church administrators or clerks can export the member list.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            settings_obj = ChurchSettings.objects.first()
            church_name = settings_obj.church_name if settings_obj else "SDA Church"
        except Exception:
            church_name = "SDA Church"

        # The printed roster is the same list as the Users screen: system
        # accounts and unanswered join requests stay out of it here too.
        users = (
            roster_queryset()
            .select_related('member_profile')
            .order_by('first_name', 'last_name')
        )
        members_data = []
        friend_count = 0
        for u in users:
            profile = getattr(u, 'member_profile', None)
            account_type = (getattr(profile, 'account_type', 'member') or 'member')
            if account_type == 'friend':
                friend_count += 1
            members_data.append({
                'name': f"{u.first_name} {u.last_name}".strip() or u.username,
                'phone': getattr(profile, 'phone_number', '') or u.email or '—',
                'email': u.email or '—',
                'role': (getattr(profile, 'role', 'member') or 'member').replace('_', ' ').title(),
                'account_type': account_type,
                'is_disfellowshipped': getattr(profile, 'is_disfellowshipped', False),
            })

        from .pdf_generator import generate_member_list_pdf
        pdf_bytes = generate_member_list_pdf(church_name, members_data, friend_count=friend_count)
        from datetime import date
        filename = f"Member_List_{date.today().strftime('%Y%m%d')}.pdf"
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response['Content-Disposition'] = f'inline; filename="{filename}"'
        return response


class RoleRegisterView(APIView):
    """Every church role with who holds it.

    The role pickers need this to know which roles are free, which are held by
    someone else (so they cannot be handed out twice), and which already have a
    leader to assist. It is a small leadership directory built from the same
    hard-coded role list the rest of the app uses.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({'roles': role_register()})


class UserRoleUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        current_profile = getattr(request.user, 'member_profile', None)
        if not current_profile or not current_profile.has_role('admin', 'elder', 'clerk'):
            return Response({'detail': 'Only church administrators or clerks can update member roles.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            target_user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({'detail': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

        new_role = request.data.get('role')
        roles_param = request.data.get('roles')
        if roles_param is not None and not new_role:
            submitted = parse_role_codes(roles_param)
            unknown = unknown_role_codes(submitted)
            if unknown:
                return Response({'roles': f"Unknown role code(s): {', '.join(unknown)}"}, status=status.HTTP_400_BAD_REQUEST)
            if not submitted:
                return Response({'detail': 'At least one role is required.'}, status=status.HTTP_400_BAD_REQUEST)
            # Replace the whole set with the provided list
            target_profile, _ = MemberProfile.objects.get_or_create(user=target_user)
            old_roles = set(target_profile.get_roles())
            error = check_system_role_change(request.user, target_user, old_roles, submitted)
            if error:
                return Response({'roles': error}, status=status.HTTP_403_FORBIDDEN)
            # Which of those roles the member shares as an assistant. Validated
            # as submitted (so a flag on a role that is not held is reported
            # rather than quietly dropped); ``set_roles`` does the storing.
            submitted_assistants = parse_role_codes(request.data.get('assistant_roles'))
            rule_error = assignment_error(target_user, submitted, submitted_assistants)
            if rule_error:
                field, message = rule_error
                return Response({'detail': message, field: message}, status=status.HTTP_400_BAD_REQUEST)
            roles_param = target_profile.set_roles(submitted, assistants=submitted_assistants)
            sync_role_groups(target_user, roles_param)
            added = [r for r in roles_param if r not in old_roles]
            removed = [r for r in old_roles if r not in roles_param and r != 'member']
            role_display = role_labels(roles_param)
            if added or removed:
                ChurchNotification.objects.create(
                    user=target_user,
                    title=f"Church Roles Updated: {role_display}",
                    message=f"Your church roles have been updated to: {role_display}. Log into your account to access your updated workspace and leadership tools.",
                )
                if target_user.email:
                    try:
                        church_name = current_church_name()
                        user_display_name = f"{target_user.first_name} {target_user.last_name}".strip() or target_user.username
                        send_mail(
                            f"Church Role Update — {role_display}",
                            f"Hello {user_display_name},\n\n"
                            f"Your church roles have been updated to: {role_display}.\n\n"
                            f"You can log into your account to access your updated leadership workspace, responsibilities, and management tools.\n\n"
                            f"May God bless your service in church ministry.\n\n"
                            f"Warm regards,\n{church_name_plain(church_name)} Leadership",
                            settings.DEFAULT_FROM_EMAIL,
                            [target_user.email],
                            fail_silently=True,
                        )
                    except Exception:
                        pass
            return Response({
                'id': target_user.id,
                'username': target_user.username,
                'role': target_profile.role,
                'roles': target_profile.get_roles(),
                'role_display': role_display,
                'detail': f"Roles for {target_user.username} updated to '{role_display}'."
            })
        if not new_role:
            return Response({'detail': 'Role parameter is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if new_role not in ROLE_CODES:
            return Response({'role': f"Unknown role code: {new_role}"}, status=status.HTTP_400_BAD_REQUEST)

        target_profile, _ = MemberProfile.objects.get_or_create(user=target_user)
        old_role = target_profile.role
        error = check_system_role_change(request.user, target_user, target_profile.get_roles(), [new_role])
        if error:
            return Response({'role': error}, status=status.HTTP_403_FORBIDDEN)
        rule_error = assignment_error(target_user, [new_role])
        if rule_error:
            field, message = rule_error
            return Response({'detail': message, field: message}, status=status.HTTP_400_BAD_REQUEST)
        new_role = target_profile.set_roles([new_role])[0]
        sync_role_groups(target_user, [new_role])

        role_display = target_profile.get_role_display()

        # Send in-app notification & email if role changed
        if old_role != new_role:
            ChurchNotification.objects.create(
                user=target_user,
                title=f"New Church Role Assigned: {role_display}",
                message=f"You have been assigned the role of '{role_display}' at {current_church_name()}. Log into your account to access your updated workspace and leadership tools.",
            )

            if target_user.email:
                try:
                    church_name = current_church_name()
                    user_display_name = f"{target_user.first_name} {target_user.last_name}".strip() or target_user.username
                    send_mail(
                        f"Church Role Update — {role_display}",
                        f"Hello {user_display_name},\n\n"
                        f"You have been assigned the role of '{role_display}' at {church_name}.\n\n"
                        f"You can log into your account to access your updated leadership workspace, responsibilities, and management tools.\n\n"
                        f"May God bless your service in church ministry.\n\n"
                        f"Warm regards,\n{church_name} Leadership",
                        settings.DEFAULT_FROM_EMAIL,
                        [target_user.email],
                        fail_silently=True,
                    )
                except Exception:
                    pass

        return Response({
            'id': target_user.id,
            'username': target_user.username,
            'role': target_profile.role,
            'role_display': role_display,
            'detail': f"Role for {target_user.username} updated to '{role_display}'."
        })


class UserAccountTypeUpdateView(APIView):
    """Shift a person between member, friend and ex-member.

    Which of the three someone is was already stored as two fields —
    ``account_type`` for member/friend and ``is_disfellowshipped`` for the
    ex-member state — and the Users table read them but could not set them. The
    three-way choice is owned here so every surface (list, filter, card) agrees.
    """

    permission_classes = [IsAuthenticated]

    VALID_TYPES = ('member', 'friend', 'sabbath_school', 'ex_member')

    def patch(self, request, pk):
        current_profile = getattr(request.user, 'member_profile', None)
        if not current_profile or not current_profile.has_role('admin', 'elder', 'clerk'):
            return Response(
                {'detail': 'Only church administrators or clerks can change a person\'s type.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        requested = (request.data.get('account_type') or '').strip()
        if requested not in self.VALID_TYPES:
            return Response(
                {'account_type': "Choose one of: member, friend, sabbath_school, ex_member."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            target_user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({'detail': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

        if target_user.is_superuser:
            return Response(
                {'detail': 'This is a system account, not a church member.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        profile, _ = MemberProfile.objects.get_or_create(user=target_user)
        previous = 'ex_member' if profile.is_disfellowshipped else profile.account_type

        if requested == 'ex_member':
            # Someone who left keeps whatever they were before, so restoring them
            # later is not a guess.
            profile.is_disfellowshipped = True
        else:
            profile.account_type = requested
            profile.is_disfellowshipped = False
        profile.save(update_fields=['account_type', 'is_disfellowshipped'])

        if previous != requested:
            ChurchNotification.objects.create(
                user=target_user,
                title="Your church record was updated",
                message=(
                    f"Your record at {current_church_name()} is now recorded as "
                    f"{ACCOUNT_TYPE_LABELS[requested]}. Speak to a church clerk if this is not right."
                ),
            )

        serializer = UserDetailSerializer(target_user)
        data = dict(serializer.data)
        data['detail'] = f"{target_user.username} is now {ACCOUNT_TYPE_LABELS[requested]}."
        return Response(data)


ACCOUNT_TYPE_LABELS = {
    'member': 'a member',
    'friend': 'a friend',
    'sabbath_school': 'a Sabbath School attendee',
    'ex_member': 'an ex-member',
}


class MemberLookupView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        query = (request.query_params.get('query') or request.query_params.get('q') or '').strip()
        user = None

        if not query and request.user and request.user.is_authenticated:
            user = request.user
        elif query:
            clean_query = re.sub(r'\D', '', query)
            from django.db.models import Q
            q_filter = Q(email__iexact=query) | Q(username__iexact=query)
            if clean_query and len(clean_query) >= 7:
                q_filter |= Q(member_profile__phone_number__icontains=clean_query[-9:])
            user = User.objects.filter(q_filter, is_active=True).first()

        if not user:
            return Response({'found': False})

        profile = getattr(user, 'member_profile', None)
        full_name = f"{user.first_name} {user.last_name}".strip() or user.username
        first_name = user.first_name or (full_name.split()[0] if full_name else '')
        last_name = user.last_name or (full_name.split()[-1] if len(full_name.split()) > 1 else '')
        gender = profile.gender if profile else ''

        return Response({
            'found': True,
            'id': user.id,
            'name': full_name,
            'first_name': first_name,
            'last_name': last_name,
            'email': user.email,
            'phone_number': profile.phone_number if profile else '',
            'gender': gender,
            'sex': gender,
            'role': profile.role if profile else '',
        })


from .pdf_generator import (
    generate_reconciliation_pdf,
    generate_member_giving_statement_pdf,
    generate_business_meeting_pdf,
)

class ReconciliationPdfView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from_param = request.query_params.get("start_date") or request.query_params.get("date")
        to_param = request.query_params.get("end_date") or request.query_params.get("date")
        
        today = timezone.localdate()
        try:
            start_date = datetime.strptime(from_param, "%Y-%m-%d").date() if from_param else today
        except ValueError:
            start_date = today
        try:
            end_date = datetime.strptime(to_param, "%Y-%m-%d").date() if to_param else today
        except ValueError:
            end_date = today

        purpose_param = request.query_params.get("purpose", "").strip()
        is_individual = request.query_params.get("include_individual", "false").lower() in ["true", "1", "yes"] or bool(purpose_param)

        digital_filter = Q(status__iexact="completed", giving_type="financial") & (
            Q(paid_at__date__gte=start_date, paid_at__date__lte=end_date) |
            Q(paid_at__isnull=True, created_at__date__gte=start_date, created_at__date__lte=end_date)
        )
        digital = Contribution.objects.filter(digital_filter)
        cash = CashContribution.objects.filter(received_on__range=(start_date, end_date))

        if purpose_param:
            p_q = _get_purpose_q(purpose_param)
            digital = digital.filter(p_q)
            cash = cash.filter(p_q)

        purposes_dict = {}

        for c in digital:
            p = c.purpose.strip() if c.purpose else "Combined Offering"
            if p not in purposes_dict:
                purposes_dict[p] = {"name": p, "mpesa": Decimal("0"), "bank_transfer": Decimal("0"), "cheque": Decimal("0"), "cash": Decimal("0"), "total": Decimal("0")}
            pm = (c.payment_method or "mpesa").lower().strip()
            if pm in ["mpesa", "bank_transfer", "cheque", "cash"]:
                purposes_dict[p][pm] += c.amount
            elif "airtel" in pm or "card" in pm or "stripe" in pm or "paystack" in pm:
                # Legacy mobile-money/card methods roll up into M-Pesa
                purposes_dict[p]["mpesa"] += c.amount
            elif "bank" in pm or "deposit" in pm or "transfer" in pm:
                purposes_dict[p]["bank_transfer"] += c.amount
            else:
                purposes_dict[p]["mpesa"] += c.amount

        for c in cash:
            p = c.purpose.strip() if c.purpose else "Combined Offering"
            if p not in purposes_dict:
                purposes_dict[p] = {"name": p, "mpesa": Decimal("0"), "bank_transfer": Decimal("0"), "cheque": Decimal("0"), "cash": Decimal("0"), "total": Decimal("0")}
            pm = (c.payment_method or "cash").lower().strip()
            if pm in ["mpesa", "bank_transfer", "cheque", "cash"]:
                purposes_dict[p][pm] += c.amount
            elif "card" in pm or "paybill" in pm or "airtel" in pm:
                purposes_dict[p]["mpesa"] += c.amount
            elif "bank" in pm or "deposit" in pm or "transfer" in pm:
                purposes_dict[p]["bank_transfer"] += c.amount
            else:
                purposes_dict[p]["cash"] += c.amount

        purpose_rows = []
        for p, row in sorted(purposes_dict.items()):
            row_tot = row["mpesa"] + row["bank_transfer"] + row["cheque"] + row["cash"]
            row["total"] = row_tot
            purpose_rows.append(row)

        tot_mpesa = sum((r["mpesa"] for r in purpose_rows), Decimal("0"))
        tot_bank_transfer = sum((r["bank_transfer"] for r in purpose_rows), Decimal("0"))
        tot_cheque = sum((r["cheque"] for r in purpose_rows), Decimal("0"))
        tot_cash = sum((r["cash"] for r in purpose_rows), Decimal("0"))
        tot_grand = tot_mpesa + tot_bank_transfer + tot_cheque + tot_cash

        column_totals = {
            "mpesa": tot_mpesa,
            "bank_transfer": tot_bank_transfer,
            "cheque": tot_cheque,
            "cash": tot_cash,
            "total": tot_grand,
        }

        individual_rows = []
        if is_individual:
            for d in digital.order_by("-created_at"):
                m_name = giver_display_name(d.donor_name, member=d.member, email=d.donor_email, phone=d.phone_number) or "Anonymous"
                individual_rows.append({
                    "member_name": m_name,
                    "date": d.created_at.strftime("%Y-%m-%d"),
                    "purpose_name": d.purpose or "Combined Offering",
                    "contribution_type": "individual",
                    "payment_method": d.payment_method or "mpesa",
                    "receipt_number": d.mpesa_receipt_number or d.paystack_reference or "—",
                    "amount": d.amount,
                    "item_name": d.item_description,
                })
            for c in cash.order_by("-received_on"):
                m_name = giver_display_name(c.donor_name, email=c.giver_email, phone=c.giver_phone) or "Anonymous"
                individual_rows.append({
                    "member_name": m_name,
                    "date": c.received_on.strftime("%Y-%m-%d"),
                    "purpose_name": c.purpose or "Combined Offering",
                    "contribution_type": c.entry_type or "individual",
                    "payment_method": c.payment_method or "cash",
                    "receipt_number": c.receipt_number or "—",
                    "amount": c.amount,
                    "item_name": c.item_description,
                })

        church_setting = ChurchSettings.objects.first()
        church_name = church_setting.church_name if church_setting else CHURCH_DEFAULT_NAME
        district = church_setting.district if church_setting else ""
        field_name = church_setting.field if church_setting else "North East Kenya Field"

        # Gather weekly breakdown for NEKF format
        saturdays, weekly_data, overall_purpose_map = _gather_weekly_contributions(start_date, end_date)

        pdf_bytes = generate_reconciliation_pdf(
            church_name=church_name,
            start_date=start_date.strftime("%Y-%m-%d"),
            end_date=end_date.strftime("%Y-%m-%d"),
            purpose_rows=purpose_rows,
            totals=column_totals,
            is_individual=is_individual,
            individual_rows=individual_rows,
            saturdays=saturdays,
            weekly_data=weekly_data,
            district=district,
            field_name=field_name,
            purpose_title=purpose_param,
        )

        filename = f"Individual_Givings_{purpose_param}_{start_date.strftime('%Y%m%d')}.pdf" if purpose_param else f"Financial_Reconciliation_{start_date.strftime('%Y%m%d')}.pdf"
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'inline; filename="{filename}"'
        return response


class MemberGivingStatementPdfView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from_param = request.query_params.get("start_date")
        to_param = request.query_params.get("end_date")
        
        today = timezone.localdate()
        try:
            start_date = datetime.strptime(from_param, "%Y-%m-%d").date() if from_param else today.replace(day=1)
        except ValueError:
            start_date = today.replace(day=1)
        try:
            end_date = datetime.strptime(to_param, "%Y-%m-%d").date() if to_param else today
        except ValueError:
            end_date = today

        member = request.user
        member_id_param = request.query_params.get("member_id")
        if member_id_param and (request.user.is_staff or getattr(request.user, "member_profile", None) and request.user.member_profile.has_role("admin", "treasurer", "elder")):
            user_found = User.objects.filter(id=member_id_param).first()
            if user_found:
                member = user_found

        # Status values are lowercase in the model; comparing 'COMPLETED'
        # matched nothing and silently emptied the digital side of statements.
        digital = Contribution.objects.filter(Q(member=member) | Q(donor_email=member.email), status="completed", created_at__date__gte=start_date, created_at__date__lte=end_date)
        cash = CashContribution.objects.filter(Q(giver_email=member.email) | Q(donor_name__icontains=member.first_name) if member.first_name else Q(giver_email=member.email), received_on__range=(start_date, end_date))

        givings = []
        purpose_totals = {}
        grand_total = Decimal("0")

        for d in digital.order_by("-created_at"):
            p_name = d.purpose or "Combined Offering"
            amt = d.amount or Decimal("0")
            grand_total += amt
            purpose_totals[p_name] = purpose_totals.get(p_name, Decimal("0")) + amt
            givings.append({
                "date": d.created_at.strftime("%Y-%m-%d"),
                "receipt_number": d.mpesa_receipt_number or d.paystack_reference or "—",
                "payment_method": d.payment_method or "mpesa",
                "purpose_name": p_name,
                "amount": amt,
                "item_name": d.item_description,
            })

        for c in cash.order_by("-received_on"):
            p_name = c.purpose or "Combined Offering"
            amt = c.amount or Decimal("0")
            grand_total += amt
            purpose_totals[p_name] = purpose_totals.get(p_name, Decimal("0")) + amt
            givings.append({
                "date": c.received_on.strftime("%Y-%m-%d"),
                "receipt_number": c.receipt_number or "—",
                "payment_method": c.payment_method or "cash",
                "purpose_name": p_name,
                "amount": amt,
                "item_name": c.item_description,
            })

        givings.sort(key=lambda x: x["date"], reverse=True)

        church_setting = ChurchSettings.objects.first()
        church_name = church_setting.church_name if church_setting else CHURCH_DEFAULT_NAME
        member_name = f"{member.first_name} {member.last_name}".strip() or member.username

        pdf_bytes = generate_member_giving_statement_pdf(
            church_name=church_name,
            member_name=member_name,
            member_email=member.email,
            start_date=start_date.strftime("%Y-%m-%d"),
            end_date=end_date.strftime("%Y-%m-%d"),
            givings=givings,
            purpose_totals=purpose_totals,
            grand_total=grand_total,
        )

        filename = f"Member_Giving_Statement_{start_date.strftime('%Y%m%d')}_{end_date.strftime('%Y%m%d')}.pdf"
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'inline; filename="{filename}"'
        return response


class BusinessMeetingPdfView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, pk):
        try:
            meeting = BusinessMeeting.objects.get(pk=pk)
        except BusinessMeeting.DoesNotExist:
            return Response({"error": "Business meeting not found."}, status=status.HTTP_404_NOT_FOUND)

        agendas = []
        for ag in meeting.agendas.all().order_by("order", "id"):
            agendas.append({
                "order": ag.order,
                "title": ag.title,
                "description": ag.description,
                "document_name": ag.document_name or (ag.document.name.split("/")[-1] if ag.document else None),
            })

        church_setting = ChurchSettings.objects.first()
        church_name = church_setting.church_name if church_setting else CHURCH_DEFAULT_NAME

        pdf_bytes = generate_business_meeting_pdf(
            church_name=church_name,
            meeting_title=meeting.title,
            meeting_date=meeting.meeting_date.strftime("%Y-%m-%d") if hasattr(meeting.meeting_date, "strftime") else str(meeting.meeting_date),
            location=meeting.location,
            status=meeting.status,
            minutes=meeting.minutes,
            agendas=agendas,
        )

        filename = f"Business_Meeting_{pk}_Agendas_Minutes.pdf"
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'inline; filename="{filename}"'
        return response


def _get_saturdays_in_month(ref_date):
    """Return all Saturday dates in the month of ref_date."""
    import calendar
    year, month = ref_date.year, ref_date.month
    _, days_in_month = calendar.monthrange(year, month)
    saturdays = []
    for day in range(1, days_in_month + 1):
        d = date(year, month, day)
        if d.weekday() == 5:  # Saturday = 5
            saturdays.append(d)
    return saturdays


def _gather_weekly_contributions(start_date, end_date):
    """
    Returns (saturdays, weekly_data, overall_purpose_map) where:
    - saturdays: list of Saturday dates in the month
    - weekly_data: {saturday_date: {purpose: {mpesa, bank_transfer, cheque, cash}}}
    - overall_purpose_map: {purpose: {mpesa, bank_transfer, cheque, cash, total}}
    """
    saturdays = _get_saturdays_in_month(start_date)
    if not saturdays:
        saturdays = [start_date]

    # Determine the month boundaries
    month_start = saturdays[0] if saturdays[0].day <= 7 else date(start_date.year, start_date.month, 1)
    last_sat = saturdays[-1]
    # Week ends the Friday after the last Saturday
    month_end = last_sat + timedelta(days=6)
    # But cap at end_date if user specified a range
    if end_date < month_end:
        month_end = end_date

    # Query all contributions in range
    digital_filter = Q(status='completed', giving_type='financial') & (
        Q(paid_at__date__gte=month_start, paid_at__date__lte=month_end) |
        Q(paid_at__isnull=True, created_at__date__gte=month_start, created_at__date__lte=month_end)
    )
    digital = list(Contribution.objects.filter(digital_filter))
    cash_list = list(CashContribution.objects.filter(received_on__range=(month_start, month_end)))

    def _assign_week(dt):
        """Given a datetime/date, find which Saturday it falls under (Sat-Fri week)."""
        if isinstance(dt, datetime):
            d = dt.date()
        else:
            d = dt
        # Find the Saturday on or before this date
        days_since_sat = (d.weekday() - 5) % 7
        sat = d - timedelta(days=days_since_sat)
        # If sat is before our first Saturday, clamp to first Saturday
        if sat < saturdays[0]:
            return saturdays[0]
        # If sat is after our last Saturday, clamp to last Saturday
        if sat > saturdays[-1]:
            return saturdays[-1]
        return sat

    # Initialize weekly_data for each Saturday
    weekly_data = {}
    for sat in saturdays:
        weekly_data[sat] = {}

    purpose_map = {}  # overall totals per purpose

    def _add_to_week(week_sat, purpose, payment_type, amount):
        if week_sat not in weekly_data:
            return
        if purpose not in weekly_data[week_sat]:
            weekly_data[week_sat][purpose] = {'mpesa': 0, 'bank_transfer': 0, 'cheque': 0, 'cash': 0}
        weekly_data[week_sat][purpose][payment_type] += float(amount)
        if purpose not in purpose_map:
            purpose_map[purpose] = {'mpesa': 0, 'bank_transfer': 0, 'cheque': 0, 'cash': 0, 'total': 0}
        purpose_map[purpose][payment_type] += float(amount)
        purpose_map[purpose]['total'] += float(amount)

    for c in digital:
        p = c.purpose.strip() if c.purpose else 'Combined Offering'
        dt = c.paid_at or c.created_at
        week_sat = _assign_week(dt)
        pm = (c.payment_method or 'mpesa').lower().strip()
        if 'bank_transfer' in pm or 'deposit' in pm:
            pt = 'bank_transfer'
        elif 'cheque' in pm or 'check' in pm:
            pt = 'cheque'
        elif 'cash' == pm:
            pt = 'cash'
        elif 'airtel' in pm or 'card' in pm or 'stripe' in pm or 'paystack' in pm:
            # Legacy mobile-money/card methods roll up into M-Pesa
            pt = 'mpesa'
        else:
            pt = 'mpesa'
        _add_to_week(week_sat, p, pt, c.amount)

    for c in cash_list:
        p = c.purpose.strip() if c.purpose else 'Combined Offering'
        week_sat = _assign_week(c.received_on)
        pm = (c.payment_method or 'cash').lower().strip()
        if pm in ['mpesa', 'bank_transfer', 'cheque', 'cash']:
            pt = pm
        elif 'card' in pm or 'paybill' in pm or 'airtel' in pm:
            pt = 'mpesa'
        else:
            pt = 'cash'
        _add_to_week(week_sat, p, pt, c.amount)

    return saturdays, weekly_data, purpose_map


class ReconciliationSpreadsheetView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from openpyxl import load_workbook

        from_param = request.query_params.get('start_date') or request.query_params.get('date')
        to_param = request.query_params.get('end_date') or request.query_params.get('date')

        today = timezone.localdate()
        try:
            start_date = datetime.strptime(from_param, '%Y-%m-%d').date() if from_param else today
        except ValueError:
            start_date = today
        try:
            end_date = datetime.strptime(to_param, '%Y-%m-%d').date() if to_param else today
        except ValueError:
            end_date = today

        # Always gather contributions using the full calendar month so the
        # Saturday grid is complete regardless of the query date range.
        saturdays, weekly_data, purpose_map = _gather_weekly_contributions(start_date, end_date)

        # Load the NEKF template
        template_path = os.path.join(settings.BASE_DIR, 'members', 'templates', 'nekf_template.xlsx')
        wb = load_workbook(template_path)
        ws = wb.active

        church_setting = ChurchSettings.objects.first()
        church_name = church_setting.church_name if church_setting else 'SDA Church'
        district     = church_setting.district    if church_setting else ''
        field_name   = church_setting.field       if church_setting else 'North East Kenya Field'

        # ── Header rows ───────────────────────────────────────────────────────────
        ws['A1'] = 'SEVENTH DAY ADVENTIST CHURCH'
        ws['A2'] = field_name                          # e.g. "North East Kenya Field"
        ws['A3'] = f'CASH COUNT AND OFFERING REPORT SUMMARY ({start_date.strftime("%B %Y").upper()})'
        ws['A5'] = f'Name of Church: {church_name}'
        if district:
            ws['E5'] = f'District: {district}'

        # ── Week header dates (row 8, cols B–F = Weeks 1–5) ──────────────────────
        # Always overwrite ALL 5 columns so no old template date bleeds through.
        week_cols = ['B', 'C', 'D', 'E', 'F']
        for i, col in enumerate(week_cols):
            if i < len(saturdays):
                ws[f'{col}8'] = saturdays[i].strftime('%d.%m.%Y')
            else:
                ws[f'{col}8'] = 'NA'

        # ── Weekly Cash Counts Summary (rows 9–12) ────────────────────────────────
        # Row  9: Cash        — physical cash only
        # Row 10: Cheque      — not tracked (0)
        # Row 11: Church Paybill a/c — all digital (M-Pesa + Airtel + Card)
        # Row 12: Bank Deposit — not tracked (0)
        for i, col in enumerate(week_cols):
            if i >= len(saturdays):
                ws[f'{col}9']  = 0
                ws[f'{col}10'] = 0
                ws[f'{col}11'] = 0
                ws[f'{col}12'] = 0
                continue

            sat = saturdays[i]
            week_purposes = weekly_data.get(sat, {})
            week_cash    = sum(v.get('cash',  0) for v in week_purposes.values())
            week_digital = sum(
                v.get('mpesa', 0) + v.get('airtel', 0) + v.get('card', 0)
                for v in week_purposes.values()
            )
            ws[f'{col}9']  = week_cash
            ws[f'{col}10'] = 0
            ws[f'{col}11'] = week_digital
            ws[f'{col}12'] = 0

        # ── Offering Summary ──────────────────────────────────────────────────────
        # Purposes that map 50/50 to Trust row 23 AND Local row 31
        COMBINED_PURPOSES = {'combined offering', 'combined (50%)', 'combined (50%'}

        # Trust Fund rows 22–27 (one or more system purpose names per row)
        trust_purpose_map = {
            22: ['tithe'],
            # 23 handled separately (50% split)
            24: ['camp goal', 'camp offering'],
            25: ['msamaria mwema', 'evangelism', 'evangelism - field', 'good samaritan'],
            26: ['development', 'station dev. funds', 'station development'],
            27: ['13th sabbath', 'thirteenth'],
        }

        # Local Church Offering rows 31–35
        local_purpose_map = {
            # 31 handled separately (50% split)
            32: ['building/development', 'building', 'building development'],
            33: ['camp expenses'],
            34: ['local church budget', 'lcb'],
            # 35 (Others) computed as residual below
        }

        # Set of all lowercased purpose names that are "claimed" by a specific row
        claimed_lower = set()
        for names in trust_purpose_map.values():
            claimed_lower.update(names)
        claimed_lower.update(COMBINED_PURPOSES)
        for names in local_purpose_map.values():
            claimed_lower.update(names)

        # Helper: sum totals for a set of purpose names in a week's data dict
        def _week_sum(week_purposes, purpose_names):
            total = 0.0
            for k, v in week_purposes.items():
                if k.lower() in purpose_names:
                    total += v.get('total', 0)
            return total

        # Fill static purpose→row mappings (write 0 instead of None when empty)
        for row_num, purpose_names in {**trust_purpose_map, **local_purpose_map}.items():
            if not purpose_names:
                for col in week_cols:
                    ws[f'{col}{row_num}'] = 0
                continue
            for i, col in enumerate(week_cols):
                if i >= len(saturdays):
                    ws[f'{col}{row_num}'] = 0
                    continue
                amt = _week_sum(weekly_data.get(saturdays[i], {}), set(purpose_names))
                ws[f'{col}{row_num}'] = amt

        # Row 23 (Trust Combined 50%) and Row 31 (Local Combined 50%) — split evenly
        for i, col in enumerate(week_cols):
            if i >= len(saturdays):
                ws[f'{col}23'] = 0
                ws[f'{col}31'] = 0
                continue
            combined_total = _week_sum(weekly_data.get(saturdays[i], {}), COMBINED_PURPOSES)
            half = round(combined_total / 2, 2)
            ws[f'{col}23'] = half
            ws[f'{col}31'] = half

        # Row 35 (Others) — residual: anything not claimed by a specific row
        for i, col in enumerate(week_cols):
            if i >= len(saturdays):
                ws[f'{col}35'] = 0
                continue
            week_purposes = weekly_data.get(saturdays[i], {})
            others = sum(
                v.get('total', 0)
                for k, v in week_purposes.items()
                if k.lower() not in claimed_lower
            )
            ws[f'{col}35'] = others

        # Deposit slips rows 41 & 42
        ws['C41'] = 0
        ws['C42'] = 0

        # ── Signature / presentation dates ────────────────────────────────────────
        report_date_str = end_date.strftime('%d.%m.%Y')
        ws['G45'] = report_date_str
        ws['G48'] = report_date_str

        buffer = io.BytesIO()
        wb.save(buffer)
        buffer.seek(0)

        filename = f'NEKF_Report_{start_date.strftime("%Y%m")}.xlsx'
        response = HttpResponse(
            buffer.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response


class TreasuryAccountListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        accounts = TreasuryAccount.objects.all()
        serializer = TreasuryAccountSerializer(accounts, many=True)
        return Response(serializer.data)

    def post(self, request):
        if not (request.user.is_staff or getattr(request.user, "member_profile", None) and request.user.member_profile.has_role("admin", "treasurer")):
            return Response({"detail": "Only finance team can create treasury accounts."}, status=status.HTTP_403_FORBIDDEN)
        serializer = TreasuryAccountSerializer(data=request.data)
        if serializer.is_valid():
            account = serializer.save()
            if account.balance > 0:
                TreasuryAccountTransaction.objects.create(
                    account=account,
                    transaction_type='credit',
                    amount=account.balance,
                    description='Initial account balance setup',
                    reference='INIT',
                    created_by=request.user
                )
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class TreasuryAccountDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            account = TreasuryAccount.objects.get(pk=pk)
        except TreasuryAccount.DoesNotExist:
            return Response({"detail": "Treasury account not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = TreasuryAccountSerializer(account)
        return Response(serializer.data)

    def put(self, request, pk):
        if not (request.user.is_staff or getattr(request.user, "member_profile", None) and request.user.member_profile.has_role("admin", "treasurer")):
            return Response({"detail": "Only finance team can update treasury accounts."}, status=status.HTTP_403_FORBIDDEN)
        try:
            account = TreasuryAccount.objects.get(pk=pk)
        except TreasuryAccount.DoesNotExist:
            return Response({"detail": "Treasury account not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = TreasuryAccountSerializer(account, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        if not (request.user.is_staff or getattr(request.user, "member_profile", None) and request.user.member_profile.has_role("admin", "treasurer")):
            return Response({"detail": "Only admin or treasurer can delete treasury accounts."}, status=status.HTTP_403_FORBIDDEN)
        try:
            account = TreasuryAccount.objects.get(pk=pk)
        except TreasuryAccount.DoesNotExist:
            return Response({"detail": "Treasury account not found."}, status=status.HTTP_404_NOT_FOUND)
        account.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class TreasuryAccountCreditView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not (request.user.is_staff or getattr(request.user, "member_profile", None) and request.user.member_profile.has_role("admin", "treasurer")):
            return Response({"detail": "Only finance team can credit accounts."}, status=status.HTTP_403_FORBIDDEN)
        try:
            account = TreasuryAccount.objects.get(pk=pk)
        except TreasuryAccount.DoesNotExist:
            return Response({"detail": "Treasury account not found."}, status=status.HTTP_404_NOT_FOUND)

        amount_str = request.data.get("amount")
        description = request.data.get("description", "Manual Credit / Deposit")
        reference = request.data.get("reference", "")

        try:
            amount = Decimal(str(amount_str))
            if amount <= 0:
                raise ValueError()
        except (ValueError, TypeError):
            return Response({"detail": "Valid positive amount is required."}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            account.balance += amount
            account.save()
            tx = TreasuryAccountTransaction.objects.create(
                account=account,
                transaction_type='credit',
                amount=amount,
                description=description,
                reference=reference,
                created_by=request.user
            )

        return Response({
            "detail": f"Successfully credited KES {amount:,.2f} to {account.name}.",
            "account": TreasuryAccountSerializer(account).data,
            "transaction": TreasuryAccountTransactionSerializer(tx).data
        })


class TreasuryAccountDebitView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not (request.user.is_staff or getattr(request.user, "member_profile", None) and request.user.member_profile.has_role("admin", "treasurer")):
            return Response({"detail": "Only finance team can debit accounts."}, status=status.HTTP_403_FORBIDDEN)
        try:
            account = TreasuryAccount.objects.get(pk=pk)
        except TreasuryAccount.DoesNotExist:
            return Response({"detail": "Treasury account not found."}, status=status.HTTP_404_NOT_FOUND)

        amount_str = request.data.get("amount")
        description = request.data.get("description", "Manual Debit / Outflow")
        reference = request.data.get("reference", "")

        try:
            amount = Decimal(str(amount_str))
            if amount <= 0:
                raise ValueError()
        except (ValueError, TypeError):
            return Response({"detail": "Valid positive amount is required."}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            account.balance -= amount
            account.save()
            tx = TreasuryAccountTransaction.objects.create(
                account=account,
                transaction_type='debit',
                amount=amount,
                description=description,
                reference=reference,
                created_by=request.user
            )

        return Response({
            "detail": f"Successfully debited KES {amount:,.2f} from {account.name}.",
            "account": TreasuryAccountSerializer(account).data,
            "transaction": TreasuryAccountTransactionSerializer(tx).data
        })


class TreasuryAccountTransferView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not (request.user.is_staff or getattr(request.user, "member_profile", None) and request.user.member_profile.has_role("admin", "treasurer")):
            return Response({"detail": "Only finance team can transfer funds between accounts."}, status=status.HTTP_403_FORBIDDEN)

        source_id = request.data.get("source_account_id")
        target_id = request.data.get("target_account_id")
        amount_str = request.data.get("amount")
        description = request.data.get("description", "Internal Account Transfer")
        reference = request.data.get("reference", "")

        if str(source_id) == str(target_id):
            return Response({"detail": "Source and target accounts must be different."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            source_acc = TreasuryAccount.objects.get(pk=source_id)
            target_acc = TreasuryAccount.objects.get(pk=target_id)
        except TreasuryAccount.DoesNotExist:
            return Response({"detail": "Invalid source or target account."}, status=status.HTTP_404_NOT_FOUND)

        try:
            amount = Decimal(str(amount_str))
            if amount <= 0:
                raise ValueError()
        except (ValueError, TypeError):
            return Response({"detail": "Valid positive amount is required."}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            source_acc.balance -= amount
            source_acc.save()
            target_acc.balance += amount
            target_acc.save()

            tx_out = TreasuryAccountTransaction.objects.create(
                account=source_acc,
                transaction_type='transfer_out',
                amount=amount,
                description=f"Transfer to {target_acc.name}: {description}",
                reference=reference,
                related_account=target_acc,
                created_by=request.user
            )

            tx_in = TreasuryAccountTransaction.objects.create(
                account=target_acc,
                transaction_type='transfer_in',
                amount=amount,
                description=f"Transfer from {source_acc.name}: {description}",
                reference=reference,
                related_account=source_acc,
                created_by=request.user
            )

        return Response({
            "detail": f"Successfully transferred KES {amount:,.2f} from {source_acc.name} to {target_acc.name}.",
            "source_account": TreasuryAccountSerializer(source_acc).data,
            "target_account": TreasuryAccountSerializer(target_acc).data
        })


class TreasuryAccountTransactionListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        account_id = request.query_params.get("account_id")
        qs = TreasuryAccountTransaction.objects.all()
        if account_id:
            qs = qs.filter(account_id=account_id)
        serializer = TreasuryAccountTransactionSerializer(qs[:150], many=True)
        return Response(serializer.data)


class ExpenditureListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        expenditures = Expenditure.objects.all()
        category = request.query_params.get("category")
        account_id = request.query_params.get("account_id")
        if category:
            expenditures = expenditures.filter(category=category)
        if account_id:
            expenditures = expenditures.filter(account_id=account_id)
        serializer = ExpenditureSerializer(expenditures, many=True)
        return Response(serializer.data)

    def post(self, request):
        if not (request.user.is_staff or getattr(request.user, "member_profile", None) and request.user.member_profile.has_role("admin", "treasurer")):
            return Response({"detail": "Only finance team can record expenditures."}, status=status.HTTP_403_FORBIDDEN)

        serializer = ExpenditureSerializer(data=request.data)
        if serializer.is_valid():
            with transaction.atomic():
                exp = serializer.save(recorded_by=request.user)
                if exp.account:
                    exp.account.balance -= exp.amount
                    exp.account.save()
                    TreasuryAccountTransaction.objects.create(
                        account=exp.account,
                        transaction_type='debit',
                        amount=exp.amount,
                        description=f"Expenditure: {exp.title} ({exp.get_category_display()})",
                        reference=exp.receipt_number or f"EXP-{exp.id}",
                        created_by=request.user
                    )
            return Response(ExpenditureSerializer(exp).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ExpenditureDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            exp = Expenditure.objects.get(pk=pk)
        except Expenditure.DoesNotExist:
            return Response({"detail": "Expenditure record not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = ExpenditureSerializer(exp)
        return Response(serializer.data)

    def put(self, request, pk):
        if not (request.user.is_staff or getattr(request.user, "member_profile", None) and request.user.member_profile.has_role("admin", "treasurer")):
            return Response({"detail": "Only finance team can update expenditure records."}, status=status.HTTP_403_FORBIDDEN)
        try:
            exp = Expenditure.objects.get(pk=pk)
        except Expenditure.DoesNotExist:
            return Response({"detail": "Expenditure record not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = ExpenditureSerializer(exp, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        if not (request.user.is_staff or getattr(request.user, "member_profile", None) and request.user.member_profile.has_role("admin", "treasurer")):
            return Response({"detail": "Only admin or treasurer can delete expenditure records."}, status=status.HTTP_403_FORBIDDEN)
        try:
            exp = Expenditure.objects.get(pk=pk)
        except Expenditure.DoesNotExist:
            return Response({"detail": "Expenditure record not found."}, status=status.HTTP_404_NOT_FOUND)
        exp.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


def can_manage_deaconate(user):
    """Who keeps the deaconate property register: admin, clerks and elders.

    The deaconate desk has no role code of its own (``deacon`` is not in
    ``roles.ROLE_DEFINITIONS``), so its register is kept by the same officers
    who run the rest of the church office, plus staff accounts.
    """
    if not user or not user.is_authenticated:
        return False
    if user.is_staff or user.is_superuser:
        return True
    profile = getattr(user, 'member_profile', None)
    return bool(profile and profile.has_role('admin', 'clerk', 'elder'))


class InventoryItemListCreateView(APIView):
    """The deaconate property register: list the items, register a new one."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not can_manage_deaconate(request.user):
            return Response(
                {'detail': 'Only church officers can view the property inventory.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        items = InventoryItem.objects.annotate(movement_count=Count('movements'))
        return Response(InventoryItemSerializer(items, many=True).data)

    def post(self, request):
        if not can_manage_deaconate(request.user):
            return Response(
                {'detail': 'Only church officers can register church property.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = InventoryItemSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        item = serializer.save(registered_by=request.user)
        return Response(InventoryItemSerializer(item).data, status=status.HTTP_201_CREATED)


class InventoryMovementCreateView(APIView):
    """Log a movement or condition change and bring its item in line with it."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not can_manage_deaconate(request.user):
            return Response(
                {'detail': 'Only church officers can record property movements.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        try:
            item = InventoryItem.objects.annotate(movement_count=Count('movements')).get(pk=pk)
        except InventoryItem.DoesNotExist:
            return Response({'detail': 'Property item not found.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = InventoryMovementSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            movement = serializer.save(item=item, recorded_by=request.user)
            item.apply_movement(movement)

        # Re-read through the annotated queryset so the row we hand back counts
        # the movement just recorded instead of the count from before it.
        item = InventoryItem.objects.annotate(movement_count=Count('movements')).get(pk=item.pk)
        payload = InventoryItemSerializer(item).data
        payload['movement'] = InventoryMovementSerializer(movement).data
        return Response(payload, status=status.HTTP_201_CREATED)
