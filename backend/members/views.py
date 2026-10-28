import base64
import csv
from io import StringIO

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, User
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.files.base import ContentFile
from django.core.mail import EmailMessage, send_mail
from django.core.validators import validate_email
from django.http import HttpResponse, HttpResponseRedirect, Http404
from django.db import connection, transaction
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
from functools import wraps
import os
import io
import secrets
import sys
import threading
import time
from decimal import Decimal, InvalidOperation
from html.parser import HTMLParser
from urllib.parse import parse_qs, urljoin
import requests
from PIL import Image, ImageOps, UnidentifiedImageError

logger = logging.getLogger(__name__)

from rest_framework import generics
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework import permissions
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from config.authentication import sign_in_payload
from .models import Announcement, AnnouncementResponse, PrayerCell, PrayerCellJoinRequest, PrayerCellMember, BoardMeeting, BoardMeetingAgenda, BusinessMeeting, BusinessMeetingAgenda, CampaignCardAssignment, CampaignPledge, CashContribution, SingingGroup, SingingGroupMember, ChildDedicationRequest, ChurchBudget, ChurchCorrespondence, ChurchEvent, ChurchEventMedia, ChurchFinancialReport, ChurchNotification, ChurchSettings, Contribution, ContributionTreasury, DepartmentWithdrawalRequest, EmailChangeRequest, EnrollmentRequest, DutyRota, Expenditure, ExternalResourceLink, format_invitation_code, Friend, FundraisingCampaign, giver_display_name, GivingChangeRequest, InKindContribution, InventoryItem, InventoryMovement, Invitation, MemberProfile, RoleHistory, CURRENT_PRIVACY_POLICY_VERSION, CURRENT_TERMS_OF_USE_VERSION, MpesaRefund, MembershipRemovalRequest, MembershipTransferRequest, PendingTestimony, PrayerRequest, ProfileChangeRequest, Profession, SabbathEvent, SupportSubmission, Testimony, TreasuryAccount, TreasuryAccountTransaction, VisitationRequest, ChildrenGroup, ChildRecord, Pathfinder
from .models import DEFAULT_DEPARTMENT_ROLES, DEPARTMENT_ROLE_SEED, BaptismalClassEntry, DailyWord, DeaconateRequest, Department, DepartmentAssignment, DepartmentBudget, DepartmentEvent, DepartmentJoinRequest, DepartmentLetterRequest, DepartmentMessage, DepartmentMembership, DepartmentRole, GivingRequest, GIFT_RELATIONSHIP_CHOICES, LessonRequest, WeeklyMeeting
from .mpesa import MpesaConfigurationError, initiate_b2c_refund, initiate_stk_push_for_context, normalize_mpesa_phone, normalize_pull_rows, pull_paybill_transactions, register_pull_url, safe_mpesa_phone

from chat.realtime import broadcast_announcement_response
from .validators import validate_phone_number
from .mpesa_tokens import allocation_lines, pack_callback_context, unpack_callback_context
from django.core.management import call_command
from .password_policy import MIN_LENGTH as PASSWORD_MIN_LENGTH, password_problems, validate_church_password
# Which address each kind of letter leaves as: a receipt answers from the
# treasury's address, a verification code from the church's identity one, a
# leadership letter from the appointments one, and info@ stays the mailbox a
# person writes to (see members/mailing.py).
from .mailing import APPOINTMENT, IDENTITY, MONEY, connection_for, sender_for
from .pledges import (
    redeem_campaign_pledges_matched_by_giving,
    redeem_due_pledges,
    redeem_pledges_matched_by_giving,
    reopen_pledge,
    REDEEMED_BY_GIVING,
    REDEEMED_BY_MEMBER,
    REDEEMED_BY_OFFICE,
)
from .paystack import PaystackConfigurationError, initialize_checkout, parse_webhook, verify_webhook_signature
# The text-message gateway. It owns number formatting and the provider's
# payload, so no call site has to know what Ping Africa expects.
from . import sms
from .requests import notify_request_safely, send_membership_approval_email
# Who signs the church's paper: the two office holders whose saved signatures
# the receipts and reports print (see members/signatures.py).
from .signatures import office_for, receipt_signatures, report_signatures
from .treasury import account_for_purpose, apply_credit, canonical_purpose_name, credit_account, credit_contribution_lines, display_purpose, enrich_transaction_descriptions
from .throttling import PublicTokenThrottle
from .roles import (
    DEFAULT_ROLE,
    ROLE_CODES,
    ROLE_GROUP_MAP,
    assignment_error,
    check_system_role_change,
    normalize_roles,
    parse_role_codes,
    role_label,
    role_labels,
    role_register,
    sync_role_groups,
    unknown_role_codes,
)
from .meetings import (
    BOARD_KIND,
    BUSINESS_KIND,
    DEFAULT_APPOINTMENT_MESSAGE,
    DEFAULT_RELEASE_MESSAGE,
    as_bool,
    board_audience,
    broadcast_invitation,
    create_agendas,
    eat_greeting,
    parse_clock,
    recipient_name,
    render_message,
)
from .serializers import AnnouncementSerializer, AnnouncementResponseSerializer, BoardMeetingSerializer, BoardMeetingAgendaSerializer, BusinessMeetingSerializer, BusinessMeetingAgendaSerializer, CampaignCardAssignmentSerializer, CashContributionSerializer, ChildDedicationRequestSerializer, ChurchBudgetSerializer, ChurchCorrespondenceSerializer, ChurchEventSerializer, ChurchFinancialReportSerializer, ChurchNotificationSerializer, ChurchSettingsSerializer, ContributionInitiateSerializer, MemberEmailSerializer, ContributionTreasurySerializer, ContributionSerializer, DepartmentLetterRequestSerializer, EnrollmentAdminSerializer, EnrollmentCompleteSerializer, EnrollmentRequestSerializer, DutyRotaSerializer, ExpenditureSerializer, FundraisingCampaignSerializer, InKindContributionSerializer, InventoryItemSerializer, InventoryMovementSerializer, InvitationAcceptSerializer, InvitationSerializer, MembershipRemovalRequestSerializer, MembershipTransferRequestSerializer, MpesaRefundSerializer, PrayerRequestSerializer, ProfileChangeRequestSerializer, ProfessionSerializer, RegisterSerializer, SabbathEventSerializer, SupportSubmissionSerializer, TestimonySerializer, TreasuryAccountSerializer, TreasuryAccountTransactionSerializer, UserDetailSerializer, VisitationRequestSerializer, WeeklyMeetingSerializer, ChildrenGroupSerializer, ChildRecordSerializer, PathfinderSerializer, usable_email, receipt_email_for, IMAGE_SUFFIX_PATTERN


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


def render_receipt_message(template, donor_name, amount_display, purpose, extra=None):
    """Fill the configurable receipt message's placeholders.

    The template lives in Church Settings and is the message itself: it should
    carry its own greeting (the shipped default starts "Dear {name}"). It may
    use {name}, {amount} and {purpose} — or {account}, the app's user-facing
    word for a giving purpose. Both spellings are filled; anything left
    brace-wrapped (a typo, a future placeholder) is stripped rather than
    shipped raw. ``extra`` lets a caller add placeholders of its own (the
    split receipt fills {distribution} with the account lines).
    """
    message = template or ''
    replacements = {
        'name': donor_name,
        'amount': amount_display,
        'account': purpose,
        'purpose': purpose,
        **(extra or {}),
    }
    for key, value in replacements.items():
        message = message.replace(f'{{{key}}}', value).replace(f'{{{key})', value)
    return re.sub(r'\{[a-z_]+[})]', '', message).strip()


def receipt_email_signature():
    return "Warm regards,\nTreasury,\nSDA Church Loma Linda"


def receipt_summary(*, account, amount, payment_channel, receipt_ref, date_display):
    return (
        "Receipt Summary:\n"
        f"Account: {account}\n"
        f"Amount: {amount}\n"
        f"Payment Channel: {payment_channel}\n"
        f"Receipt No: {receipt_ref}\n"
        f"Date: {date_display}"
    )


def contribution_receipt_attachment(contribution):
    """The thermal PDF for a completed digital giving, as an email attachment.

    The same paper the member page downloads — one slip per payment, a split
    gift itemised with its total — built here from the rows that share the
    payment. Returns ``None`` where no paper can be cut (an in-kind record, a
    row still under review): a letter without its receipt is still a letter,
    and must never be held back by the printer.
    """
    try:
        if contribution.giving_type != 'financial' or not contribution.currency:
            return None
        if contribution.payment_group:
            lines = list(
                Contribution.objects.filter(
                    payment_group=contribution.payment_group, status='completed',
                ).order_by('id')
            )
        else:
            lines = [contribution]
        lines = [row for row in lines if row.status == 'completed'] or [contribution]
        donor_name = giver_display_name(
            contribution.donor_name,
            member=contribution.member,
            email=contribution.donor_email,
            phone=contribution.phone_number,
        ) or 'Friend'
        pdf_bytes = generate_contribution_thermal_receipt_pdf(
            church_name=church_name_short(),
            donor_name=donor_name,
            contributions=lines,
            # The office's signature travels with the letter: the same slip
            # the member downloads is the one that arrives already signed.
            signatures=receipt_signatures(),
        )
        reference = contribution.mpesa_receipt_number or contribution.paystack_reference or str(contribution.id)
        return (f'Receipt-{reference}.pdf', pdf_bytes, 'application/pdf')
    except Exception:
        # The receipt letter must never fail to send because the printer did.
        logger.exception('Thermal receipt for contribution %s could not be built.', contribution.pk)
        return None


def send_enrollment_email(enrollment):
    church_name = current_church_name()
    # The sentence reads best with the short name: "join SDA Church Loma Linda" —
    # the town suffix and the account-type clause are dropped here.
    short_name = church_name.split(',')[0].strip()
    send_mail(
        f'Verify your {church_name_plain(church_name)} account',
        f"Hello {enrollment.first_name or 'there'},\n\n"
        f"Thank you for choosing to join {short_name}.\n\n"
        f"Your verification code is:\n\n{enrollment.raw_code}\n\n"
        f"Enter this code on the create-account page to continue setting up your account. "
        f"It is valid for 48 hours.\n\n"
        f"Warm regards,\n{church_name}",
        sender_for(IDENTITY),
        [enrollment.email],
        connection=connection_for(IDENTITY),
        fail_silently=True,
    )


# Church roles, their labels and their Django groups live in members/roles.py.
# ROLE_GROUP_MAP is re-exported above for callers such as create_account.

# How the church is named in every email: subject, body and signature. Church
# Settings wins (so the office can rename the church without a code change);
# this is the fallback used when no ChurchSettings row exists yet.
CHURCH_DEFAULT_NAME = 'SDA Church Loma Linda, Meru'

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


def church_name_short(name=None):
    """The church's name without its town — the receipt letterhead form.

    The thermal receipt reads 'SDA Church Loma Linda' (no 'Meru'); a name the office
    wrote without a comma is returned as is.
    """
    return church_name_plain(name)


def church_name_plain(name=None):
    """Church name where it modifies what follows, or where it sits in a header.

    'your SDA Church Loma Linda, Meru account' reads wrong — the comma there would
    separate the name from the noun it owns — and a bare comma inside a From or
    Subject header is an address-list separator, so the comma is dropped there.
    A name the office wrote without a comma ('SDA Milimani') is returned as is.
    """
    return (name or current_church_name()).replace(',', '')


def church_name_clause(name=None):
    """Church name where it opens a clause and a verb follows it.

    Reads 'SDA Church Loma Linda, Meru, has invited you…' — the apposition opened by
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
    # The code goes first: both account-creation doors are typed-code forms
    # now, so the invitee enters the code at the same place a self-signer
    # enters their verification code, and the two letters read alike.
    code = invitation_code_text(invitation)
    subject = f'You are invited to {church_name_plain(church_name)}'
    body = (
        f"Hello {invitee},\n\n"
        f"{church_name_clause(church_name)} has invited you to create your own account as a {account_label}"
        f"{access_clause}\n\n"
        "Your invitation code is:\n\n"
        f"{code}\n\n"
        f"Go to {settings.FRONTEND_URL}/accept-invite, enter this code, and choose your username and password.\n\n"
        f"This invitation is valid until {timezone.localtime(invitation.expires_at).strftime('%d %B %Y')}.\n"
        "Once your account is ready you can sign in at "
        f"{settings.FRONTEND_URL}/login\n\n"
        f"Warm regards,\n{church_name}"
    )
    send_mail(
        subject, body, sender_for(IDENTITY), [invitation.email],
        connection=connection_for(IDENTITY), fail_silently=False,
    )


#: The area every church member belongs to by default: the Sabbath School
#: is the church's own school, and membership in it needs no roll row — the
#: tie is given with the account (see ``member_tie_codes``) and the roll
#: reads the whole roster (see ``DepartmentMembersView.get``).
SABBATH_SCHOOL_CODE = 'sabbath_school'


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
        sender_for(IDENTITY),
        [user.email],
        connection=connection_for(IDENTITY),
        fail_silently=False,
    )


def wants_both_receipt_channels(member):
    """Whether the member asked for a receipt's SMS to ride beside its email.

    A member's own preference (Preferences → receiving) decides this; the
    office's choices on a desk entry are written on the slip, not asked of
    the member, so cash receipts keep the explicit toggles.
    """
    profile = getattr(member, 'member_profile', None)
    return bool(profile and profile.receipt_delivery == 'both')


def _deliver_receipt_message(*, subject, body, email='', phone='', mark_sent, attachments=None, both=False):
    """Attempt every available receipt channel and report whether one succeeded.

    ``attachments`` ride the email only — SMS cannot carry files — but the
    letter itself is the same on both channels: it no longer names the paper
    in words, so there is nothing to say on one channel and not the other.

    The email goes first, and where ``both`` is not asked for the SMS stands
    behind it: it goes out only when the email did not (a giver with no
    address, or an email that failed), so no member is handed the same
    receipt twice unless their preference says to.
    """
    email_sent = False
    sms_sent = False
    sms_configured = sms.configured()
    if email:
        try:
            if attachments:
                message = EmailMessage(
                    subject, body, sender_for(MONEY), [email],
                    connection=connection_for(MONEY),
                )
                for filename, content, mimetype in attachments:
                    message.attach(filename, content, mimetype)
                message.send(fail_silently=False)
            else:
                send_mail(
                    subject, body, sender_for(MONEY), [email],
                    connection=connection_for(MONEY), fail_silently=False,
                )
            email_sent = True
        except Exception:
            # A receipt that never went out must not read as sent — and the
            # treasurer must be able to learn why from the server log rather
            # than from a silent “Pending” badge.
            logger.exception('Receipt email to %s failed to send.', email)

    if phone and sms_configured:
        if both or not email_sent:
            # The gateway normalises the number (+254…) and logs the provider's own
            # reason for a refusal; nothing here may raise into the giving flow.
            sms_sent = sms.send(phone, body)
            if not sms_sent:
                logger.warning('Receipt SMS to %s was not delivered.', phone)

    sent = email_sent or sms_sent
    if sent:
        mark_sent()
    return {
        'email_sent': email_sent,
        'sms_sent': sms_sent,
        'sms_configured': sms_configured,
    }


def send_contribution_receipt(contribution, receipt_email=''):
    """Letter the giver about their gift — by email and SMS where reachable.

    ``receipt_email`` is a delivery address that never touched the ledger:
    an anonymous gift records no name, email or account against its row, but
    the giver's own account address may still carry their receipt. The row's
    own address (or member's) always wins; this one is the fallback.
    """
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
    summary = receipt_summary(account=contribution.purpose, amount=amount_display, payment_channel=contribution.get_payment_method_display(), receipt_ref=receipt_reference, date_display=date_display)
    email = (
        usable_email(contribution.donor_email)
        or (usable_email(contribution.member.email) if contribution.member else '')
        or usable_email(receipt_email)
    )
    # The email carries the thermal paper the SMS cannot; the letter itself
    # is the same on both channels.
    attachment = contribution_receipt_attachment(contribution) if email else None
    body = (
        f"{receipt_message}\n\n"
        f"{summary}\n\n"
        f"{receipt_email_signature()}"
    )
    delivery = _deliver_receipt_message(
        subject=f"Giving receipt — {contribution.purpose}",
        body=body,
        email=email,
        phone=contribution.phone_number,
        # The giver's own preference, not the church's habit, decides whether
        # their phone rings beside their inbox.
        both=wants_both_receipt_channels(contribution.member),
        mark_sent=lambda: None,
        attachments=[attachment] if attachment else None,
    )
    if delivery['email_sent'] or delivery['sms_sent']:
        contribution.receipt_sent_at = timezone.now()
        contribution.save(update_fields=['receipt_sent_at'])


def send_grouped_contribution_receipts(group, receipt_email=''):
    """One receipt for a gift spread over several accounts.

    A giver who ticked three accounts used to receive three letters, one per
    ledger line, each thanking them for a part of their gift. The lines share
    one payment — one M-Pesa prompt, one Safaricom receipt number, one
    ``payment_group`` — so the receipt is one letter too: the configurable
    split template carries the whole gift's amount with the account-by-account
    distribution beneath it. The group is marked receipted together, so a
    resend after a failure retells the whole gift, never a fragment.
    """
    lines = list(Contribution.objects.filter(payment_group=group).order_by('id'))
    completed = [row for row in lines if row.status == 'completed']
    if not completed or any(row.receipt_sent_at for row in completed):
        return
    if len(completed) == 1:
        # A group of one is not a split gift — it keeps the ordinary receipt.
        send_contribution_receipt(completed[0])
        return

    first = completed[0]
    church_settings = ChurchSettings.objects.get_or_create(pk=1)[0]
    donor_name = giver_display_name(
        first.donor_name,
        member=first.member,
        email=first.donor_email,
        phone=first.phone_number,
    ) or 'friend'
    amount_display = f"{first.currency} {sum(row.amount for row in completed):,.2f}"
    distribution = '\n'.join(f"{row.purpose}: {row.currency} {row.amount:,.2f}" for row in completed)
    receipt_message = render_receipt_message(
        church_settings.split_receipt_message or church_settings.default_receipt_message,
        donor_name,
        amount_display,
        first.purpose,
        extra={'distribution': distribution},
    )
    date_display = timezone.localtime(first.paid_at or timezone.localtime()).strftime('%d %B %Y, %H:%M')
    receipt_reference = first.mpesa_receipt_number or first.paystack_reference or str(first.id)
    account_list = ' / '.join(row.purpose for row in completed)
    summary = receipt_summary(account=account_list, amount=amount_display, payment_channel=first.get_payment_method_display(), receipt_ref=receipt_reference, date_display=date_display)
    email = (
        usable_email(first.donor_email)
        or (usable_email(first.member.email) if first.member else '')
        or usable_email(receipt_email)
    )
    # One slip prints the whole split — the same itemised paper the member
    # page downloads — and rides the email the letter goes in.
    attachment = contribution_receipt_attachment(first) if email else None
    body = (
        f"{receipt_message}\n\n"
        f"{summary}\n\n"
        f"{receipt_email_signature()}"
    )
    delivery = _deliver_receipt_message(
        subject=f"Giving receipt — {account_list}",
        body=body,
        email=email,
        phone=first.phone_number,
        both=wants_both_receipt_channels(first.member),
        mark_sent=lambda: None,
        attachments=[attachment] if attachment else None,
    )
    if delivery['email_sent'] or delivery['sms_sent']:
        Contribution.objects.filter(id__in=[row.id for row in completed]).update(receipt_sent_at=timezone.now())
    return delivery


def send_honoree_receipt(contribution):
    """The letter that tells the person a gift was given for them.

    The payer's own receipt rides the phone they gave from; this one is
    addressed to the honoree's account, because the gift is written on their
    record too — a spouse's tithe counts on the spouse's statement. It goes
    by email only: the phone on the payment is the payer's, not theirs. An
    anonymous gift still honours its honoree, but the letter never says who
    gave.
    """
    if contribution.honoree_receipt_sent_at or contribution.status != 'completed':
        return
    honoree = contribution.honoree
    if honoree is None or not (honoree.email or '').strip():
        return
    amount_display = f"{contribution.currency} {contribution.amount:,.2f}"
    receipt_reference = contribution.mpesa_receipt_number or contribution.paystack_reference or str(contribution.id)
    date_display = timezone.localtime(contribution.paid_at or timezone.now()).strftime('%d %B %Y, %H:%M')
    if contribution.anonymous:
        giver_line = 'A gift has been given for you'
    elif contribution.donor_name:
        giver_line = f"{contribution.donor_name} has given this gift for you"
    elif contribution.member_id:
        given_by = contribution.member.get_full_name() or contribution.member.username
        giver_line = f"{given_by} has given this gift for you"
    else:
        giver_line = 'A gift has been given for you'
    relationship = (contribution.get_relationship_display() or '').lower()
    as_your = f" as your {relationship}" if relationship else ''
    body = (
        f"Dear {honoree.get_full_name() or honoree.username},\n\n"
        f"{giver_line}{as_your}: {amount_display} towards {contribution.purpose}.\n\n"
        f"{receipt_summary(account=contribution.purpose, amount=amount_display, payment_channel=contribution.get_payment_method_display(), receipt_ref=receipt_reference, date_display=date_display)}\n\n"
        "The gift is written on your giving record as well as the payer's.\n\n"
        f"{receipt_email_signature()}"
    )
    sent = send_mail(
        f"A gift has been given for you — {contribution.purpose}",
        body,
        settings.DEFAULT_FROM_EMAIL,
        [honoree.email],
        fail_silently=True,
    )
    if sent:
        contribution.honoree_receipt_sent_at = timezone.now()
        contribution.save(update_fields=['honoree_receipt_sent_at'])


def send_cash_receipt(cash, *, send_sms=True, send_email=True):
    """Send a manually recorded receipt through both selected channels."""
    if cash.receipt_sent_at or cash.entry_type != 'individual':
        return {'email_sent': False, 'sms_sent': False, 'sms_configured': sms.configured()}
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
    # A desk entry's channels are the office's own choice, ticked on the slip:
    # unlike a digital receipt they are not governed by the giver's preference,
    # because the office may be receipting a giver with no account at all.
    delivery = _deliver_receipt_message(
        subject=f"Giving receipt — {cash.purpose}",
        body=body,
        email=usable_email(cash.giver_email) if send_email else '',
        phone=cash.giver_phone if send_sms else '',
        both=send_email and send_sms,
        mark_sent=lambda: None,
    )
    if delivery['email_sent'] or delivery['sms_sent']:
        cash.receipt_sent_at = timezone.now()
        cash.save(update_fields=['receipt_sent_at'])
    return delivery


def send_grouped_cash_receipt(rows, *, send_sms=True, send_email=True):
    """One receipt for a desk entry spread over several giving purposes.

    A giver who handed over one sum for several purposes — say part tithe,
    part welfare — is written as one row per purpose sharing a payment group,
    exactly as a digital split gift is. The receipt is one letter too: the
    configurable split template carries the whole sum with the purpose-by-
    purpose distribution beneath it, instead of one letter per line.
    """
    rows = list(rows)
    if not rows or any(row.receipt_sent_at for row in rows):
        return {
            'email_sent': False, 'sms_sent': False,
            'sms_configured': sms.configured(),
        }
    first = rows[0]
    settings_obj = ChurchSettings.objects.get_or_create(pk=1)[0]
    donor_name = giver_display_name(
        first.donor_name, email=first.giver_email, phone=first.giver_phone,
    ) or 'friend'
    amount_display = f"KES {sum(row.amount for row in rows):,.2f}"
    distribution = '\n'.join(f"{row.purpose}: KES {row.amount:,.2f}" for row in rows)
    message = render_receipt_message(
        settings_obj.split_receipt_message or settings_obj.default_receipt_message,
        donor_name,
        amount_display,
        first.purpose,
        extra={'distribution': distribution},
    )
    account_list = ' / '.join(row.purpose for row in rows)
    body = (
        f"{message}\n\n"
        f"{receipt_summary(account=account_list, amount=amount_display, payment_channel=first.get_payment_method_display(), receipt_ref=first.receipt_number or f'CASH-{first.id}', date_display=first.received_on)}\n\n"
        f"{receipt_email_signature()}"
    )
    # As above: the desk's own channel tick governs a split receipt, not the
    # giver's preference.
    delivery = _deliver_receipt_message(
        subject=f"Giving receipt — {account_list}",
        body=body,
        email=usable_email(first.giver_email) if send_email else '',
        phone=first.giver_phone if send_sms else '',
        both=send_email and send_sms,
        mark_sent=lambda: None,
    )
    if delivery['email_sent'] or delivery['sms_sent']:
        sent_at = timezone.now()
        CashContribution.objects.filter(pk__in=[row.pk for row in rows]).update(receipt_sent_at=sent_at)
        for row in rows:
            row.receipt_sent_at = sent_at
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
    # The elders take everything the treasurer's desk does: their office now
    # carries every right the administrator holds, and the church's money is
    # one of the desks that follows from it. Administration itself — the
    # register, the roles and the settings — stays with the administrator and
    # the clerk; it is checked on its own endpoints, never through this
    # helper.
    return bool(
        profile
        and profile.has_role(
            'treasurer', 'admin', 'elder', 'first_elder', 'second_elder', 'third_elder'
        )
    )


def is_elder_or_admin(user):
    if not user or not user.is_authenticated:
        return False
    if user.is_staff or user.is_superuser:
        return True
    profile = getattr(user, 'member_profile', None)
    return bool(profile and profile.has_role('elder', 'admin'))


def is_pastor_or_admin(user):
    if not user or not user.is_authenticated:
        return False
    if user.is_staff or user.is_superuser:
        return True
    profile = getattr(user, 'member_profile', None)
    return bool(profile and profile.has_role('pastor', 'admin'))


def is_clerk_or_admin(user):
    if not user or not user.is_authenticated:
        return False
    if user.is_staff or user.is_superuser:
        return True
    profile = getattr(user, 'member_profile', None)
    return bool(profile and profile.has_role('clerk', 'admin'))




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
        email = serializer.validated_data['email'].lower().strip()
        validated_data = {k: v for k, v in serializer.validated_data.items() if k != 'email'}
        if privacy_accepted:
            validated_data['privacy_accepted_at'] = timezone.now()
            validated_data['privacy_policy_version'] = CURRENT_PRIVACY_POLICY_VERSION
        if terms_accepted:
            validated_data['terms_accepted_at'] = timezone.now()
            validated_data['terms_of_use_version'] = CURRENT_TERMS_OF_USE_VERSION
        if User.objects.filter(email__iexact=email).exists():
            return Response(
                {'email': 'An account already exists for this email address. Try signing in or resetting your password instead.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Check for existing enrollment requests for this email
        now = timezone.now()
        existing = EnrollmentRequest.objects.filter(email=email).first()
        if existing:
            # If there's an active verification_pending request, reject the new one
            if existing.status == 'verification_pending' and existing.expires_at > now:
                return Response(
                    {'email': 'An enrollment request with this email is already pending verification. Check your email for the verification code, or wait for it to expire before trying again.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            # If the existing request was approved but no user account was created,
            # and it has expired, delete it so a fresh enrollment can be started
            if existing.status == 'approved' and existing.expires_at <= now and not existing.user_id:
                existing.delete()
            # If the existing request has expired (any status except completed),
            # delete it to allow a fresh start
            elif existing.expires_at <= now and existing.status != 'completed':
                existing.delete()
        token = uuid.uuid4()
        enrollment = EnrollmentRequest.objects.create(
            email=email,
            token=token,
            status='verification_pending',
            expires_at=now + timedelta(hours=48),
            **validated_data,
        )
        enrollment.set_code()
        enrollment.save(update_fields=['code'])
        try:
            send_enrollment_email(enrollment)
        except Exception:
            pass
        return Response({
            'message': 'A verification code has been sent to your email. Enter it on this page to continue your account setup.',
            'token': str(enrollment.token)
        }, status=status.HTTP_200_OK)


class EnrollmentVerifyView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        enrollment = EnrollmentRequest.from_code(request.query_params.get('code'))
        if enrollment is None or enrollment.status not in ('verification_pending', 'approved') or enrollment.expires_at <= timezone.now():
            return Response({'detail': 'This verification code is invalid or expired.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'email': enrollment.email, 'first_name': enrollment.first_name, 'last_name': enrollment.last_name, 'joining_mode': enrollment.joining_mode})


class EnrollmentCompleteView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = EnrollmentCompleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        enrollment = EnrollmentRequest.from_code(serializer.validated_data['code'])
        if enrollment is None or enrollment.status not in ('verification_pending', 'approved') or enrollment.expires_at <= timezone.now():
            return Response({'detail': 'This verification code is invalid or expired.'}, status=status.HTTP_400_BAD_REQUEST)
        if User.objects.filter(username=serializer.validated_data['username']).exists():
            return Response({'username': 'That username is already in use.'}, status=status.HTTP_400_BAD_REQUEST)
        if User.objects.filter(email__iexact=enrollment.email).exists():
            return Response({'email': 'An account already exists for this email.'}, status=status.HTTP_400_BAD_REQUEST)
        user = User.objects.create_user(username=serializer.validated_data['username'], email=enrollment.email, first_name=enrollment.first_name, last_name=enrollment.last_name, password=serializer.validated_data['password'], is_active=enrollment.status == 'approved')
        # Form two asks the phone again, so the freshest answer wins over the
        # one typed at sign-up (they may differ; the person is present now).
        submitted_phone = re.sub(r'\D', '', serializer.validated_data.get('phone_number') or '')
        from .models import MemberProfile
        MemberProfile.objects.create(
            user=user,
            phone_number=submitted_phone or enrollment.phone_number,
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
        if self.request.user.is_staff or (profile and profile.has_role('admin', 'clerk', 'elder', 'pastor')):
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
        if not (request.user.is_staff or (profile and profile.has_role('admin', 'clerk', 'elder', 'pastor'))):
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
                # Mark any other pending enrollment requests for this person as approved
                EnrollmentRequest.objects.filter(
                    Q(user=user) | Q(email__iexact=enrollment.email)
                ).exclude(pk=enrollment.pk).update(status='approved')
                # The notice reaches the member via both email and SMS with direct login link
                send_membership_approval_email(
                    user,
                    church_name=current_church_name(),
                    name=enrollment.first_name,
                    phone=enrollment.phone_number,
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


def announcement_broadcasts_run_inline():
    """True while a broadcast is instant enough to run inside the request.

    Django's test runner swaps SMTP for the in-memory backend (tests read their
    assertions out of that outbox, and patched SMS calls out of their mock,
    neither of which a background thread reaches in time), and development
    prints mail to the console. Both are instant, so a broadcast simply runs in
    the request there. Only the real, paced sends — the minutes-long ones — are
    pushed to a background thread.
    """
    return not settings.EMAIL_BACKEND.endswith('smtp.EmailBackend')


def sms_broadcasts_run_inline():
    """True only under the test runner.

    A text really leaves the building, so unlike the email path there is no
    reason for development to run the broadcast inside the request: even a
    local database holds real numbers. Tests are the one exception — their
    gateway is mocked, and the assertions read the mock right after the POST.
    """
    return 'test' in sys.argv


def dispatch_announcement_emails_safely(announcement_id, schema_name=None):
    """Run the announcement broadcast off the request cycle, failures logged.

    Threaded because the throttled pace makes a whole-congregation broadcast a
    minutes-long job that must not hold an officer's request open (or a gunicorn
    worker). ``fail_silently=False`` sends raise inside the loop; anything that
    escapes it — a database error, a closed connection at the very first open —
    is logged here so a failed broadcast is a visible log line, not silence.
    """
    if schema_name:
        try:
            from django_tenants.utils import schema_context
            with schema_context(schema_name):
                _dispatch_announcement_emails_impl(announcement_id)
            return
        except ImportError:
            pass
    _dispatch_announcement_emails_impl(announcement_id)


def _dispatch_announcement_emails_impl(announcement_id):
    try:
        announcement = Announcement.objects.get(id=announcement_id)
    except Announcement.DoesNotExist:
        # Deleted between the post and the thread's start — nothing to send.
        return
    try:
        send_announcement_emails(announcement)
    except Exception:
        logger.exception('Announcement email broadcast for #%s failed', announcement_id)


def _push_announcement_safely(announcement_id, schema_name=None):
    """Deliver an announcement as web push off the request cycle, failures logged."""
    if schema_name:
        try:
            from django_tenants.utils import schema_context
            with schema_context(schema_name):
                _push_announcement_impl(announcement_id)
            return
        except ImportError:
            pass
    _push_announcement_impl(announcement_id)


def _push_announcement_impl(announcement_id):
    try:
        announcement = Announcement.objects.get(id=announcement_id)
    except Announcement.DoesNotExist:
        return
    try:
        from .push import push_announcement

        push_announcement(announcement)
    except Exception:
        logger.exception('Announcement push broadcast for #%s failed', announcement_id)


def dispatch_announcement_sms_safely(announcement_id, schema_name=None):
    """Text an announcement off the request cycle, failures logged.

    The pace that keeps a whole congregation under the gateway's rate limit
    makes the broadcast a minutes-long job, so it never holds an officer's
    request open — same reason the email broadcast is threaded.
    """
    if schema_name:
        try:
            from django_tenants.utils import schema_context
            with schema_context(schema_name):
                _dispatch_announcement_sms_impl(announcement_id)
            return
        except ImportError:
            pass
    _dispatch_announcement_sms_impl(announcement_id)


def _dispatch_announcement_sms_impl(announcement_id):
    try:
        announcement = Announcement.objects.get(id=announcement_id)
    except Announcement.DoesNotExist:
        # Deleted between the post and the thread's start — nothing to send.
        return
    try:
        send_announcement_sms(announcement)
    except Exception:
        logger.exception('Announcement SMS broadcast for #%s failed', announcement_id)


def duty_notices_run_inline():
    """True while a rostering's notices are instant enough to send in the request.

    Rostering an officer rings them by bell, letter, text and push, and the
    desk must not wait on any of it — a slow mail host or gateway turns a
    two-second save into a spinner. In production the whole bundle is handed
    to a background thread. In development and the test suite mail is the
    console/in-memory backend (instant, and the assertions read ``mail.outbox``
    right after the POST, which a thread cannot reach in time), so there the
    notices simply go out inside the request, exactly as before.
    """
    return not settings.EMAIL_BACKEND.endswith('smtp.EmailBackend')


def dispatch_duty_notices_safely(entry_id, previous_officers, schema_name=None):
    """Ring a line's newly rostered officers off the request cycle.

    Threaded so the desk's save returns the moment the row is written; a
    failure is a log line, never a broken rota. ``previous_officers`` is what
    the line held before the save — who was already rostered decides who is
    "newly" rostered, and that answer must be captured in the request, not
    re-guessed in the thread. The thread reads with its own connection, so the
    tenant schema is re-entered when there is one.
    """
    if schema_name:
        try:
            from django_tenants.utils import schema_context
            with schema_context(schema_name):
                _dispatch_duty_notices_impl(entry_id, previous_officers)
            return
        except ImportError:
            pass
    _dispatch_duty_notices_impl(entry_id, previous_officers)


def _dispatch_duty_notices_impl(entry_id, previous_officers):
    try:
        entry = DutyRota.objects.get(pk=entry_id)
    except DutyRota.DoesNotExist:
        # Taken off the rota between the save and the thread's start.
        return
    try:
        notify_new_duty_officers(entry, previous_officers)
    except Exception:
        logger.exception('Duty rostering notices for line #%s failed', entry_id)


def send_rota_notices_after_save(entry, previous_officers, request=None):
    """Save first, ring second: the notices leave once the row is written.

    Inline where the sends are instant (development and the test suite), in a
    background thread where they are not — so the desk's save is never held
    open by a mail host or the SMS gateway.
    """
    if duty_notices_run_inline():
        notify_new_duty_officers(entry, previous_officers)
        return
    schema_name = getattr(connection, 'schema_name', None)
    if not schema_name and request is not None:
        schema_name = getattr(getattr(request, 'tenant', None), 'schema_name', None)
    threading.Thread(
        target=dispatch_duty_notices_safely,
        args=(entry.pk, previous_officers, schema_name),
        name=f'duty-notices-{entry.pk}',
        daemon=True,
    ).start()


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


# The congregation groups named by membership rather than by office: a post
# to Adventist Men addresses the men, not only their leader. 'board' is the
# church board, whose membership is the roles themselves.
MEMBERSHIP_AUDIENCE_CODES = {'adventist_men', 'adventist_women', 'young_adults', 'board'}


def department_audience_user_ids(codes):
    """Members of whole-department audiences (``dept_*`` codes).

    A department audience is the department's actual roll — the membership
    list the department hub curates — plus its leaders and assistants,
    who serve the group whether or not they sit on their own roll.
    """
    dept_codes = {code.removeprefix('dept_') for code in codes if code.startswith('dept_')}
    user_ids = set()
    if not dept_codes:
        return user_ids
    roll = DepartmentMembership.objects.filter(
        department__in=dept_codes, member__is_active=True
    ).values_list('member_id', flat=True)
    user_ids.update(roll)
    # The department's leaders and assistants ride along with its post.
    user_ids.update(
        DepartmentAssignment.objects.filter(
            department__code__in=dept_codes, department__is_active=True,
            member__is_active=True,
        ).values_list('member_id', flat=True)
    )
    return user_ids


def announcement_audience_user_ids(audience_codes):
    """Users an audience addresses, or ``None`` when the post is to everyone.

    An audience is a mixed list: ministry office codes (matched against the
    roles a member holds), membership groups like Adventist Men (matched
    against the member's own declared ministry), the church board, and
    whole departments (matched against the department rolls).
    """
    codes = {code for code in (audience_codes or []) if code}
    if not codes:
        return None
    user_ids = department_audience_user_ids(codes)
    if 'board' in codes:
        user_ids |= set(board_audience().values_list('id', flat=True))
    office_codes = codes - MEMBERSHIP_AUDIENCE_CODES - {c for c in codes if c.startswith('dept_')}
    for profile in MemberProfile.objects.select_related('user').filter(user__is_active=True):
        if office_codes and set(profile.get_roles()) & office_codes:
            user_ids.add(profile.user_id)
            continue
        if profile.ministry and profile.ministry in codes:
            user_ids.add(profile.user_id)
    return user_ids


def announcement_recipients(announcement):
    """The accounts a post addresses, exactly as its audience names them.

    "All users" is the approved roster — roster_queryset(): every active
    account except the installation superuser and the join requests nobody
    has accepted yet. "Members only" keeps friend and sabbath-school accounts
    off the list: they are welcome on the site, but they are not members, and
    a members-only post is member correspondence. An audience still addresses
    exactly the offices and groups it names, whichever account types hold
    them — addressing wins over visibility there.
    """
    base = roster_queryset().filter(is_active=True)
    audience_codes = list(getattr(announcement, 'audience', None) or [])
    if audience_codes:
        return base.filter(id__in=announcement_audience_user_ids(audience_codes))
    if announcement.visibility == 'members_only':
        return base.filter(member_profile__account_type='member')
    return base


def announcement_email_recipients(announcement, church_name):
    """Yield ``(address, body)`` pairs for an announcement's email audience.

    Split from ``send_announcement_emails`` so the size of the audience can be
    counted (for the failure log) without re-sending anything. Members who
    switched announcement emails off are withheld here — their address stays
    on the account for receipts and duty notices, it just stops receiving
    mass broadcasts. The pref is read as ``None`` for accounts with no
    profile, and ``None`` still receives: only a deliberate ``False`` opts out.
    """
    seen = set()
    # The audience rule lives in announcement_recipients(): approved accounts
    # only, member accounts only for a members-only post, the named offices
    # and groups for an audience.
    recipients = announcement_recipients(announcement).exclude(email='')
    for first_name, last_name, username, email, wants_email in (
        recipients.values_list('first_name', 'last_name', 'username', 'email', 'member_profile__announce_email')
    ):
        if wants_email is False:
            continue
        address = (email or '').strip()
        if not address or address.lower() in seen or address.lower().endswith('@friend.church'):
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


def announcement_sms_recipients(announcement):
    """Yield each phone an announcement's audience reaches, once.

    Same audience rule as the email (``announcement_recipients``); this is
    only the phone half of it. Numbers are normalised before they are deduped,
    so a household that shares one phone receives one text, and a number the
    gateway cannot use is dropped here rather than costing a failed request.
    """
    seen = set()
    rows = announcement_recipients(announcement).values_list('member_profile__phone_number', flat=True)
    for phone in rows:
        to = sms.recipient(phone)
        if not to or to in seen:
            continue
        seen.add(to)
        yield to


def send_announcement_sms(announcement):
    """Text the post to every phone its audience reaches.

    The post itself is the message — an SMS has no subject line, so the title
    leads, the body follows and the church signs it, exactly as the email is
    built. A message the gateway refuses is counted and logged; the walk down
    the roll continues, because one bad number must not silence the rest.
    """
    church_name = current_church_name()
    body = f"{announcement.title}\n\n{announcement.text or ''}".strip()
    if announcement.detail:
        body += f"\n\n{announcement.detail}"
    body += f"\n\n{church_name}"

    sent = failed = 0
    for phone in announcement_sms_recipients(announcement):
        if sms.send(phone, body):
            sent += 1
        else:
            failed += 1
        # The gateway allows 60 requests a minute; the pause keeps a full
        # congregation under that rather than collecting 429s midway.
        if settings.SMS_SEND_DELAY > 0:
            time.sleep(settings.SMS_SEND_DELAY)
    if failed:
        logger.warning('Announcement SMS finished: %d sent, %d refused.', sent, failed)
    return sent


class CanManageAnnouncements(permissions.BasePermission):
    """Posting is a leadership right, decided before the body is validated.

    The check used to sit in ``perform_create``, which runs after the serializer:
    a member without the right was told their announcement dates were missing
    rather than that posting was never theirs to do.
    """

    def has_permission(self, request, view):
        return can_manage_announcements(request.user)


class CanManageMoments(permissions.BasePermission):
    """Moments opens at the top to the administrators and to the deaconate;
    everyone else reads the wall."""

    def has_permission(self, request, view):
        return can_manage_moments(request.user)


def can_manage_moments(user):
    """The Moments gate: who may document into the wall, who only reads it.

    Moments is the church's record of its own life, and it has two doors.
    The administrators keep the first — staff, superusers and the admin
    role: they open albums, add to them, take them down. The deaconate has
    the second: the desk standing in the middle of the church's days (the
    Sabbaths, the communions, the baptisms) is the desk with the pictures of
    them, and it documents its own moments without needing the office. A
    plain member — and an elder without the admin role, as ever — reads the
    published albums only.
    """
    if not user or not user.is_authenticated:
        return False
    if user.is_staff or user.is_superuser:
        return True
    profile = getattr(user, 'member_profile', None)
    if profile and profile.has_role('admin'):
        return True
    # The deaconate's own desk: its roll, and whoever leads it. Deliberately
    # not ``can_manage_department`` — that opens every department's door to
    # every church office, and Moments opens to the desk that holds the
    # pictures, not to the whole office row.
    if DepartmentMembership.objects.filter(member=user, department='deaconate').exists():
        return True
    return DepartmentAssignment.objects.filter(
        department__code='deaconate', member=user, department__is_active=True,
    ).exists()


class ChurchEventView(generics.ListCreateAPIView):
    """The Moments wall: the church's event albums, newest day first.

    Everyone may read the published albums; only administrators open
    albums, add to them or take them down — Moments is the church's own
    record of its life, kept by the administrators.
    """
    serializer_class = ChurchEventSerializer

    def get_permissions(self):
        return [IsAuthenticated(), CanManageMoments()] if self.request.method == 'POST' else [AllowAny()]

    def get_queryset(self):
        queryset = ChurchEvent.objects.all()
        # The desk can read what it has not let out yet; the wall serves only
        # what is published — the flag means nothing to a member's request.
        wants_drafts = self.request.query_params.get('include_unpublished') == 'true'
        if not (wants_drafts and can_manage_announcements(self.request.user)):
            queryset = queryset.filter(published=True)
        if self.request.user.is_authenticated:
            return queryset
        return queryset

    def perform_create(self, serializer):
        serializer.save(posted_by=self.request.user)


class ChurchEventDetailView(generics.RetrieveUpdateDestroyAPIView):
    """One event album — read, retitle, add files, take files down, unpublish.

    Writes are the administrators': Moments is their gallery. Deleting the
    event deletes its files.
    """
    serializer_class = ChurchEventSerializer

    def get_permissions(self):
        return [IsAuthenticated(), CanManageMoments()] if self.request.method != 'GET' else [AllowAny()]

    def get_object(self):
        event = generics.get_object_or_404(ChurchEvent, pk=self.kwargs['pk'])
        if self.request.method == 'GET' and not event.published:
            raise Http404
        return event

    def perform_destroy(self, instance):
        for media in instance.media.all():
            if media.file:
                media.file.delete(save=False)
        instance.delete()

    def perform_update(self, serializer):
        serializer.save()


def dispatch_announcement_broadcast(announcement, request=None, schema_name=None):
    """Handle Site / SMS / Email / Push broadcast for an announcement."""
    sharing_raw = (announcement.sharing_option or '').lower()
    channels = [c.strip() for c in sharing_raw.replace(';', ',').split(',') if c.strip()]
    send_email = any(c in ('email', 'all') for c in channels) or sharing_raw in ('email', 'all')
    send_sms = any(c in ('sms', 'all') for c in channels) or sharing_raw in ('sms', 'all')
    send_push = any(c in ('phone', 'all') for c in channels) or sharing_raw in ('phone', 'all')
    show_site = any(c in ('site', 'all') for c in channels) or sharing_raw in ('site', 'all') or not channels

    announcement.published = show_site
    announcement.save(update_fields=['published'])

    if not schema_name:
        schema_name = getattr(connection, 'schema_name', None)
        if not schema_name and request and hasattr(request, 'tenant'):
            schema_name = getattr(request.tenant, 'schema_name', None)

    if send_email:
        if announcement_broadcasts_run_inline():
            try:
                send_announcement_emails(announcement)
            except Exception:
                logger.exception('Announcement email broadcast failed')
        else:
            threading.Thread(
                target=dispatch_announcement_emails_safely,
                args=(announcement.id, schema_name),
                name=f'announcement-email-{announcement.id}',
                daemon=True,
            ).start()

    if send_push:
        try:
            from .push import vapid_keys_ready

            if vapid_keys_ready():
                threading.Thread(
                    target=_push_announcement_safely,
                    args=(announcement.id, schema_name),
                    name=f'announcement-push-{announcement.id}',
                    daemon=True,
                ).start()
        except Exception:
            pass

    if send_sms:
        try:
            for u in announcement_recipients(announcement):
                ChurchNotification.objects.create(
                    user=u,
                    title=f"SMS Announcement: {announcement.title}",
                    message=announcement.text or announcement.title,
                )
        except Exception:
            pass
        if sms.configured():
            if sms_broadcasts_run_inline():
                try:
                    send_announcement_sms(announcement)
                except Exception:
                    logger.exception('Announcement SMS broadcast failed')
            else:
                threading.Thread(
                    target=dispatch_announcement_sms_safely,
                    args=(announcement.id, schema_name),
                    name=f'announcement-sms-{announcement.id}',
                    daemon=True,
                ).start()


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
            # An event dated in the future is not hidden — it takes its place in
            # the feed by when it ends (see list()) — but a legacy start date
            # still holds older posts back.
            queryset = queryset.filter(Q(starts_at__isnull=True) | Q(starts_at__lte=today))
        search = self.request.query_params.get('search', '').strip()
        if search:
            queryset = queryset.filter(Q(title__icontains=search) | Q(text__icontains=search) | Q(detail__icontains=search))
        if self.request.user.is_authenticated:
            return queryset
        return queryset.filter(visibility__in=['public_website', 'all'])

    def list(self, request, *args, **kwargs):
        """The day the event ends is the announcement's position.

        A post is ranked by the day it runs out, the soonest first: the notice
        whose window closes next is the one a reader can still act on. Ranking
        by the end rather than the beginning is what keeps a long event that
        began earlier from sitting above a later one that finishes before it:
        a month of camp is not more urgent than next weekend's programme merely
        for being under way today.

        Announcements without an event keep their posting order (newest first)
        behind the dated ones.
        """
        queryset = list(self.filter_queryset(self.get_queryset()))

        def finishes(announcement):
            """The day this post's event runs out; ``None`` for a post with no
            event. A single-day event ends on the day it starts."""
            if announcement.event_date_from is None:
                return None
            return announcement.event_date_to or announcement.event_date_from

        queryset.sort(key=lambda a: a.created_at, reverse=True)
        dated = [a for a in queryset if finishes(a) is not None]
        # Stable sort: posts that run out on the same day keep the newest
        # posting first.
        dated.sort(key=finishes)
        undated = [a for a in queryset if finishes(a) is None]
        return Response(self.get_serializer(dated + undated, many=True).data)

    def perform_create(self, serializer):
        # A promotion is a fund drive: one post, one drive — when the post
        # carries a goal. The announcement's own words are the drive's
        # description and its broadcast text — there is no second message to
        # write — and its audience carries over, so the drive invites exactly
        # the people the post addresses. The drive starts immediately and
        # retires the day after the post's event ends.
        # The goal is composer input, not a stored announcement field — read
        # and drop it before the row is built. It is optional: a support call
        # posted without one still names its account (members give there) but
        # mints no drive, since a drive with no goal has no progress to show.
        target = serializer.validated_data.pop('promotion_target', None)
        if serializer.validated_data.get('announcement_type') == 'promotion' and target:
            account_wording = (serializer.validated_data.get('support_account') or '').strip()
            # The posted support call names a treasury account; link the drive
            # to that account and carry the account's own reference, so an
            # M-Pesa gift keyed to the drive never lands on a wording the
            # account does not answer to.
            account_row = None
            if account_wording:
                account_row = (
                    TreasuryAccount.objects.filter(name__iexact=account_wording).first()
                    or TreasuryAccount.objects.filter(description__iexact=account_wording).first()
                    or account_for_purpose(account_wording)
                )
            account = account_row.name if account_row is not None else account_wording
            end = serializer.validated_data.get('event_date_to') or serializer.validated_data.get('event_date_from')
            name_base = (serializer.validated_data.get('title') or serializer.validated_data.get('text') or 'Fund drive')[:110]
            name = name_base
            suffix = 2
            while FundraisingCampaign.objects.filter(name__iexact=name).exists():
                name = f"{name_base} ({suffix})"
                suffix += 1
            drive = FundraisingCampaign.objects.create(
                name=name,
                title=name_base,
                account_name=account,
                source_account=account_row,
                description=serializer.validated_data.get('text') or '',
                member_message=serializer.validated_data.get('text') or '',
                target_amount=target,
                start_date=timezone.localdate(),
                end_date=end,
                is_active=True,
                is_temporary=True,
                generate_card=False,
                allow_personal_invitations=False,
                created_by=self.request.user,
            )
            serializer.validated_data['campaign'] = drive

        # Leadership was already established by CanManageAnnouncements.
        announcement = serializer.save()
        dispatch_announcement_broadcast(announcement, self.request)


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
        # A PATCH carrying remove_attachment=true clears the flyer: the file
        # is deleted from storage and the row's attachment fields emptied.
        remove_attachment = str(self.request.data.get('remove_attachment', '')).strip().lower() in ('1', 'true', 'yes')
        # Editing the sharing channels re-decides site visibility, so an
        # announcement whose channels gain or lose "site" flips accordingly.
        announcement = serializer.save()
        if remove_attachment:
            if announcement.attachment:
                announcement.attachment.delete(save=False)
            announcement.attachment = None
            announcement.save(update_fields=['attachment'])
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
        # A pledge carries the day the member promises to redeem it by, and it
        # never runs past the event the announcement is about: the drive needs
        # the gift while the drive is still on. A pledge sent without a day
        # (an older client) is still recorded — it simply earns no reminder.
        pledge_due_date = None
        if request.data.get('pledge_due_date'):
            pledge_due_date = parse_date(str(request.data.get('pledge_due_date')))
            if pledge_due_date is None:
                return Response(
                    {'pledge_due_date': 'Give the day you will give by as YYYY-MM-DD.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            event_end = announcement.event_date_to or announcement.event_date_from
            if event_end and pledge_due_date > event_end:
                return Response(
                    {'pledge_due_date': f'Choose a day on or before the event date, {event_end.strftime("%d %B %Y")}.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if pledge_due_date < timezone.localdate():
                return Response(
                    {'pledge_due_date': 'The day you will give by cannot be in the past.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        response_text = request.data.get('response_text', '')
        respondent_name = request.data.get('respondent_name', '')
        respondent_phone = request.data.get('respondent_phone', '')
        # A closed opinion question is answered by picking one of the options
        # the officer wrote; the picked line is stored verbatim so tallies can
        # be grouped by exactly the words that were offered.
        response_choice = str(request.data.get('response_choice', '') or '').strip()
        if announcement.announcement_type == 'opinion' and announcement.response_mode == 'closed':
            options = [line.strip() for line in (announcement.response_options or '').splitlines() if line.strip()]
            if response_choice and response_choice not in options:
                return Response({'response_choice': 'Choose one of the listed options.'}, status=status.HTTP_400_BAD_REQUEST)
            if not response_choice and not response_text:
                return Response({'response_choice': 'Pick one of the options to respond.'}, status=status.HTTP_400_BAD_REQUEST)

        user = request.user if request.user.is_authenticated else None
        if user and not respondent_name:
            respondent_name = user.get_full_name() or user.username

        response_obj = AnnouncementResponse.objects.create(
            announcement=announcement,
            user=user,
            action_type=action_type,
            pledge_amount=pledge_amount if pledge_amount else None,
            pledge_due_date=pledge_due_date if pledge_amount else None,
            response_text=response_text,
            response_choice=response_choice,
            respondent_name=respondent_name,
            respondent_phone=respondent_phone,
        )

        try:
            broadcast_announcement_response(announcement, response_obj)
        except Exception:
            # A dead bus must not break the write: the response is already in
            # the database, and the REST comments endpoint still serves it.
            logger.exception('Could not broadcast announcement response %s', response_obj.pk)

        return Response({
            'detail': 'Action recorded successfully.',
            'id': response_obj.id,
            'action_type': response_obj.action_type,
        }, status=status.HTTP_201_CREATED)


class AnnouncementResponsesView(APIView):
    """The reader-facing mirror of an announcement's comments and questions.

    A public post shows its comments to anybody; a members-only post keeps them
    behind the sign-in. A member's name comes from their account; a guest's from
    what they typed when they answered. The office already has the CSV export
    for the same rows — this view is the reader-facing mirror.
    """
    authentication_classes = []
    permission_classes = []

    def get(self, request, pk):
        try:
            announcement = Announcement.objects.get(pk=pk, published=True)
        except Announcement.DoesNotExist:
            return Response({'detail': 'Announcement not found.'}, status=status.HTTP_404_NOT_FOUND)

        # A members-only post keeps its comments behind the sign-in, the same
        # as its text does.
        if announcement.visibility == 'members_only' and not request.user.is_authenticated:
            return Response({'detail': 'Sign in to read the comments on this announcement.'}, status=status.HTTP_403_FORBIDDEN)

        responses = announcement.responses.select_related('user').order_by('created_at')
        data = []
        for r in responses:
            name = r.respondent_name
            if not name and r.user:
                name = r.user.get_full_name() or r.user.username
            data.append({
                'id': r.id,
                'author_name': name or 'Anonymous',
                'author_phone': r.respondent_phone or '',
                'text': r.response_text,
                'choice': r.response_choice,
                'created_at': r.created_at,
                'is_member': bool(r.user_id),
            })
        return Response({'announcement': AnnouncementSerializer(announcement, context={'request': request}).data, 'comments': data})


def pledge_payload(pledge):
    """One pledge, shaped for the member's modal and the office's list."""
    member = pledge.user
    return {
        'id': pledge.id,
        'announcement': pledge.announcement_id,
        'member_id': pledge.user_id,
        'member_name': (member.get_full_name() or member.username) if member else (pledge.respondent_name or 'Guest'),
        'member_email': (member.email if member else '') or '',
        'amount': float(pledge.pledge_amount) if pledge.pledge_amount is not None else None,
        'due_date': pledge.pledge_due_date,
        'redeemed': pledge.pledge_redeemed_at is not None,
        'redeemed_at': pledge.pledge_redeemed_at,
        'redeemed_via': pledge.pledge_redeemed_via,
        'reminded_at': pledge.pledge_reminder_sent_at,
        'created_at': pledge.created_at,
    }


class AnnouncementPledgeView(APIView):
    """The member's own pledge against one announcement, if there is one.

    The pledge modal opens on somebody who may have pledged weeks ago, so it
    asks this first: what they promised, the day they promised it by, and
    whether it has been honoured. That is what lets the modal read "Mark as
    given" instead of asking them to pledge the same thing twice.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        pledge = (
            AnnouncementResponse.objects.filter(
                announcement_id=pk, user=request.user, pledge_amount__isnull=False,
            )
            .select_related('user', 'announcement')
            .order_by('-created_at')
            .first()
        )
        return Response({'pledge': pledge_payload(pledge) if pledge else None})


class AnnouncementPledgeListView(APIView):
    """Every pledge a giving announcement drew — the office's list."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        if not can_manage_announcements(request.user):
            return Response(
                {'detail': 'Only officers who manage announcements can read pledges.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        announcement = Announcement.objects.filter(pk=pk).first()
        if announcement is None:
            return Response({'detail': 'Announcement not found.'}, status=status.HTTP_404_NOT_FOUND)
        # Close whatever the members' giving has already honoured, so the list
        # the office reads is current rather than as it stood yesterday.
        all_pledges = AnnouncementResponse.objects.filter(announcement=announcement)
        redeem_pledges_matched_by_giving(all_pledges)
        rows = (
            AnnouncementResponse.objects.filter(announcement=announcement, pledge_amount__isnull=False)
            .select_related('user')
            .order_by('pledge_redeemed_at', 'pledge_due_date')
        )
        pledges = [pledge_payload(row) for row in rows]
        return Response({
            'pledges': pledges,
            'outstanding': sum(1 for row in pledges if not row['redeemed']),
            'pledged_total': sum(row['amount'] or 0 for row in pledges),
        })


class PledgeRedeemView(APIView):
    """Close a pledge — by the member who made it, or by the church office.

    Both doors matter. A member who gave in cash wants their own record to
    agree with the church's; the office needs to close a pledge whose gift was
    recorded without a name on it. Only the office may *reopen* one, because
    undoing somebody else's closure is a correction, not a preference.
    """

    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        pledge = (
            AnnouncementResponse.objects.filter(pk=pk, pledge_amount__isnull=False)
            .select_related('announcement', 'user')
            .first()
        )
        if pledge is None:
            return Response({'detail': 'Pledge not found.'}, status=status.HTTP_404_NOT_FOUND)

        profile = getattr(request.user, 'member_profile', None)
        is_owner = pledge.user_id is not None and pledge.user_id == request.user.pk
        is_office = bool(profile and profile.has_role('admin', 'elder', 'clerk', 'treasurer'))
        if not (is_owner or is_office):
            return Response(
                {'detail': 'Only the member who pledged, or the church office, can close a pledge.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        redeemed = request.data.get('redeemed', True)
        if isinstance(redeemed, str):
            word = redeemed.strip().lower()
            if word in ('true', '1', 'yes'):
                redeemed = True
            elif word in ('false', '0', 'no'):
                redeemed = False
            else:
                redeemed = None
        if not isinstance(redeemed, bool):
            return Response(
                {'redeemed': 'Send redeemed as true (given) or false (still owed).'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not redeemed and not is_office:
            return Response(
                {'detail': 'Only the church office can reopen a pledge that has been closed.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        if redeemed:
            via = REDEEMED_BY_OFFICE if is_office else REDEEMED_BY_MEMBER
            redeem_due_pledges(pledge, via)
        else:
            reopen_pledge(pledge)

        data = pledge_payload(pledge)
        data['detail'] = (
            'Pledge marked as given.' if redeemed else 'Pledge reopened — it will be reminded about again.'
        )
        return Response(data)


def campaign_pledge_payload(pledge):
    """One drive pledge, shaped for the member's modal and the office's list."""
    member = pledge.member
    return {
        'id': pledge.id,
        'campaign': pledge.campaign_id,
        'member_id': pledge.member_id,
        'member_name': (member.get_full_name() or member.username) if member else '',
        'member_email': (member.email if member else '') or '',
        'amount': float(pledge.amount) if pledge.amount is not None else None,
        'due_date': pledge.due_date,
        'redeemed': pledge.redeemed_at is not None,
        'redeemed_at': pledge.redeemed_at,
        'redeemed_via': pledge.redeemed_via,
        'reminded_at': pledge.reminder_sent_at,
        'created_at': pledge.created_at,
    }


class CampaignPledgeView(APIView):
    """A member's own pledge to one drive: read it, or make (or replace) it.

    A drive owns its promise records, so this is the drive's own door rather
    than the announcement's: the modal opens on somebody who may have pledged
    weeks ago, and reads back what they promised, the day they promised it by,
    and whether it has been honoured. A second pledge replaces the standing
    one — a member has one live promise per drive.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        pledge = (
            CampaignPledge.objects.filter(campaign_id=pk, member=request.user)
            .select_related('member', 'campaign')
            .order_by('-created_at')
            .first()
        )
        return Response({'pledge': campaign_pledge_payload(pledge) if pledge else None})

    def post(self, request, pk):
        # Only a posted drive takes pledges: one awaiting the treasurer's
        # approval has no page, so pledging to it by guessing its id would
        # promise money to something the church has not yet published.
        campaign = FundraisingCampaign.objects.filter(pk=pk, approval_status='approved').first()
        if campaign is None:
            return Response({'detail': 'Fund drive not found.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            amount = Decimal(str(request.data.get('amount') or '0'))
        except (InvalidOperation, TypeError, ValueError):
            amount = Decimal('0')
        if amount <= 0:
            return Response({'amount': 'Enter the amount you are pledging.'}, status=status.HTTP_400_BAD_REQUEST)

        due_date = None
        if request.data.get('due_date'):
            due_date = parse_date(str(request.data.get('due_date')))
            if due_date is None:
                return Response(
                    {'due_date': 'Give the day you will give by as YYYY-MM-DD.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if due_date < timezone.localdate():
                return Response(
                    {'due_date': 'The day you will give by cannot be in the past.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if campaign.end_date and due_date > campaign.end_date:
                return Response(
                    {'due_date': f'Choose a day on or before the drive ends, {campaign.end_date.strftime("%d %B %Y")}.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        pledge = (
            CampaignPledge.objects.filter(campaign=campaign, member=request.user, redeemed_at__isnull=True)
            .order_by('-created_at')
            .first()
        )
        if pledge is None:
            pledge = CampaignPledge.objects.create(
                campaign=campaign, member=request.user, amount=amount, due_date=due_date,
            )
        else:
            pledge.amount = amount
            pledge.due_date = due_date
            pledge.save(update_fields=['amount', 'due_date'])

        return Response(
            {'detail': 'Your pledge is recorded.', 'pledge': campaign_pledge_payload(pledge)},
            status=status.HTTP_201_CREATED,
        )


class CampaignPledgeListView(APIView):
    """Every pledge a drive drew — the office's list."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        if not is_treasurer_or_admin(request.user):
            return Response(
                {'detail': 'Only church treasurers or administrators can read drive pledges.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        campaign = FundraisingCampaign.objects.filter(pk=pk).first()
        if campaign is None:
            return Response({'detail': 'Fund drive not found.'}, status=status.HTTP_404_NOT_FOUND)
        all_pledges = CampaignPledge.objects.filter(campaign=campaign)
        redeem_campaign_pledges_matched_by_giving(all_pledges)
        rows = (
            CampaignPledge.objects.filter(campaign=campaign)
            .select_related('member')
            .order_by('redeemed_at', 'due_date')
        )
        pledges = [campaign_pledge_payload(row) for row in rows]
        return Response({
            'pledges': pledges,
            'outstanding': sum(1 for row in pledges if not row['redeemed']),
            'pledged_total': sum(row['amount'] or 0 for row in pledges),
        })


class CampaignPledgeRedeemView(APIView):
    """Close a drive pledge — by the member who made it, or by the office."""

    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        pledge = CampaignPledge.objects.filter(pk=pk).select_related('campaign', 'member').first()
        if pledge is None:
            return Response({'detail': 'Pledge not found.'}, status=status.HTTP_404_NOT_FOUND)

        profile = getattr(request.user, 'member_profile', None)
        is_owner = pledge.member_id == request.user.pk
        is_office = bool(profile and profile.has_role('admin', 'elder', 'clerk', 'treasurer'))
        if not (is_owner or is_office):
            return Response(
                {'detail': 'Only the member who pledged, or the church office, can close a pledge.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        redeemed = request.data.get('redeemed', True)
        if isinstance(redeemed, str):
            word = redeemed.strip().lower()
            if word in ('true', '1', 'yes'):
                redeemed = True
            elif word in ('false', '0', 'no'):
                redeemed = False
            else:
                redeemed = None
        if not isinstance(redeemed, bool):
            return Response(
                {'redeemed': 'Send redeemed as true (given) or false (still owed).'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not redeemed and not is_office:
            return Response(
                {'detail': 'Only the church office can reopen a pledge that has been closed.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        if redeemed:
            pledge.redeemed_at = timezone.now()
            pledge.redeemed_via = REDEEMED_BY_OFFICE if is_office else REDEEMED_BY_MEMBER
        else:
            pledge.redeemed_at = None
            pledge.redeemed_via = ''
        pledge.save(update_fields=['redeemed_at', 'redeemed_via'])

        data = campaign_pledge_payload(pledge)
        data['detail'] = (
            'Pledge marked as given.' if redeemed else 'Pledge reopened — it will be reminded about again.'
        )
        return Response(data)


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
        # Read the profile row itself rather than the copy the reverse
        # relation may have cached on `request.user`: this endpoint's PATCH
        # writes through a freshly loaded instance, and answering from a
        # stale cache reports the old values straight back (anything that
        # touches `user.member_profile` earlier in the request leaves such a
        # copy behind — a test fixture's create, an admin's edit).
        profile = MemberProfile.objects.filter(user=request.user).first()
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
            # The member's picture, so the profile page and the identity bar
            # draw the same face. '' when none is on file.
            'photo_url': profile.photo_url if profile else '',
            # The signature an officer signs the church's paper with, and the
            # office it stands for — '' when this member signs nothing.
            'signature_url': profile.signature_url if profile else '',
            'signature_office': office_for(profile),
            'gifts': profile.gifts if profile else '',
            'ministry': profile.ministry if profile else '',
            'department': profile.department if profile else '',
            # The same ties as real records: the one department the member
            # belongs to, and the ministries they serve in.
            'department_ref': profile.department_ref.code if profile and profile.department_ref else '',
            'ministries': list(profile.ministries.values_list('code', flat=True)) if profile else [],
            'disability': profile.disability if profile else '',
            # How this member relates to the people they give for or ask to
            # give — declared once, here, so the giving form reads it instead
            # of asking on every gift.
            'declared_relationships': profile.declared_relationships if profile else [],
            'announce_email': profile.announce_email if profile else True,
            'announce_push': profile.announce_push if profile else True,
            # How a giving receipt reaches this member: the email goes out
            # first, and the SMS follows only when the email could not be
            # sent — unless the member asked for both channels on their
            # giving.
            'receipt_delivery': profile.receipt_delivery if profile else 'email',
            # The departments this account belongs to — its roll memberships
            # plus any department it leads or assists — so the feed can offer
            # a My departments tab that shows only the posts addressed to
            # those groups. Labels ride along so tabs read as members see
            # them ("Adventist Youth", not "aym").
            'my_departments': list(user_departments(request.user)),
            # The areas the member actually belongs to or serves in, without
            # the every-area view an office account gets — the dashboard's
            # "Your areas" reads this, so an administrator sees their own
            # departments and ministries, not the whole church.
            'my_ties': member_tie_codes(request.user),
            'profile_update_pending': bool(profile and profile.needs_profile_update()),
            'pending_email_change': (
                EmailChangeRequest.objects.filter(
                    user=request.user, verified=False, expires_at__gt=timezone.now()
                )
                .order_by('-created_at')
                .values_list('new_email', flat=True)
                .first()
                or ''
            ),
        })

    def patch(self, request):
        """Let a member set their own contact details and preferences.

        Gift receipts are addressed from the account, never from the giving
        form, so a member whose account has no address could never receive
        one. This is the way out of that: the address is written to the
        account first, and the next receipt follows it. An empty string clears
        it, which is how a member says they would rather have SMS only.

        The phone number is the member's own to change, with the same
        validation the office edit gets — it is their contact line, and a
        member who has moved number should not need an appointment to say so.

        ``declared_relationships`` is how they relate to the people they give
        for or ask to give: the giving form reads it rather than asking on
        every gift.

        The two switches govern mass communication only: ``announce_email``
        withholds announcement broadcasts, ``announce_push`` announcement
        notifications. Duty notices — a request waiting for your office —
        always arrive regardless of both.

        A giving receipt's channels are the member's own choice too: the
        default delivers the email first and hands the SMS only the slips
        the email could not carry; ``receipt_delivery='both'`` plants the
        text message beside every receipt.
        """
        serializer = MemberEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if 'email' in serializer.validated_data:
            request.user.email = serializer.validated_data['email']
            request.user.save(update_fields=['email'])

        profile, _ = MemberProfile.objects.get_or_create(user=request.user)
        changed = []

        if 'phone_number' in request.data:
            try:
                new_phone = validate_phone_number(str(request.data.get('phone_number') or '').strip())
            except ValidationError as error:
                detail = (
                    error.detail[0]
                    if isinstance(error.detail, list) and error.detail
                    else 'Enter a valid 10-digit phone number (e.g., 0712345678).'
                )
                return Response({'phone_number': str(detail)}, status=status.HTTP_400_BAD_REQUEST)
            if profile.phone_number != new_phone:
                profile.phone_number = new_phone
                changed.append('phone_number')

        if 'declared_relationships' in request.data:
            raw_rows = request.data.get('declared_relationships')
            if not isinstance(raw_rows, list):
                return Response(
                    {'declared_relationships': 'Send the people you are related to as a list.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            valid_codes = {code for code, _label in GIFT_RELATIONSHIP_CHOICES}
            cleaned = []
            for row in raw_rows[:50]:
                if not isinstance(row, dict):
                    continue
                relationship = str(row.get('relationship') or '').strip()
                if relationship not in valid_codes:
                    return Response(
                        {'declared_relationships': 'Each person needs a relationship — spouse, parent, sibling, child, friend or other.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                person_id = row.get('person_id')
                name = str(row.get('name') or '').strip()
                if person_id:
                    person = User.objects.filter(pk=person_id, is_active=True).first()
                    if person is None or person.pk == request.user.pk:
                        return Response(
                            {'declared_relationships': 'Pick people from the church roll — or type a name for someone not on it.'},
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                    name = person.get_full_name() or person.username
                elif not name:
                    return Response(
                        {'declared_relationships': 'Name each person you add, or pick them from the roll.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                cleaned.append(
                    {'person_id': int(person_id) if person_id else None, 'name': name[:160], 'relationship': relationship}
                )
            if profile.declared_relationships != cleaned:
                profile.declared_relationships = cleaned
                changed.append('declared_relationships')

        if 'gender' in request.data:
            # Sex is the church's record, not the member's preference to
            # revise. The forced profile update lets a member fill it in once
            # while it is blank; after that only the office rewrites it —
            # through the change request the member approves. A rewrite from
            # here is refused by name rather than silently dropped.
            submitted = str(request.data.get('gender') or '').strip()[:20]
            recorded = (profile.gender or '').strip()
            if submitted and submitted != recorded:
                return Response(
                    {'gender': 'Your sex is on record and can only be changed by the church office.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        for field in ('announce_email', 'announce_push'):
            if field in request.data:
                value = request.data[field]
                if value in (True, False, 'true', 'false', 'True', 'False', '1', '0', 1, 0):
                    new_value = value in (True, 'true', 'True', '1', 1)
                    if getattr(profile, field) != new_value:
                        setattr(profile, field, new_value)
                        changed.append(field)

        if 'receipt_delivery' in request.data:
            new_value = str(request.data.get('receipt_delivery') or '').strip()
            valid = {code for code, _label in MemberProfile._meta.get_field('receipt_delivery').choices}
            if new_value not in valid:
                return Response(
                    {'receipt_delivery': 'Choose how receipts reach you: email first, or both channels.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if profile.receipt_delivery != new_value:
                profile.receipt_delivery = new_value
                changed.append('receipt_delivery')

        if changed:
            profile.save(update_fields=changed)
        return self.get(request)


class MePhotoView(APIView):
    """The member's own picture: posted as a file, or taken down.

    A photo arrives as multipart rather than a line of JSON, so it needs its
    own door beside ``/me/`` — everything else about the profile is written
    there. The upload must actually be an image, and is shrunk before it is
    stored: a phone photo is several megabytes, and no avatar needs more than
    a few hundred pixels on its longest edge. Replacing a picture removes the
    old file, and DELETE takes the picture down — the initial the identity bar
    draws is the fallback, never a broken image.
    """

    permission_classes = [IsAuthenticated]

    #: Nothing taken of a face needs more than this on its longest edge.
    MAX_EDGE = 640
    #: A picture beyond this never came from a camera pointed at a person.
    MAX_UPLOAD_BYTES = 5 * 1024 * 1024

    @staticmethod
    def _refusal(message):
        return Response({'photo': message}, status=status.HTTP_400_BAD_REQUEST)

    def post(self, request):
        upload = request.FILES.get('photo')
        if upload is None:
            return self._refusal('Choose a picture to upload.')
        if upload.size > self.MAX_UPLOAD_BYTES:
            return self._refusal('That picture is too large — 5 MB at most.')
        if not IMAGE_SUFFIX_PATTERN.search(upload.name or ''):
            return self._refusal('That file is not an image.')

        try:
            with Image.open(upload) as opened:
                image = ImageOps.exif_transpose(opened)
                # Flatten whatever the phone wrote (transparency, palette,
                # greyscale) onto white, so what lands on disk is always one
                # plain JPEG no matter which door the picture came through.
                if image.mode in ('RGBA', 'LA', 'P'):
                    flattened = image.convert('RGBA')
                    background = Image.new('RGB', image.size, (255, 255, 255))
                    background.paste(flattened, mask=flattened.getchannel('A'))
                    image = background
                elif image.mode != 'RGB':
                    image = image.convert('RGB')
                image.thumbnail((self.MAX_EDGE, self.MAX_EDGE))
                buffer = io.BytesIO()
                image.save(buffer, format='JPEG', quality=88, optimize=True)
        except (UnidentifiedImageError, Image.DecompressionBombError, OSError):
            return self._refusal('That file is not an image.')

        profile, _ = MemberProfile.objects.get_or_create(user=request.user)
        if profile.photo:
            # Stored names carry a random suffix per upload, so the old file
            # must go first or every replace leaves the last one on disk.
            profile.photo.delete(save=False)
        profile.photo = ''
        # The name carries a fresh token, so every upload has its own URL:
        # replacing a picture must not hand the browser the old file's address
        # again and let a cached face stand in for the new one.
        profile.photo.save(
            f'user-{request.user.pk}-{secrets.token_hex(4)}.jpg',
            ContentFile(buffer.getvalue()),
            save=True,
        )
        return Response({'photo_url': profile.photo_url})

    def delete(self, request):
        profile = MemberProfile.objects.filter(user=request.user).first()
        if profile and profile.photo:
            profile.photo.delete(save=False)
            profile.photo = ''
            profile.save(update_fields=['photo'])
        return Response({'photo_url': ''})


class MeSignatureView(APIView):
    """The officer's own signature: posted as a file or a drawn picture.

    Only the offices whose signature the church's paper carries may keep one
    (see ``members/signatures.py``): the treasurer and the first elder. The
    signature arrives two ways — a photograph of the slip the officer signs
    cheques with, sent as multipart the way a photo is, or the picture their
    finger drew on the profile page, sent as a PNG data URL in JSON. Both are
    stored as one small PNG: transparency is kept, so a drawn signature
    prints as ink on the paper rather than as a white box over it.

    Replacing a signature removes the old file; DELETE takes it down, and the
    receipts go back to their blank ruled line — never to a broken image.
    """

    permission_classes = [IsAuthenticated]

    #: A signature printed at ~45 mm wide is sharp at this size already.
    MAX_EDGE = 900
    #: Beyond this a file was never a scan of a signature.
    MAX_UPLOAD_BYTES = 5 * 1024 * 1024
    #: A drawn pad posts its picture as a data URL, not as a file.
    DATA_URL_PATTERN = re.compile(r'^data:image/(png|jpeg|jpg|webp);base64,(?P<data>[A-Za-z0-9+/=\s]+)$', re.IGNORECASE)

    @staticmethod
    def _refusal(message):
        return Response({'signature': message}, status=status.HTTP_400_BAD_REQUEST)

    def _picture(self, request):
        """The submitted picture bytes, or a refusal response."""
        upload = request.FILES.get('signature')
        if upload is not None:
            if upload.size > self.MAX_UPLOAD_BYTES:
                return None, self._refusal('That picture is too large — 5 MB at most.')
            if not IMAGE_SUFFIX_PATTERN.search(upload.name or ''):
                return None, self._refusal('That file is not an image.')
            return upload.read(), None

        drawn = (request.data.get('signature_data') or '') if isinstance(request.data, dict) else ''
        if not drawn:
            return None, self._refusal('Choose a picture to upload, or draw your signature first.')
        match = self.DATA_URL_PATTERN.match(str(drawn).strip())
        if not match:
            return None, self._refusal('That drawing is not a picture.')
        try:
            payload = base64.b64decode(match.group('data'), validate=False)
        except (ValueError, TypeError):
            return None, self._refusal('That drawing is not a picture.')
        if len(payload) > self.MAX_UPLOAD_BYTES:
            return None, self._refusal('That picture is too large — 5 MB at most.')
        return payload, None

    def post(self, request):
        profile = MemberProfile.objects.filter(user=request.user).first()
        office = office_for(profile)
        if not office:
            return Response(
                {'signature': 'Only the treasurer and the first elder sign the church\'s receipt book.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        payload, refusal = self._picture(request)
        if refusal is not None:
            return refusal

        try:
            with Image.open(io.BytesIO(payload)) as opened:
                image = ImageOps.exif_transpose(opened)
                # A drawn signature arrives with a transparent page and ink
                # on it; a photographed slip arrives as paper. Both are kept
                # as PNG — the alpha where there is one, greyscale ink where
                # there is not — so the printer can lay the scrawl straight
                # on the line.
                if image.mode in ('RGBA', 'LA', 'P'):
                    image = image.convert('RGBA')
                else:
                    image = image.convert('L')
                image.thumbnail((self.MAX_EDGE, self.MAX_EDGE))
                buffer = io.BytesIO()
                image.save(buffer, format='PNG', optimize=True)
        except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError):
            return self._refusal('That file is not an image.')

        if profile.signature:
            # Stored names carry a random suffix per upload, so the old file
            # must go first or every replace leaves the last one on disk.
            profile.signature.delete(save=False)
        profile.signature = ''
        # A fresh token per upload keeps every signature on its own URL: a
        # replaced scrawl must never come back from a cached one.
        profile.signature.save(
            f'signature-{request.user.pk}-{secrets.token_hex(4)}.png',
            ContentFile(buffer.getvalue()),
            save=True,
        )
        return Response({'signature_url': profile.signature_url, 'office': office})

    def delete(self, request):
        profile = MemberProfile.objects.filter(user=request.user).first()
        if profile and profile.signature:
            profile.signature.delete(save=False)
            profile.signature = ''
            profile.save(update_fields=['signature'])
        return Response({'signature_url': '', 'office': office_for(profile)})


def send_email_change_verification(user, change_request):
    church_name = current_church_name()
    name = user.first_name or user.username or 'there'
    send_mail(
        f'Verify your new email address — {church_name_plain(church_name)}',
        f"Hello {name},\n\n"
        f"You requested to change the email address on your church account to {change_request.new_email}.\n\n"
        f"Your verification code is:\n\n{change_request.raw_code}\n\n"
        f"Enter this code on your profile page to confirm your new email address. "
        f"It is valid for 30 minutes.\n\n"
        f"If you did not request this change, you can safely ignore this email.\n\n"
        f"Warm regards,\n{church_name}",
        sender_for(IDENTITY),
        [change_request.new_email],
        connection=connection_for(IDENTITY),
        fail_silently=False,
    )


class EmailChangeRequestView(APIView):
    """Request a verification code to change account email."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = MemberEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        raw_email = serializer.validated_data.get('email', '').strip()
        if not raw_email:
            return Response({'email': 'Enter an email address.'}, status=status.HTTP_400_BAD_REQUEST)
        new_email = raw_email.lower()

        if new_email == (request.user.email or '').strip().lower():
            return Response({'email': 'This is already your email address.'}, status=status.HTTP_400_BAD_REQUEST)

        if User.objects.filter(email__iexact=new_email).exclude(pk=request.user.pk).exists():
            return Response({'email': 'An account already exists with this email address.'}, status=status.HTTP_400_BAD_REQUEST)

        # Invalidate any previous unverified requests for this user
        EmailChangeRequest.objects.filter(user=request.user, verified=False).delete()

        change_request = EmailChangeRequest(
            user=request.user,
            new_email=new_email,
            expires_at=timezone.now() + timedelta(minutes=30),
        )
        change_request.set_code()
        change_request.save()

        try:
            send_email_change_verification(request.user, change_request)
        except Exception:
            pass

        return Response({
            'message': f'A verification code has been sent to {new_email}. Enter it to confirm your new email address.',
            'pending_email': new_email,
        })


class EmailChangeVerifyView(APIView):
    """Verify code and update account email."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        code = str(request.data.get('code') or '').strip()
        if not code:
            return Response({'code': 'Enter the verification code.'}, status=status.HTTP_400_BAD_REQUEST)

        pending = (
            EmailChangeRequest.objects.filter(user=request.user, verified=False)
            .order_by('-created_at')
            .first()
        )
        if not pending or pending.is_expired():
            return Response(
                {'detail': 'This verification code is invalid or expired. Please request a new one.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not pending.check_code(code):
            return Response(
                {'detail': 'This verification code is invalid or expired.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if User.objects.filter(email__iexact=pending.new_email).exclude(pk=request.user.pk).exists():
            return Response(
                {'detail': 'An account already exists with this email address.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        request.user.email = pending.new_email
        request.user.save(update_fields=['email'])
        pending.verified = True
        pending.save(update_fields=['verified'])

        return Response({
            'message': 'Your email address has been updated successfully.',
            'email': request.user.email,
        })


class EmailChangeCancelView(APIView):
    """Cancel a pending email change request."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        EmailChangeRequest.objects.filter(user=request.user, verified=False).delete()
        return Response({'message': 'Pending email change cancelled.'})


class ProfileUpdateView(APIView):
    """The forced profile update: sex, gifts, ministry and disability.

    Members whose sign-in response says ``profile_update_pending`` land here
    before anything else. The endpoint only accepts those four fields, so the
    form can never quietly write something else, and it clears the pending
    flag only once every field carries a value — an empty gifts box cannot
    dismiss the request.

    Sex is set once. It is a church record — the ministry register and its
    reports read it — not a preference to be revised, so a member may confirm
    the value on record but never rewrite it. A genuine clerical error is the
    office's to correct, through the change request the member approves.
    """

    permission_classes = [IsAuthenticated]

    MINISTRY_VALUES = {code for code, _label in MemberProfile.MINISTRY_CHOICES}
    DEPARTMENT_VALUES = {code for code, _label in MemberProfile.DEPARTMENT_CHOICES}
    # The ministry column keeps its four legacy codes, because the announcement
    # audiences address "Adventist Men", "Adventist Women" and "Young Adults"
    # by exactly those codes. The pickers, though, offer the church's real areas
    # — so a modern pick is accepted and folded back where a legacy code exists.
    LEGACY_MINISTRY_FOR_AREA = {
        'amm': 'adventist_men',
        'awm': 'adventist_women',
        'aym': 'young_adults',
        'ambassadors': 'ambassadors',
    }

    @staticmethod
    def _area_codes(group):
        """The codes the picker for one heading can offer: the church's own
        areas as the desks file them, which is what the form reads."""
        return set(
            Department.objects.filter(group=group, is_active=True).values_list('code', flat=True)
        )

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
            submitted_gender = as_text(request.data.get('gender'))[:20]
            recorded_gender = (profile.gender or '').strip()
            if not recorded_gender:
                # First and only time the member sets it.
                profile.gender = submitted_gender
            elif submitted_gender and submitted_gender != recorded_gender:
                return Response(
                    {
                        'gender': 'Your sex is already on record and cannot be changed here. '
                        'Ask the church office to correct it.',
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
        if 'gifts' in request.data:
            profile.gifts = as_text(request.data.get('gifts'))
        if 'ministry' in request.data:
            ministry = as_text(request.data.get('ministry'))
            # The member picks from the ministry list the church itself keeps,
            # and a pick from that very list used to be refused here: the two
            # legacy columns only ever knew four codes each, so "Chaplaincy"
            # answered "Choose one of the listed ministries" — after it had
            # been chosen from exactly that list.
            ministry_values = (
                self.MINISTRY_VALUES
                | set(self.LEGACY_MINISTRY_FOR_AREA)
                | self._area_codes('ministry')
            )
            if ministry and ministry not in ministry_values:
                return Response({'ministry': 'Choose one of the listed ministries.'}, status=status.HTTP_400_BAD_REQUEST)
            ministry = self.LEGACY_MINISTRY_FOR_AREA.get(ministry, ministry)
            profile.ministry = ministry[:30] if ministry else ''
        if 'department' in request.data:
            department = as_text(request.data.get('department'))
            # The same page, the same picker, the same refusal — Teens and
            # Ambassadors are age-group rows, not one of the five old codes.
            if (
                department
                and department not in self.DEPARTMENT_VALUES
                and department not in self._area_codes('department')
            ):
                return Response({'department': 'Choose one of the listed departments.'}, status=status.HTTP_400_BAD_REQUEST)
            profile.department = department[:30] if department else ''
        if 'department_ref' in request.data:
            ref_code = as_text(request.data.get('department_ref'))
            if ref_code:
                ref_row = Department.objects.filter(code=ref_code, is_active=True).first()
                if ref_row is None:
                    return Response({'department_ref': 'Choose one of the listed departments.'}, status=status.HTTP_400_BAD_REQUEST)
                profile.department_ref = ref_row
            else:
                profile.department_ref = None
        if 'ministries' in request.data:
            raw_ministries = request.data.get('ministries')
            wanted = (
                raw_ministries
                if isinstance(raw_ministries, list)
                else [part.strip() for part in str(raw_ministries or '').split(',') if part.strip()]
            )
            ministry_codes = [str(code).strip() for code in wanted if str(code).strip()]
            ministry_rows = list(Department.objects.filter(code__in=ministry_codes, is_active=True))
            if len(ministry_rows) != len(set(ministry_codes)):
                return Response({'ministries': 'Choose from the listed ministries.'}, status=status.HTTP_400_BAD_REQUEST)
            profile.save()
            profile.ministries.set(ministry_rows)
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
        # transparency. Gifts given FOR the member are part of their record
        # too — a spouse's tithe counts on the spouse's statement.
        statuses = ['completed']
        if self.request.query_params.get('include_failed') in ('1', 'true'):
            statuses = ['completed', 'failed', 'cancelled']
        return Contribution.objects.filter(
            Q(member=self.request.user) | Q(honoree=self.request.user),
            status__in=statuses,
        ).order_by('-created_at')


class GivingChangeRequestView(APIView):
    """A giver's reappropriation/reversal requests and Treasury's review queue."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk=None):
        if pk is not None:
            # The member UI only needs to know whether it may offer a new ask.
            rows = GivingChangeRequest.objects.filter(
                contribution_id=pk, requested_by=request.user,
            ).order_by('-created_at')
        else:
            if not is_treasurer_or_admin(request.user):
                raise PermissionDenied('Only church treasurers or administrators can review giving requests.')
            rows = GivingChangeRequest.objects.select_related('contribution', 'requested_by', 'decided_by').all()
        return Response({'requests': [self._row(row) for row in rows]})

    def post(self, request, pk=None):
        if pk is not None:
            return self._create(request, pk)
        return self._review(request)

    @staticmethod
    def _row(row):
        contribution = row.contribution
        return {
            'id': row.id,
            'type': row.request_type,
            'status': row.status,
            'contribution_id': contribution.id,
            'amount': str(contribution.amount),
            'current_purpose': contribution.purpose,
            'proposed_purpose': row.proposed_purpose,
            'receipt_number': contribution.mpesa_receipt_number or contribution.paystack_reference or f'CONTRIB-{contribution.id}',
            'requested_by': giver_display_name('', member=row.requested_by),
            'reply': row.reply,
            'created_at': row.created_at,
            'decided_at': row.decided_at,
        }

    def _create(self, request, pk):
        contribution = Contribution.objects.filter(pk=pk, status='completed', member=request.user).first()
        if contribution is None:
            return Response({'detail': 'Only the giver may request a change to a completed giving.'}, status=status.HTTP_404_NOT_FOUND)
        request_type = str(request.data.get('type') or '').strip()
        if request_type not in ('reappropriate', 'reverse'):
            return Response({'detail': 'Choose reappropriate or reverse.'}, status=status.HTTP_400_BAD_REQUEST)
        proposed_purpose = str(request.data.get('purpose') or '').strip()
        if request_type == 'reappropriate':
            account = account_for_purpose(proposed_purpose)
            if account is None:
                return Response({'detail': 'Choose a valid giving purpose.'}, status=status.HTTP_400_BAD_REQUEST)
            proposed_purpose = account.description or account.name
            if proposed_purpose == contribution.purpose:
                return Response({'detail': 'Choose a different purpose.'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            proposed_purpose = ''
        if GivingChangeRequest.objects.filter(contribution=contribution, status='pending').exists():
            return Response({'detail': 'A request for this giving is already waiting for Treasury.'}, status=status.HTTP_400_BAD_REQUEST)
        row = GivingChangeRequest.objects.create(
            contribution=contribution, requested_by=request.user,
            request_type=request_type, proposed_purpose=proposed_purpose,
        )
        audience = User.objects.filter(Q(member_profile__role='treasurer') | Q(member_profile__role='admin'), is_active=True).distinct()
        label = 'reappropriation' if request_type == 'reappropriate' else 'reversal'
        detail = f"{giver_display_name('', member=request.user)} requested {label} of KES {contribution.amount:,.2f} ({contribution.purpose})."
        ChurchNotification.objects.bulk_create([
            ChurchNotification(user=person, title='Giving request awaiting review', message=detail, link='/administration/treasury?view=requests')
            for person in audience
        ])
        return Response({'request': self._row(row), 'detail': 'Your request has been sent to Treasury.'}, status=status.HTTP_201_CREATED)

    def _review(self, request):
        if not is_treasurer_or_admin(request.user):
            raise PermissionDenied('Only church treasurers or administrators can review giving requests.')
        row = GivingChangeRequest.objects.select_related('contribution', 'requested_by').filter(
            pk=request.data.get('id'), status='pending',
        ).first()
        if row is None:
            return Response({'detail': 'That request is no longer pending.'}, status=status.HTTP_404_NOT_FOUND)
        action = str(request.data.get('action') or '').strip()
        reply = str(request.data.get('reply') or '').strip()[:255]
        if action == 'decline':
            row.status, row.decided_by, row.decided_at = 'declined', request.user, timezone.now()
            row.reply = reply or 'The request could not be approved.'
            row.save(update_fields=['status', 'decided_by', 'decided_at', 'reply'])
        elif action == 'approve':
            with transaction.atomic():
                contribution = Contribution.objects.select_for_update().get(pk=row.contribution_id)
                source = TreasuryAccount.objects.select_for_update().filter(pk=getattr(account_for_purpose(contribution.purpose), 'pk', None)).first()
                if source is None:
                    return Response({'detail': 'The original giving account no longer exists.'}, status=status.HTTP_400_BAD_REQUEST)
                if source.balance < contribution.amount:
                    return Response({'detail': f'The {source.description or source.name} account no longer holds enough money to action this request.'}, status=status.HTTP_400_BAD_REQUEST)
                reference = contribution.mpesa_receipt_number or contribution.paystack_reference or f'CONTRIB-{contribution.id}'
                if row.request_type == 'reappropriate':
                    destination = TreasuryAccount.objects.select_for_update().filter(pk=getattr(account_for_purpose(row.proposed_purpose), 'pk', None)).first()
                    if destination is None:
                        return Response({'detail': 'The requested giving purpose no longer exists.'}, status=status.HTTP_400_BAD_REQUEST)
                    source.balance -= contribution.amount
                    destination.balance += contribution.amount
                    source.save(update_fields=['balance'])
                    destination.save(update_fields=['balance'])
                    TreasuryAccountTransaction.objects.create(account=source, transaction_type='debit', amount=contribution.amount, description=f'Reappropriated giving to {destination.description or destination.name}'[:255], reference=f'REAPP-{reference}'[:100], created_by=request.user)
                    TreasuryAccountTransaction.objects.create(account=destination, transaction_type='credit', amount=contribution.amount, description=f'Reappropriated giving from {source.description or source.name}'[:255], reference=f'REAPP-{reference}'[:100], created_by=request.user)
                    contribution.purpose = destination.description or destination.name
                    contribution.save(update_fields=['purpose'])
                else:
                    source.balance -= contribution.amount
                    source.save(update_fields=['balance'])
                    TreasuryAccountTransaction.objects.create(account=source, transaction_type='debit', amount=contribution.amount, description='Reversal of giver-requested contribution', reference=f'REV-{reference}'[:100], created_by=request.user)
                    contribution.status = 'cancelled'
                    contribution.save(update_fields=['status'])
                row.status, row.decided_by, row.decided_at, row.reply = 'approved', request.user, timezone.now(), reply
                row.save(update_fields=['status', 'decided_by', 'decided_at', 'reply'])
        else:
            return Response({'detail': 'Unknown action. Use approve or decline.'}, status=status.HTTP_400_BAD_REQUEST)
        ChurchNotification.objects.create(
            user=row.requested_by,
            title=f"Giving {row.request_type} request {row.status}",
            message=row.reply or f"Your request concerning KES {row.contribution.amount:,.2f} has been {row.status}.",
            link='/member/givings',
        )
        return Response({'request': self._row(row)})


class MemberThermalReceiptView(APIView):
    """A thermal-style PDF receipt for one giving, downloaded by its owner.

    The URL names a contribution row; the receipt covers the whole payment —
    when a giver split one gift across accounts, every line sharing the
    payment group prints itemised with a total, the way the treasurer's
    ledger keeps it. Only the giver (or an office holder) may fetch it.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        row = Contribution.objects.filter(pk=pk).select_related('member', 'campaign').first()
        if row is None or row.status != 'completed':
            # A failed or pending payment never became money, so it has no
            # receipt to give — for anyone.
            return Response({'detail': 'Giving not found.'}, status=status.HTTP_404_NOT_FOUND)

        profile = getattr(request.user, 'member_profile', None)
        is_office = bool(profile and profile.has_role('admin', 'treasurer', 'elder'))
        # The honoree may fetch it too: the gift is written on their record,
        # and the letter that told them so now needs the paper to match.
        if row.member_id != request.user.id and row.honoree_id != request.user.id and not is_office:
            return Response({'detail': 'This receipt belongs to another giver.'}, status=status.HTTP_404_NOT_FOUND)

        # One payment may be several ledger lines (a split gift): every line
        # of the group appears on the one receipt.
        if row.payment_group:
            lines = list(
                Contribution.objects.filter(payment_group=row.payment_group, status='completed').order_by('id')
            )
        else:
            lines = [row]
        lines = [r for r in lines if r.status == 'completed'] or [row]

        donor = row.member or request.user
        donor_name = f"{donor.first_name} {donor.last_name}".strip() or row.donor_name or donor.username
        # The receipt letterhead is the short form: SDA Church Loma Linda, no town.
        church_name = church_name_short()

        pdf_bytes = generate_contribution_thermal_receipt_pdf(
            church_name=church_name,
            donor_name=donor_name,
            contributions=lines,
            signatures=receipt_signatures(),
        )
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        stamp = (row.paid_at or row.created_at).strftime('%Y%m%d')
        response['Content-Disposition'] = f'attachment; filename="Giving_Receipt_{stamp}_{row.pk}.pdf"'
        return response


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

        # No address was given, so the account carries none. An invented
        # address is a mailbox that does not exist — a receipt sent to it is a
        # receipt nobody receives, and the desk cannot tell the two apart.
        user = User.objects.create(
            username=username,
            email=donor_email,
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
        self._require_finance_manager()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        allocations = serializer.validated_data.get('allocations')
        send_sms = str(request.data.get('send_sms', 'true')).lower() in ('true', '1')
        send_email = str(request.data.get('send_email', 'true')).lower() in ('true', '1')

        if allocations:
            rows, delivery_message = self._record_split(
                serializer.validated_data, allocations, send_sms=send_sms, send_email=send_email,
            )
        else:
            cash = serializer.save(received_by=request.user)
            delivery_message = self._finish_receipt(cash, send_sms=send_sms, send_email=send_email)
            rows = [cash]

        payload = self.get_serializer(rows[0]).data
        payload['receipt_delivery_message'] = delivery_message
        return Response(payload, status=status.HTTP_201_CREATED)

    def _number_receipt(self, row):
        if not row.receipt_number:
            row.receipt_number = f"REC-{timezone.localdate().strftime('%Y%m')}-{row.id:04d}"
            row.save(update_fields=['receipt_number'])

    def _finish_receipt(self, cash, *, send_sms, send_email):
        """Number, deliver and credit one desk receipt; say where it went."""
        self._number_receipt(cash)
        delivery_message = ''
        if cash.entry_type == 'individual':
            if cash.donor_name or cash.giver_phone or cash.giver_email:
                ensure_giver_profile(cash.donor_name, cash.giver_phone, cash.giver_email)
            delivery = send_cash_receipt(cash, send_sms=send_sms, send_email=send_email)
            delivery_message = cash_receipt_delivery_message(
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
        giver = giver_display_name(
            cash.donor_name,
            email=cash.giver_email,
            phone=cash.giver_phone,
        )
        if giver and giver.lower() != 'anonymous giver':
            cash_desc = f"{giver} — {cash.get_payment_method_display()} ({cash.purpose})"
        else:
            cash_desc = f"Contribution — {cash.get_payment_method_display()} ({cash.purpose})"
        credit_account(
            purpose=cash.purpose,
            amount=cash.amount,
            description=cash_desc,
            reference=cash.receipt_number or f'CASH-{cash.id}',
            created_by=self.request.user,
        )
        return delivery_message

    def _record_split(self, validated_data, allocations, *, send_sms, send_email):
        """One desk entry written as one row per giving purpose, receipted once.

        The rows share a payment group and a single receipt number, so the
        ledger reads the same sum the treasurer took in, every named account
        is credited its own part, and the giver gets one letter listing the
        split rather than one per purpose.
        """
        shared = {key: value for key, value in validated_data.items() if key not in ('amount', 'purpose', 'allocations')}
        entry_type = shared.pop('entry_type', 'individual')
        is_anonymous = entry_type == 'anonymous'
        group = uuid.uuid4()
        rows = [
            CashContribution.objects.create(
                payment_group=group,
                purpose=allocation['purpose'].strip(),
                amount=allocation['amount'],
                entry_type=entry_type,
                donor_name='Anonymous Giver' if is_anonymous and not (shared.get('donor_name') or '').strip() else shared.get('donor_name', ''),
                received_by=self.request.user,
                **{key: value for key, value in shared.items() if key != 'donor_name'},
            )
            for allocation in allocations
        ]
        receipt_number = f"REC-{timezone.localdate().strftime('%Y%m')}-{rows[0].id:04d}"
        CashContribution.objects.filter(pk__in=[row.pk for row in rows]).update(receipt_number=receipt_number)
        for row in rows:
            row.receipt_number = receipt_number

        first = rows[0]
        delivery_message = ''
        if entry_type == 'individual':
            if first.donor_name or first.giver_phone or first.giver_email:
                ensure_giver_profile(first.donor_name, first.giver_phone, first.giver_email)
            delivery = send_grouped_cash_receipt(rows, send_sms=send_sms, send_email=send_email)
            delivery_message = cash_receipt_delivery_message(
                delivery,
                email_requested=send_email,
                sms_requested=send_sms,
                has_email=bool(first.giver_email),
                has_phone=bool(first.giver_phone),
            )
        for row in rows:
            giver = giver_display_name(
                row.donor_name,
                email=row.giver_email,
                phone=row.giver_phone,
            )
            if giver and giver.lower() != 'anonymous giver':
                row_desc = f"{giver} — {row.get_payment_method_display()} ({row.purpose})"
            else:
                row_desc = f"Contribution — {row.get_payment_method_display()} ({row.purpose})"
            credit_account(
                purpose=row.purpose,
                amount=row.amount,
                description=row_desc,
                reference=receipt_number,
                created_by=self.request.user,
            )
        return rows, delivery_message


class ContributionTreasuryView(APIView):
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
            # One account reads one name — the same folding the givings
            # report applies, so the summary cannot split one account into
            # two rows by spelling ('AYM' beside 'Adventist Youth Ministries').
            p = canonical_purpose_name(c.purpose)
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
            p = canonical_purpose_name(c.purpose)
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

        treasury = ContributionTreasury.objects.filter(treasury_date__range=(start_date, end_date)).order_by('-treasury_date').first() if start_date == end_date else None
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
            'treasury': ContributionTreasurySerializer(treasury).data if treasury else None,
        }
        return Response(result)

    def get(self, request):
        self._require_finance_manager(request)
        start_date, end_date = self._selected_date_range(request)
        return self._response(start_date, end_date)

    def put(self, request):
        self._require_finance_manager(request)
        start_date, end_date = self._selected_date_range(request)
        treasury, _ = ContributionTreasury.objects.get_or_create(
            treasury_date=end_date,
            defaults={'reconciled_by': request.user},
        )
        serializer = ContributionTreasurySerializer(treasury, data=request.data, partial=True)
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
    elif "aym" in p_str or "adventist youth" in p_str:
        # The summary's one row for the youth account — 'AYM', folded —
        # still opens on the spellings the ledgers carried before the fold:
        # 'AYM' beside 'Adventist Youth Ministry' beside 'Youth'.
        return Q(purpose__icontains="aym") | Q(purpose__icontains="adventist youth") | Q(purpose__iexact="youth")
    elif "sabbat" in p_str:
        # The Sabbath School row, folded in the summary, opens the same
        # family here: 'Sabbat School' typed with the 'h' off beside
        # 'sabbath school' beside the church's own title and its M-Pesa
        # short name. '13th Sabbath' matched earlier and stays its own
        # account — the branch reaches only what 'sabbat' names with the
        # school account, never the 13th-Sabbath offering.
        return (
            Q(purpose__icontains="sabbat school") | Q(purpose__icontains="sabbath school")
            | Q(purpose__icontains="sabbat sch") | Q(purpose__icontains="sabbath sch")
            | Q(purpose__icontains="sabbat scho") | Q(purpose__icontains="sabbath scho")
            | Q(purpose__icontains="sabbatscho") | Q(purpose__icontains="sabbathsch")
        )
    elif "others" in p_str or "other" in p_str:
        known_keywords = ["tithe", "combined", "offertory", "camp", "msamaria", "evangelism", "station", "13th", "thirteenth", "building", "development", "lcb", "youth"]
        q = Q()
        for kw in known_keywords:
            q |= Q(purpose__icontains=kw)
        return ~q
    else:
        q = Q(purpose__iexact=purpose_param) | Q(purpose__icontains=purpose_param)
        # The account read by the request reaches the rows keyed in other
        # spellings of the same fund: its description, and the drives opened
        # on it whose names a giver keyed their gift with.
        account = account_for_purpose(purpose_param)
        if account is not None:
            from .treasury import account_wordings
            for wording in account_wordings(account):
                q |= Q(purpose__iexact=wording) | Q(purpose__icontains=wording)
        return q


def giving_window(params):
    """The date window a givings query means, as (start, end) dates.

    Read the same way by every caller — the ledger's own list, the summary
    drill-down, and the Failed tab's badge — so a filter cannot mean one
    thing on the list and another on the counter beside it. Defaults mirror
    the ledger's: no start date reads the last thirty days ending at `to`,
    a single `date` is that day alone, and a reversed pair is the same span.
    """
    from_val = params.get('from_date') or params.get('from')
    to_val = params.get('to_date') or params.get('to')
    date_val = params.get('date')

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
    return start_date, end_date


def digital_window_q(start_date, end_date):
    """Digital rows a window holds, by the day that day actually is.

    Money is counted by the day it arrived; an attempt that never arrived
    carries no `paid_at`, so it is counted by the day it was made. September's
    window therefore holds September's attempts and cannot borrow October's —
    the one rule every windowed givings read goes through.
    """
    return (
        Q(paid_at__date__gte=start_date, paid_at__date__lte=end_date)
        | Q(paid_at__isnull=True, created_at__date__gte=start_date, created_at__date__lte=end_date)
    )


class PurposeContributionsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_finance_manager(request.user):
            raise PermissionDenied('Only finance managers can view contribution details.')

        # The ledger's Failed toggle: failed and cancelled attempts are the
        # story of what never arrived, so the desk asks for them explicitly;
        # every other caller (the summary drill-down, the department ledger)
        # keeps reading only money that actually came in.
        include_failed = request.query_params.get('include_failed') == '1'
        digital_statuses = ('completed', 'failed', 'cancelled') if include_failed else ('completed',)

        purpose = request.query_params.get('purpose', '').strip()
        start_date, end_date = giving_window(request.query_params)

        digital_filter = Q(status__in=digital_statuses, giving_type='financial') & digital_window_q(start_date, end_date)
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
                # The panel names the fund, not the keying: the raw wording
                # may be the drive's name read off its page, and the desk
                # reads one account whether the gift was keyed 'LCB',
                # 'Local Church Budget' or the drive's own name.
                'purpose': display_purpose(c.purpose),
                'amount': str(c.amount),
                'donor_name': donor_name,
                'giver_phone': c.phone_number,
                'giver_email': c.donor_email or (c.member.email if c.member else ''),
                # The account behind the gift, when it is a member's: the
                # desk's Chat action opens a direct thread with them.
                'member_id': c.member_id,
                'payment_method': method_display,
                'receipt_number': c.mpesa_receipt_number or c.paystack_reference or f"REC-DIG-{c.id}",
                'received_at': c.paid_at.isoformat() if c.paid_at else c.created_at.isoformat(),
                'receipt_sent_at': c.receipt_sent_at.isoformat() if c.receipt_sent_at else None,
                # A payment still held for the treasurer's assignment stands
                # both in Individual Givings (under the account name the giver
                # typed) and on the Unassigned desk until it is filed.
                'needs_review': c.needs_review,
                'status': c.get_status_display(),
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
                'purpose': display_purpose(c.purpose),
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
        # One fund, one row: keyed wordings of the same account ('LCB',
        # 'Local Church Budget', a drive's name) fold onto the account the
        # money rests in, the way every other list of gifts reads.
        folded = {}
        for row in rows:
            label = display_purpose(row['purpose'])
            entry = folded.setdefault(label, {'total': Decimal('0'), 'count': 0})
            entry['total'] += Decimal(str(row['total'] or 0))
            entry['count'] += row['count']
        ranked = sorted(folded.items(), key=lambda item: item[1]['total'], reverse=True)
        return Response([
            {
                'category': label,
                'label': label,
                'total': float(item['total']),
                'count': item['count'],
            }
            for label, item in ranked
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
                'category': display_purpose(row.purpose),
                'label': display_purpose(row.purpose),
                'amount': float(row.amount),
                'donor_name': giver_display_name(row.donor_name, member=row.member, email=row.donor_email, phone=row.phone_number),
                'created_at': moment.isoformat(),
            })
        for row in CashContribution.objects.filter(entry_type='individual').order_by('-created_at')[:12]:
            items.append({
                'sort_at': row.created_at,
                'id': -row.id,
                'category': display_purpose(row.purpose),
                'label': display_purpose(row.purpose),
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


def is_church_office(user):
    """Who reads the congregation's own figures: the church's offices.

    The pulse counts people, not money, so it follows the office gate the
    department desks use — admin, elder, clerk, pastor — rather than the
    treasury one. An elder shepherds the roll and answers the requests, so the
    roll and the queue are theirs to see; the treasurer reads the same
    congregation through the finance panel instead.
    """
    if user is None or not user.is_authenticated:
        return False
    if user.is_staff or user.is_superuser:
        return True
    return department_office_profile(user) is not None


#: The statuses that mean nobody has answered a request yet, per desk: a
#: request waits until somebody has said yes, said no, or marked it done. The
#: requests desk and the sidebar badge follow the same rule on the frontend
#: (see ``reviewBucket`` in its request vocabulary), so the three agree.
#:
#: Welfare is the exception and has no status at all — a submission is an idea,
#: a request for prayer or an offer of partnership, and every one of them is
#: still somebody's to pick up.
WAITING_JOIN_STATUSES = ('verification_pending', 'pending')
WAITING_PRAYER_STATUSES = ('new',)
WAITING_VISITATION_STATUSES = ('pending',)
WAITING_DEDICATION_STATUSES = ('pending',)
WAITING_TRANSFER_STATUSES = ('pending', 'under_review')


class ChurchPulseView(APIView):
    """The congregation's own numbers, for the offices that shepherd it.

    An elder should open the dashboard and see the church rather than a
    spreadsheet: how many people are on the roll and in its folds, and what the
    desks still owe somebody an answer on. Two things it deliberately is not —
    it carries no money (that is the finance panel, and its gate), and it names
    nobody: a count of prayer requests, never who asked one.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_church_office(request.user):
            return Response(
                {'detail': 'Only church officers can view the congregation\u2019s figures.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        today = timezone.localdate()
        month_start = _month_start(today)
        year_start = today.replace(month=1, day=1)

        # The roster the register and the printed roll use, so "on the roll"
        # means the same thing here as on every other screen.
        roster = roster_queryset()
        profiles = MemberProfile.objects.filter(user__in=roster)
        members = {
            # The roll proper: members who are still members. Someone
            # disfellowshipped keeps their account and moves to ex_members, so
            # the two counts never describe the same person twice.
            'total': profiles.filter(account_type='member', is_disfellowshipped=False).count(),
            'friends': profiles.filter(account_type='friend').count(),
            'sabbath_school': profiles.filter(account_type='sabbath_school').count(),
            'ex_members': profiles.filter(is_disfellowshipped=True).count(),
            'new_this_month': roster.filter(date_joined__date__gte=month_start).count(),
            'new_this_year': roster.filter(date_joined__date__gte=year_start).count(),
            'pending_invitations': Invitation.objects.filter(status='pending').count(),
        }

        # One row per desk, each telling the same two things: what is still
        # unanswered, and how much arrived this month.
        desks = [
            {
                'key': 'join',
                'label': 'Join requests',
                'waiting': EnrollmentRequest.objects.filter(status__in=WAITING_JOIN_STATUSES).count(),
                'this_month': EnrollmentRequest.objects.filter(created_at__date__gte=month_start).count(),
            },
            {
                'key': 'prayer',
                'label': 'Prayer requests',
                'waiting': PrayerRequest.objects.filter(status__in=WAITING_PRAYER_STATUSES).count(),
                'this_month': PrayerRequest.objects.filter(created_at__date__gte=month_start).count(),
            },
            {
                'key': 'visitation',
                'label': 'Visitation',
                'waiting': VisitationRequest.objects.filter(status__in=WAITING_VISITATION_STATUSES).count(),
                'this_month': VisitationRequest.objects.filter(created_at__date__gte=month_start).count(),
            },
            {
                'key': 'dedication',
                'label': 'Child dedications',
                'waiting': ChildDedicationRequest.objects.filter(status__in=WAITING_DEDICATION_STATUSES).count(),
                'this_month': ChildDedicationRequest.objects.filter(created_at__date__gte=month_start).count(),
            },
            {
                'key': 'welfare',
                'label': 'Welfare & support',
                'waiting': SupportSubmission.objects.count(),
                'this_month': SupportSubmission.objects.filter(created_at__date__gte=month_start).count(),
            },
            {
                'key': 'transfer',
                'label': 'Membership transfers',
                'waiting': MembershipTransferRequest.objects.filter(status__in=WAITING_TRANSFER_STATUSES).count(),
                'this_month': MembershipTransferRequest.objects.filter(created_at__date__gte=month_start).count(),
            },
        ]

        return Response({
            'as_of': today.isoformat(),
            'month_label': month_start.strftime('%B %Y'),
            'members': members,
            'requests': {
                'waiting_total': sum(desk['waiting'] for desk in desks),
                'this_month_total': sum(desk['this_month'] for desk in desks),
                'desks': desks,
            },
        })


def receipt_phone_is_valid(phone):
    """A phone shaped enough to hand to the SMS gateway.

    The resend dialog lets the desk correct a giver's number, and a typo
    would silently send the receipt to a stranger's line — so the digits
    are counted: anything phone-shaped (9 to 15 digits, the international
    range) passes, and junk is refused while nothing has been sent yet.
    """
    digits = re.sub(r'\D', '', phone or '')
    return 9 <= len(digits) <= 15


class ResendContributionReceiptView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not is_finance_manager(request.user):
            raise PermissionDenied('Only finance managers can resend receipts.')

        source = request.data.get('source')
        raw_id = request.data.get('id')
        if not source or not raw_id:
            return Response({'detail': 'source and id are required.'}, status=status.HTTP_400_BAD_REQUEST)

        # Which channels the treasurer picked in the resend dialog. Both are
        # on by default — the same default the receipt form itself carries.
        raw_channels = request.data.get('channels')
        if raw_channels is None:
            channels = {'email', 'sms'}
        elif isinstance(raw_channels, (list, tuple)):
            channels = {str(item).strip().lower() for item in raw_channels}
        else:
            channels = {str(raw_channels).strip().lower()}
        send_email = 'email' in channels
        send_sms = 'sms' in channels
        if not send_email and not send_sms:
            return Response(
                {'detail': 'Select email, SMS, or both before resending.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # get_or_create guarantees a settings row exists — first() could
        # return None on a fresh tenant and crash the attribute reads below.
        church_settings = ChurchSettings.objects.get_or_create(pk=1)[0]
        now = timezone.now()

        if source in ['digital']:
            contribution = Contribution.objects.filter(id=raw_id).first()
            if not contribution:
                return Response({'detail': 'Contribution record not found.'}, status=status.HTTP_404_NOT_FOUND)
            if contribution.status != 'completed':
                # A payment that never completed has no receipt to re-tell —
                # and the ledger's Failed view puts these rows one click from
                # the resend button, so the refusal lives server-side too.
                return Response(
                    {'detail': 'Only a completed payment has a receipt to resend.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            receipt_ref = contribution.mpesa_receipt_number or contribution.paystack_reference or f"REC-{contribution.id}"
            donor_name = contribution.donor_name or (contribution.member.get_full_name() if contribution.member else 'Church Member')
            # The desk may correct either contact detail here — the giver
            # says "my email has changed" at the counter, or the row was
            # recorded from a paybill pull whose Safaricom MSISDN came back
            # obfuscated and with no address at all. What the treasurer
            # types is kept on the row, so the correction holds for every
            # later resend; what is left blank stays as the ledger has it.
            supplied_email = (request.data.get('email') or '').strip()
            if supplied_email:
                try:
                    validate_email(supplied_email)
                except Exception:
                    return Response({'detail': 'Enter a valid email address.'}, status=status.HTTP_400_BAD_REQUEST)
            supplied_phone = (request.data.get('phone') or '').strip()
            if supplied_phone and not receipt_phone_is_valid(supplied_phone):
                return Response(
                    {'detail': 'Enter a valid phone number — 9 to 15 digits.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            email = usable_email(supplied_email) or usable_email(contribution.donor_email) or (usable_email(contribution.member.email) if contribution.member else '')
            # A number the confirmations once stored masked must never ride
            # the prefill: send it to the gateway and the receipt refuses.
            phone = supplied_phone or safe_mpesa_phone(contribution.phone_number) or ''
            if not phone and contribution.member:
                profile = getattr(contribution.member, 'member_profile', None)
                phone = getattr(profile, 'phone_number', '') or ''
            if send_email and not email:
                return Response({'detail': 'This giver does not have a verified email address.'}, status=status.HTTP_400_BAD_REQUEST)

            # A copy retells the whole payment, not the one ledger row the
            # desk was handed: a split payment lists every account its lines
            # name and thanks the giver for the statement's full figure —
            # the letter re-cut from the same rows the receipt paper reads.
            from .treasury import ContributionSiblings

            grouped = ContributionSiblings(contribution).rows()
            account_names = []
            for line in grouped:
                if line.purpose and line.purpose not in account_names:
                    account_names.append(line.purpose)
            total_amount = sum((line.amount for line in grouped), Decimal('0'))
            account_display = ' / '.join(account_names)
            amount_display = f"KES {total_amount:,.2f}"
            summary = receipt_summary(account=account_display, amount=amount_display, payment_channel=contribution.get_payment_method_display(), receipt_ref=receipt_ref, date_display=timezone.localtime(contribution.paid_at or contribution.created_at).strftime('%d %B %Y'))
            receipt_message = render_receipt_message(church_settings.default_receipt_message, donor_name, amount_display, account_display)
            # A copy arrives with its paper — the same slip the first letter
            # carried, re-cut from the ledger rows.
            attachment = contribution_receipt_attachment(contribution) if send_email else None
            body = (
                f"{receipt_message}\n\n"
                f"{summary}\n\n"
                f"{receipt_email_signature()}"
            )
            delivery = _deliver_receipt_message(
                subject=f"Receipt Copy — {account_display}",
                body=body,
                email=email if send_email else '',
                phone=phone if send_sms else '',
                # Both channels ticked means both deliveries: the desk's
                # own picker says the receipt rides email and SMS, so the
                # SMS does not stand behind an email that already went.
                both=send_email and send_sms,
                mark_sent=lambda: None,
                attachments=[attachment] if attachment else None,
            )
            sent = bool(delivery['email_sent'] or delivery['sms_sent'])
            # The corrected contacts are kept even if the send itself failed,
            # so the row is finished for good and the next resend needs no
            # typing; the sent stamp follows the delivery.
            updates = []
            if supplied_email and supplied_email != (contribution.donor_email or ''):
                contribution.donor_email = supplied_email
                updates.append('donor_email')
            if supplied_phone and supplied_phone != (contribution.phone_number or ''):
                contribution.phone_number = supplied_phone
                updates.append('phone_number')
            if sent:
                contribution.receipt_sent_at = now
                updates.append('receipt_sent_at')
            if updates:
                contribution.save(update_fields=updates)

        elif source == 'cash':
            cash = CashContribution.objects.filter(id=raw_id).first()
            if not cash:
                return Response({'detail': 'Cash contribution record not found.'}, status=status.HTTP_404_NOT_FOUND)

            receipt_ref = cash.receipt_number or f"CASH-{cash.id}"
            donor_name = cash.donor_name or 'Church Member'
            # A desk receipt is the treasurer's own entry, so they may
            # finish it here: either contact may be supplied or corrected on
            # resend, and what is typed is kept on the row. Without this the
            # row sat at "pending" forever with no way to send it.
            supplied_email = (request.data.get('email') or '').strip()
            if supplied_email:
                try:
                    validate_email(supplied_email)
                except Exception:
                    return Response({'detail': 'Enter a valid email address.'}, status=status.HTTP_400_BAD_REQUEST)
            supplied_phone = (request.data.get('phone') or '').strip()
            if supplied_phone and not receipt_phone_is_valid(supplied_phone):
                return Response(
                    {'detail': 'Enter a valid phone number — 9 to 15 digits.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            email = usable_email(supplied_email) or usable_email(cash.giver_email)
            phone = supplied_phone or (cash.giver_phone or '').strip()
            if send_email and not email:
                return Response(
                    {'detail': "This receipt has no giver's email on file. Enter one to send it."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            amount_display = f"KES {cash.amount:,.2f}"
            body = (
                f"{render_receipt_message(church_settings.default_receipt_message, donor_name, amount_display, cash.purpose)}\n\n"
                f"{receipt_summary(account=cash.purpose, amount=amount_display, payment_channel='Cash', receipt_ref=receipt_ref, date_display=cash.received_on)}\n\n"
                f"{receipt_email_signature()}"
            )
            delivery = _deliver_receipt_message(
                subject=f"Receipt Copy — {cash.purpose}",
                body=body,
                email=email if send_email else '',
                phone=phone if send_sms else '',
                # The desk's own picker: both ticked, both delivered.
                both=send_email and send_sms,
                mark_sent=lambda: None,
            )
            sent = bool(delivery['email_sent'] or delivery['sms_sent'])
            # A contact typed here is kept, so the row is finished for good
            # even if the send itself failed.
            if supplied_email:
                cash.giver_email = supplied_email
            if supplied_phone:
                cash.giver_phone = supplied_phone
            if supplied_email or supplied_phone or sent:
                if sent:
                    cash.receipt_sent_at = now
                cash.save(update_fields=['giver_email', 'giver_phone', 'receipt_sent_at'])
        else:
            return Response({'detail': 'Invalid source.'}, status=status.HTTP_400_BAD_REQUEST)

        detail = cash_receipt_delivery_message(
            delivery,
            email_requested=send_email,
            sms_requested=send_sms,
            has_email=bool(email),
            has_phone=bool(phone),
        )
        return Response({
            'detail': detail,
            'sent': sent,
            'receipt_sent_at': now.isoformat() if sent else None,
        })


class SupportSubmissionView(generics.ListCreateAPIView):
    permission_classes = [AllowAny]
    serializer_class = SupportSubmissionSerializer

    def get_queryset(self):
        user = self.request.user
        if user and user.is_authenticated:
            profile = getattr(user, 'member_profile', None)
            # The welfare leader answers the welfare desk their notices point to.
            if profile and profile.has_role('admin', 'clerk', 'elder', 'pastor', 'welfare_leader'):
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
        # An anonymous gift is nobody's record, but its receipt still has
        # somewhere to go: the signed-in giver's own account address, used
        # for delivery only and never written to the row. A signed-out
        # giver has no verifiable address, so nothing changes for them.
        anonymous_receipt_email = (
            receipt_email_for(request.user) if serializer.validated_data.get('anonymous') else ''
        )
        allocations = serializer.validated_data['allocations']
        # One payment per account line, so the books show which account each part
        # of the gift went to. A single-account gift is simply one line.
        import uuid
        group = uuid.uuid4() if len(allocations) > 1 else None
        prefix_map = {'cash': 'CSH', 'cheque': 'CHQ', 'bank_transfer': 'BNK', 'bank_deposit': 'DEP'}
        prefix = prefix_map.get(method, 'REC')
        created = []
        for row in allocations:
            # An anonymous gift arrives with its name and email already
            # blanked by the serializer, so nothing of the giver's is written
            # to the ledger — the phone it was paid from carries the gift.
            contribution = Contribution.objects.create(
                # An anonymous gift is nobody's record: the phone it was paid
                # from carries it, exactly as the callback path records it.
                member=(
                    request.user
                    if request.user.is_authenticated and not serializer.validated_data.get('anonymous')
                    else None
                ),
                amount=row['amount'],
                giving_type=serializer.validated_data['giving_type'],
                purpose=row['purpose'],
                phone_number=serializer.validated_data['phone_number'],
                donor_name=serializer.validated_data.get('donor_name', ''),
                donor_email=serializer.validated_data.get('donor_email', ''),
                item_description=serializer.validated_data.get('item_description', ''),
                payment_method=method,
                payment_group=group,
                # A gift given for someone is also written on their record.
                honoree=serializer.validated_data.get('honoree'),
                honoree_name=serializer.validated_data.get('honoree_name', ''),
                relationship=serializer.validated_data.get('relationship', ''),
                honoree_phone=serializer.validated_data.get('honoree_phone', ''),
                anonymous=bool(serializer.validated_data.get('anonymous')),
            )
            if contribution.payment_method in ['cash', 'cheque', 'bank_transfer']:
                contribution.status = 'completed'
                contribution.mpesa_receipt_number = f"{prefix}-{uuid.uuid4().hex[:6].upper()}"
                contribution.paid_at = timezone.now()
                contribution.save(update_fields=['status', 'mpesa_receipt_number', 'paid_at'])
                # A split gift's single letter goes out once the whole group
                # exists, after this loop; a single-account gift is receipted
                # here and now.
                if not group:
                    send_contribution_receipt(contribution, receipt_email=anonymous_receipt_email)
                # The honoree's own letter never waits on the group: it is
                # addressed to a different person than the payer's receipt.
                send_honoree_receipt(contribution)
            created.append(contribution)
        if group and any(row.status == 'completed' for row in created):
            send_grouped_contribution_receipts(group, receipt_email=anonymous_receipt_email)
            for row in created:
                send_honoree_receipt(row)
        # A gift made through a request's own link closes that request.
        giving_request = serializer.validated_data.get('giving_request')
        if giving_request is not None and any(row.status == 'completed' for row in created):
            giving_request.status = 'fulfilled'
            giving_request.fulfilled_at = timezone.now()
            giving_request.save(update_fields=['status', 'fulfilled_at'])
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
        # An anonymous gift carries neither: the giver asked not to be tied to
        # it, so the callback records it against the phone alone.
        if request.user and request.user.is_authenticated and not data.get('anonymous'):
            context['member_id'] = request.user.pk
        donor_email = (data.get('donor_email') or '').strip()
        if donor_email:
            context['donor_email'] = donor_email
        # The anonymity stamp rides the signed context, so the callback
        # records the gift without resolving the payer's name or account.
        # Anonymity hides the gift from the giver's *record* — the ledger row
        # carries no name, email or member — but it must not also cost them
        # their receipt: the account's own address rides alongside under its
        # own key, used only to deliver the letter, never written to the row.
        if data.get('anonymous'):
            context['anonymous'] = True
            own_address = receipt_email_for(request.user)
            if own_address:
                context['receipt_email'] = own_address
        item_description = (data.get('item_description') or '').strip()
        if item_description:
            context['item_description'] = item_description
        # Giving for someone travels the same way: the callback writes the
        # gift on the honoree's record and letters their account when the
        # money lands — never before.
        if data.get('honoree') is not None:
            context['honoree_id'] = data['honoree'].pk
        honoree_name = (data.get('honoree_name') or '').strip()
        if honoree_name:
            context['honoree_name'] = honoree_name
        if data.get('relationship'):
            context['relationship'] = data['relationship']
        if data.get('giving_request') is not None:
            context['giving_request_id'] = data['giving_request'].pk
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


def finance_alert_audience():
    """Accounts that must hear when money fails to land on the ledger.

    The treasurer and administrator roles answer for the money, and every
    system account that owns the installation is told as well — an
    installation whose only treasurer is a superuser must still hear.
    """
    role_holders = set()
    for profile in MemberProfile.objects.select_related('user').filter(user__is_active=True):
        if set(profile.get_roles()) & {'treasurer', 'admin'}:
            role_holders.add(profile.user_id)
    return User.objects.filter(
        Q(id__in=role_holders) | Q(is_superuser=True) | Q(is_staff=True),
        is_active=True,
    ).distinct()


def alert_payment_callback_failure(label, payload, exc):
    """Tell the finance office that a payment callback crashed — never raising.

    A crashed callback is silent by nature: the money left the giver's phone,
    Safaricom got a 500, and nothing in the app says so — the gift only turns
    up at the next pull, if then. The desk hears about it the same three ways
    the request notices travel (bell, letter, phone), and the alert itself
    may never change the callback's response, which Safaricom's retry
    schedule reads. Safaricom retries a failed callback several times, so the
    same crash is reported once an hour, not once per retry.
    """
    try:
        title = f'Payment callback failed — {label}'
        try:
            excerpt = json.dumps(payload, default=str, ensure_ascii=False)
        except Exception:
            excerpt = str(payload)
        excerpt = (excerpt or '')[:500]
        # The stable part identifies the crash across retries: the minute of
        # the attempt differs on every retry, so it may not enter the key.
        stable = f'Error: {type(exc).__name__}: {exc}\nPayload: {excerpt}'
        already_told = ChurchNotification.objects.filter(
            title=title,
            message__contains=stable,
            created_at__gte=timezone.now() - timedelta(hours=1),
        ).exists()
        if already_told:
            return
        when = timezone.localtime().strftime('%d %b %Y, %H:%M')
        body = (
            f'Safaricom called back at {when} and the server could not record the payment.\n\n'
            f'{stable}\n\n'
            'The gift never reached the ledger. Safaricom will retry; if every retry fails, '
            'find the payment on the M-Pesa statement and record it by hand.'
        )
        recipients = list(finance_alert_audience())
        link = '/administration/treasury'
        ChurchNotification.objects.bulk_create([
            ChurchNotification(user=user, title=title, message=body, link=link)
            for user in recipients
        ])
        sent = set()
        for user in recipients:
            address = (user.email or '').strip()
            if not address or address.lower() in sent:
                continue
            sent.add(address.lower())
            send_mail(
                title, body, sender_for(MONEY), [address],
                connection=connection_for(MONEY), fail_silently=True,
            )
        try:
            from .push import push_to_user, vapid_keys_ready
            if vapid_keys_ready():
                for user in recipients:
                    push_to_user(user, title=title, body=body[:300], link=link)
        except Exception:
            pass
    except Exception:
        # The alert may never become the thing that breaks the callback.
        logger.exception('Payment callback alert (%s) failed to send.', label)


def payment_callback_alerts(label):
    """Report a crashing payment callback to the finance office, then re-raise.

    The exception leaves the view exactly as it arrived: the response stays a
    500, Safaricom keeps its retry schedule, and the journal keeps its
    traceback — this only makes sure a human hears about it too.
    """
    def decorator(view_post):
        @wraps(view_post)
        def post(api_view, request, *args, **kwargs):
            try:
                return view_post(api_view, request, *args, **kwargs)
            except Exception as exc:
                try:
                    payload = request.data or {}
                except Exception:
                    payload = {}
                alert_payment_callback_failure(label, payload, exc)
                raise
        return post
    return decorator


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

    @payment_callback_alerts('M-Pesa STK push result')
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
            # An anonymous gift keeps no name at all — not Safaricom's and
            # not one resolved from the giver's account. The ledger greets it
            # "Dear friend" and the phone it was paid from carries it.
            if context.get('anonymous'):
                payer_name = ''
            elif not payer_name:
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
            # A gift given for someone: the account they hold (packed at push
            # time), their name as typed, and how they relate to the payer.
            honoree = None
            if context.get('honoree_id'):
                honoree = User.objects.filter(pk=context['honoree_id'], is_active=True).first()
            lines = allocation_lines(context)
            # The same money may already be in the ledger: a treasurer's
            # pull (or Safaricom's C2B confirmation) records the payment the
            # moment it shows on the statement, and this result can land
            # after that — a slow callback, or Safaricom's retry of one
            # that failed. Recording the gift again would print one payment
            # twice: once held in the Unassigned queue and once completed
            # in the givings. The row the desk already sees is adopted
            # instead — never a second one.
            existing = (
                Contribution.objects.filter(mpesa_receipt_number=receipt_number).first()
                if receipt_number else None
            )
            if existing is not None:
                self._adopt_recorded_payment(
                    existing,
                    context=context,
                    lines=lines,
                    checkout_request_id=checkout_request_id,
                    phone=phone,
                    payer_name=payer_name,
                    honoree=honoree,
                )
                return Response({'ResultCode': 0, 'ResultDesc': 'Accepted'})
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
                    honoree=honoree,
                    honoree_name=(context.get('honoree_name') or '').strip(),
                    relationship=(context.get('relationship') or '').strip(),
                    anonymous=bool(context.get('anonymous')),
                )
                self._link_giver(contribution, context)
            # One gift, one receipt: a split payment sends one letter listing
            # its distribution; a single-account gift keeps its own letter.
            # An anonymous gift's letter still has somewhere to go: the
            # account address that rode the context for delivery alone.
            receipt_email = context.get('receipt_email', '')
            if group:
                send_grouped_contribution_receipts(group, receipt_email=receipt_email)
            else:
                send_contribution_receipt(contribution, receipt_email=receipt_email)
            # The honoree's letter is their own — one per line is one per
            # account, each written on their record.
            for row in Contribution.objects.filter(
                Q(checkout_request_id=checkout_request_id) if checkout_request_id else Q(pk=contribution.pk)
            ):
                send_honoree_receipt(row)
            # A gift made through a request's own link closes that request.
            if context.get('giving_request_id'):
                GivingRequest.objects.filter(
                    pk=context['giving_request_id'], status='pending'
                ).update(status='fulfilled', fulfilled_at=timezone.now())
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
        """Attribute the completed contribution to a user or campaign card.

        An anonymous gift is never attributed to anyone: the giver asked for
        exactly that, so neither their account nor their email is attached.
        """
        if context.get('anonymous'):
            return
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
            matched_user = member_for_msisdn(msisdn)
        if matched_user:
            contribution.member = matched_user
            if not contribution.donor_email and matched_user.email:
                contribution.donor_email = matched_user.email

        contribution.save(update_fields=['campaign', 'card_assignment', 'member', 'donor_email'])

    def _adopt_recorded_payment(self, contribution, *, context, lines, checkout_request_id, phone, payer_name, honoree):
        """Fold this STK result into the row the ledger already holds.

        The pull (or a C2B confirmation) recorded this payment before the
        callback landed, so its receipt number already names one row — often
        one waiting in the Unassigned queue, because the short prompt
        reference is not always a name the treasury recognises. This never
        creates a second gift: the row takes the checkout id every later
        retry dedupes on, the giver the form named, and — while no treasurer
        has assigned it — the account and the split its giver chose,
        credited once. A row that was already credited (matched when
        recorded, or assigned from the Unassigned queue) keeps the account
        it went to; only the callback's own marks are added to it.
        """
        contribution.checkout_request_id = checkout_request_id
        if phone and not contribution.phone_number:
            contribution.phone_number = phone
        donor_name = (context.get('donor_name') or '').strip() or payer_name
        if donor_name and not contribution.donor_name:
            contribution.donor_name = donor_name
        if not contribution.donor_email:
            contribution.donor_email = context.get('donor_email', '')
        if not contribution.item_description:
            contribution.item_description = context.get('item_description', '')
        if context.get('anonymous'):
            # The giver asked to be anonymous: the statement's registered
            # name must not out them on the ledger.
            contribution.anonymous = True
            contribution.donor_name = ''
            contribution.donor_email = ''

        if not contribution.needs_review:
            # Already credited — matched when recorded, or assigned from the
            # Unassigned queue. The account it went to must not move under
            # the treasurer who put it there.
            contribution.save()
            return

        # Still held: take the account its giver chose on the form, split the
        # way they split it, and move the money. The receipt already went out
        # when the row was first recorded, so the giver is not written to
        # again here.
        first, rest = lines[0], lines[1:]
        group = uuid.uuid4() if rest else None
        contribution.purpose = first['purpose']
        contribution.amount = Decimal(str(first['amount']))
        contribution.payment_group = group
        contribution.honoree = honoree
        contribution.honoree_name = (context.get('honoree_name') or '').strip()
        contribution.relationship = (context.get('relationship') or '').strip()
        contribution.needs_review = False
        contribution.save()
        self._link_giver(contribution, context)
        for row in rest:
            sibling = Contribution.objects.create(
                amount=Decimal(str(row['amount'])),
                giving_type='financial',
                purpose=row['purpose'],
                phone_number=contribution.phone_number,
                donor_name=contribution.donor_name,
                donor_email=contribution.donor_email,
                item_description=contribution.item_description,
                payment_method='mpesa',
                status='completed',
                mpesa_receipt_number=contribution.mpesa_receipt_number,
                checkout_request_id=checkout_request_id,
                payment_group=group,
                paid_at=contribution.paid_at,
                honoree=honoree,
                honoree_name=contribution.honoree_name,
                relationship=contribution.relationship,
                anonymous=contribution.anonymous,
            )
            self._link_giver(sibling, context)
        credit_contribution_lines(contribution)


class MpesaC2BValidationView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        return Response({'ResultCode': 0, 'ResultDesc': 'Accepted'})


def member_for_msisdn(msisdn):
    """The member account behind a giving phone, or None.

    A paybill payment arrives with only the payer's MSISDN — no session, no
    form — so the phone is the only thread back to the giver's account, and
    every thread that leads there must be followed or the gift is receipted
    to nobody. The username is tried first (a member who registered with
    their number carries it there), then the profile's own phone and
    WhatsApp numbers, compared on the last nine digits so 07… and 254…
    forms meet — the same comparison giver_display_name() already uses to
    greet the giver.
    """
    digits = ''.join(ch for ch in (msisdn or '') if ch.isdigit())
    if len(digits) < 9:
        return None
    tail = digits[-9:]
    matched_user = User.objects.filter(username__icontains=tail).first()
    if matched_user:
        return matched_user
    profile = MemberProfile.objects.filter(
        Q(phone_number__endswith=tail) | Q(whatsapp_number__endswith=tail)
    ).select_related('user').first()
    return profile.user if profile else None


def member_for_giver_name(safaricom_name):
    """Deprecated: Matching transactions by sender name is intentionally disabled.

    Many members share identical first or last names, leading to false-positive
    matches, misattributed gifts, and erroneously delivered receipts. Member
    matching is strictly restricted to phone/MSISDN verification.
    """
    return None


def record_direct_paybill_payment(payload):
    """Record one direct paybill (C2B) payment from a Safaricom payload.

    Shared by the confirmation callback and the pull-based statement
    command: money that reached the paybill is a completed contribution,
    credited once, however the server first heard of it — Safaricom pushing
    a confirmation, or the church pulling its own statement. Returns the
    contribution, or None for a payload with no transaction id.
    """
    trans_id = payload.get('TransID') or payload.get('TransactionID')
    if not trans_id:
        return None

    # Every string column this save touches is bounded, and a value past its
    # width would crash the save and drop the payment — exactly what an
    # over-long MSISDN once did to a live confirmation. Safaricom's free-text
    # fields (reference, sender name, transaction id) are untrusted here, so
    # each is trimmed to the column it is about to be written to: the gift is
    # always recorded; a trimmed reference that names no account is simply
    # held in the Unassigned queue.
    trans_id = str(trans_id)[:Contribution._meta.get_field('mpesa_receipt_number').max_length]

    # Extract all name components from Safaricom C2B payload
    first_name = (payload.get('FirstName') or '').strip()
    middle_name = (payload.get('MiddleName') or '').strip()
    last_name = (payload.get('LastName') or '').strip()
    full_name = ' '.join(filter(None, [first_name, middle_name, last_name]))
    full_name = full_name[:Contribution._meta.get_field('donor_name').max_length]

    msisdn = safe_mpesa_phone(payload.get('MSISDN'))
    amount_raw = payload.get('TransAmount', 0)
    try:
        amount = Decimal(str(amount_raw))
    except (ValueError, TypeError):
        amount = Decimal('0')

    purpose = (payload.get('BillRefNumber') or 'Combined Offering').strip()
    purpose = purpose[:Contribution._meta.get_field('purpose').max_length]

    # Check if already recorded.
    # A receipt number may already belong to a split STK gift (several rows
    # sharing one payment_group) or to a single unsplit row. Either way a
    # re-delivered C2B confirmation — or a paybill payment that Safaricom
    # also delivered as an STK result for the same transaction — must not
    # create a second gift. Look for any row that already carries this
    # receipt number; only when none exists is this a new payment.
    contribution = Contribution.objects.filter(mpesa_receipt_number=trans_id).first()
    was_new_record = contribution is None
    if not was_new_record and contribution.checkout_request_id:
        # An STK gift the push callback already recorded (split or not): this
        # C2B twin of the same transaction must not overwrite what the
        # giver's form chose — the amount, the account, or the receipt they
        # were sent.
        return contribution
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
    if not contribution.member:
        matched_user = member_for_msisdn(msisdn) if msisdn else None
        # Do NOT match transactions by sender name because many individuals share
        # first or partial names, which causes wrong attribution and misdirected receipts.
        # Only attach to a member account when the payer's phone number matches.
        if matched_user:
            contribution.member = matched_user
            if not contribution.donor_email and matched_user.email:
                contribution.donor_email = matched_user.email

    # A reference that names no treasury account (a typo, a blank, a ministry
    # kept outside the treasury) is held for a treasurer rather than credited
    # to nothing: the money is safely in the ledger, flagged "needs review",
    # and the Unassigned tab is where it waits for the account it belongs to.
    # The flag is set only when the row is first recorded — a re-delivered
    # confirmation must never undo an assignment the treasurer already made.
    if was_new_record:
        contribution.needs_review = account_for_purpose(purpose) is None

    contribution.save()
    send_contribution_receipt(contribution)
    # The paybill money is in; the account it names moves too. A repeated
    # confirmation finds the saved row first and never reaches a second
    # credit, because the credit only follows a fresh completion. Unassigned
    # gifts are held — not credited — until a treasurer assigns an account
    # from the Unassigned tab.
    if was_new_record and not contribution.needs_review:
        credit_contribution_lines(contribution)
    return contribution


def heal_receipt_from_pull_row(contribution, pull_row):
    """Give a pending receipt the phone the confirmation callback never carried.

    Some C2B confirmations arrive wearing Safaricom's masked MSISDN — or none
    at all — so the recorder stores a phone no receipt can reach (or stores
    nothing) and the receipt waits. The pull statement is the one place the
    payer's real number still exists while the gift is young: when the pull
    meets such a row, take the statement's number only if the row holds
    nothing phone-shaped (a number the desk typed itself never moves), and
    send the receipt the desk has been waiting for. A row already receipted
    keeps what it was receipted with — history is not quietly rewritten.
    Returns True when the row was healed.
    """
    if contribution.receipt_sent_at or contribution.status != 'completed':
        return False
    real = safe_mpesa_phone(pull_row.get('MSISDN'))
    if not real:
        return False
    if contribution.phone_number and safe_mpesa_phone(contribution.phone_number):
        return False
    contribution.phone_number = real
    if not contribution.member:
        matched_user = member_for_msisdn(real)
        if matched_user:
            contribution.member = matched_user
            if not contribution.donor_email and matched_user.email:
                contribution.donor_email = matched_user.email
    contribution.save(update_fields=['phone_number', 'member', 'donor_email'])
    send_contribution_receipt(contribution)
    return True


class MpesaC2BConfirmationView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @payment_callback_alerts('M-Pesa paybill confirmation')
    def post(self, request):
        record_direct_paybill_payment(request.data or {})
        return Response({'ResultCode': 0, 'ResultDesc': 'Accepted'})


def explain_pull_registration(message):
    """Sort out Safaricom's ambiguous no-records sentence.

    "No records found or Organization Name not available" names two very
    different situations — a window the paybill received nothing in, and a
    shortcode that was never enabled for Pull — and the desk cannot tell
    them apart. The register call can: it is idempotent, answering
    "Shortcode already Registered" on every run after the first, so it is
    asked here which of the two is true. Returns (kind, note), where kind
    is 'empty' (registered; the window holds nothing), 'fixed' (this probe
    just registered the shortcode), 'unknown' (the probe could not run, so
    the original instruction stands), or 'none' (not the ambiguous
    sentence; no note to add).
    """
    lowered = (message or '').lower()
    if 'not have any available' not in lowered and 'not available' not in lowered:
        return 'none', ''
    try:
        result = register_pull_url()
    except Exception:
        result = None
    description = str((result or {}).get('Response Description') or '')
    code = str((result or {}).get('Response Status') or '')
    if not description and not code:
        return 'unknown', (
            ' — this usually means the shortcode has never been '
            'registered for Pull. Run `manage.py register_mpesa_pull_url` '
            'once, then pull again.'
        )
    if 'already registered' in description.lower() or code == '1001':
        return 'empty', (
            ' — the shortcode IS registered for Pull (Safaricom just '
            'confirmed it), so this window simply holds no transactions.'
        )
    return 'fixed', (
        ' — the shortcode was not registered for Pull before; this check '
        'has registered it. Pull again to read the window.'
    )


class MpesaPullTransactionsView(APIView):
    """Treasurer-triggered pull of the paybill's transactions from Safaricom.

    The Pull API asks Safaricom what the paybill received for a window —
    manual "send money to paybill" gifts included — and every receipt the
    ledger has never seen is recorded here, once, through the same recorder
    the C2B confirmation callback uses. Idempotent: re-pulling the same
    window records nothing new.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not is_treasurer_or_admin(request.user):
            raise PermissionDenied('Only church treasurers or administrators can pull M-Pesa transactions.')

        days = request.data.get('days', 1)
        try:
            days = max(1, min(int(days), 90))
        except (TypeError, ValueError):
            days = 1
        # Safaricom keeps 48 hours of transactions and refuses to read a
        # window longer than that — asking for more is answered with "No
        # records found", so whatever the desk asked for, the pull is the
        # last two days.
        days = min(days, 2)
        nairobi = timezone.localtime().tzinfo
        end = timezone.now()
        start = end - timedelta(days=days)
        fmt = '%Y-%m-%d %H:%M:%S'
        start_str = start.astimezone(nairobi).strftime(fmt)
        end_str = end.astimezone(nairobi).strftime(fmt)

        rows, offset, note = [], 0, ''
        try:
            while True:
                page = pull_paybill_transactions(start_str, end_str, offset=offset)
                # Safaricom answers a window it holds no rows for — or a
                # shortcode nobody enabled Pull for — with a code and a
                # sentence of its own rather than an error status.
                code = str(page.get('ResponseCode') or '')
                if code and code != '1000':
                    note = str(page.get('ResponseMessage') or 'Safaricom returned no transactions.')
                    break
                # Safaricom documents the rows under `Response` — lowercase
                # keys, one list per page — and answers `Result` in other
                # deployments; normalize_pull_rows takes either spelling to
                # the C2B shape record_direct_paybill_payment reads, so rows
                # are recorded instead of silently skipped.
                result = normalize_pull_rows(page)
                rows.extend(result)
                # The API caps each response; an empty or short page ends the
                # window, otherwise the next slice starts at the next offset.
                if not result or len(result) < 100:
                    break
                offset += len(result)
        except MpesaConfigurationError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except requests.HTTPError as exc:
            body = ''
            if exc.response is not None:
                body = (exc.response.text or '')[:400]
            return Response(
                {'detail': f'M-Pesa did not answer the pull: {body or exc}'},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except (requests.RequestException, ValueError, KeyError) as exc:
            return Response(
                {'detail': f'M-Pesa did not answer the pull: {exc}'},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        recorded = 0
        for row in rows:
            trans_id = row.get('TransID') or row.get('TransactionID')
            if not trans_id:
                continue
            if Contribution.objects.filter(mpesa_receipt_number=trans_id).exists():
                continue
            if record_direct_paybill_payment(row) is not None:
                recorded += 1

        # An empty window is normal; Safaricom's ambiguous "not available"
        # sentence is not — it covers both an empty window and a shortcode
        # nobody enabled. The register call (idempotent) settles which one
        # it is, and the desk reads the settled answer.
        detail = ''
        if not rows and note:
            _kind, explanation = explain_pull_registration(note)
            detail = note + explanation

        payload = {
            'pulled': len(rows),
            'recorded': recorded,
            'start': start_str,
            'end': end_str,
        }
        if detail:
            payload['detail'] = detail
        return Response(payload)


class TreasuryUnassignedView(APIView):
    """Paybill payments whose reference matched no treasury account.

    The money is safely in the ledger but credited to nothing; this is the
    treasurer's work queue — each row shows what the member actually typed,
    so the desk can name the account it belongs to.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_treasurer_or_admin(request.user):
            raise PermissionDenied('Only church treasurers or administrators can review unassigned payments.')
        rows = Contribution.objects.filter(needs_review=True, status='completed').select_related('member').order_by('-paid_at', '-created_at')
        return Response([
            {
                'id': row.id,
                'amount': str(row.amount),
                'currency': row.currency,
                'typed_reference': row.purpose,
                'mpesa_receipt_number': row.mpesa_receipt_number or '',
                'donor_name': row.donor_name,
                'donor_email': usable_email(row.donor_email),
                'phone_number': row.phone_number,
                # The payer's own account, where they have one — the contact
                # sheet's "Chat here" door needs the id, not the name.
                'member_id': row.member_id,
                'paid_at': (row.paid_at or row.created_at).isoformat(),
            }
            for row in rows
        ])


class UnassignedPaymentView(APIView):
    """One held paybill payment, taken off the desk.

    DELETE removes a payment a treasurer decides is not the church's to keep
    waiting on the ledger: the office's own test payment, a Safaricom message
    delivered twice, money already returned to the sender by hand. No account
    ever saw this money — the row is credited to nothing and receipted never —
    so taking it off the ledger leaves no fund short, exactly as the Failed
    tab's own removal does.

    A row that has been assigned is not this desk's to remove: the review flag
    is cleared, the gift is a real credit on a fund, and the ledger answers for
    it (a treasurer reverses it there instead).
    """

    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        if not is_treasurer_or_admin(request.user):
            raise PermissionDenied('Only church treasurers or administrators can remove unassigned payments.')
        contribution = generics.get_object_or_404(Contribution, pk=pk)
        if not contribution.needs_review or contribution.status != 'completed':
            return Response(
                {
                    'detail': (
                        'Only a payment still waiting for an account can be removed — '
                        'an assigned gift stands on its fund.'
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        # A split payment leaves one line per account, all sharing the
        # payment's group; removing a single line would leave half the payment
        # on the desk, so the whole payment goes at once.
        from .treasury import ContributionSiblings

        doomed = ContributionSiblings(contribution).rows()
        removed = len(doomed)
        Contribution.objects.filter(pk__in=[row.pk for row in doomed]).delete()
        noun = 'payment' if removed == 1 else 'payments'
        return Response({'detail': f'{removed} unassigned {noun} removed.'})


class TreasuryFailedView(APIView):
    """Giving attempts that never arrived — counted, and removable.

    The Failed tab on the treasury strip is the story of money that never
    came: a prompt cancelled, a PIN never entered, a window timed out. Such
    rows are credited to nothing and receipted never — unlike real gifts
    they can safely be taken off the ledger, so the desk clears the noise a
    dead attempt leaves behind. The count feeds the tab's badge.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_treasurer_or_admin(request.user):
            raise PermissionDenied('Only church treasurers or administrators can review failed givings.')
        # The badge answers with the window the Failed tab lists underneath
        # it — the same parse, the same rule — so the number on the strip and
        # the rows in the tab can never disagree: filter the tab to September
        # and the badge counts September, never October. Without a window it
        # reads the last thirty days, which the daily purge is what keeps
        # clear anyway.
        start_date, end_date = giving_window(request.query_params)
        count = Contribution.objects.filter(
            status__in=('failed', 'cancelled'), giving_type='financial',
        ).filter(digital_window_q(start_date, end_date)).count()
        return Response({'count': count})

    def delete(self, request, pk):
        if not is_treasurer_or_admin(request.user):
            raise PermissionDenied('Only church treasurers or administrators can remove failed givings.')
        contribution = generics.get_object_or_404(Contribution, pk=pk)
        if contribution.status not in ('failed', 'cancelled'):
            return Response(
                {'detail': 'Only failed attempts can be removed — a completed gift stands.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # A split attempt leaves one line per account, all sharing the
        # payment's group; removing a single line would leave the attempt
        # half on the ledger, so the whole payment goes at once.
        from .treasury import ContributionSiblings

        doomed = ContributionSiblings(contribution).rows()
        removed = len(doomed)
        Contribution.objects.filter(pk__in=[row.pk for row in doomed]).delete()
        noun = 'transaction' if removed == 1 else 'transactions'
        return Response({'detail': f'{removed} failed {noun} removed.'})


class AssignContributionAccountView(APIView):
    """Credit an unassigned payment to one or more accounts a treasurer names.

    One press credits the payment at its own timestamp — so the month the
    money arrived stays right, however late the assignment — and clears the
    review flag. A payment can be split across several treasury accounts by
    sending a list of {account_id, amount} objects; the amounts must add up
    to the payment's full amount. A repeated press finds the flag already
    cleared and refuses, so a payment can never be credited twice.

    The same press may send the receipt: name a ``receipt_email`` or a
    ``receipt_phone`` and the giver is thanked on that channel, with the
    treasurer's own ``receipt_message`` in the letter (the church's default
    message when none is sent). The message is the whole point of assigning
    from here rather than from a ledger row later — the gift is answered in
    the same act that files it.
    """

    permission_classes = [IsAuthenticated]

    @staticmethod
    def _send_receipt(request, contribution, account_names):
        """Deliver the receipt the desk asked for; None if it asked for none."""
        email = str(request.data.get('receipt_email') or '').strip()
        phone = str(request.data.get('receipt_phone') or '').strip()
        if not email and not phone:
            return None
        church_settings = ChurchSettings.objects.get_or_create(pk=1)[0]
        donor_name = giver_display_name(
            contribution.donor_name,
            member=contribution.member,
            email=contribution.donor_email,
            phone=contribution.phone_number,
        ) or 'friend'
        # The amount a receipt names is the payment's whole statement figure —
        # the sum of its ledger lines — not the first line's share of it: a
        # split payment thanks the giver for everything they gave.
        from .treasury import ContributionSiblings

        total_amount = sum((row.amount for row in ContributionSiblings(contribution).rows()), Decimal('0'))
        amount_display = f"{contribution.currency} {total_amount:,.2f}"
        account_list = ' / '.join(account_names)
        # The treasurer's message is already the words they wrote (the modal
        # prefills the church's default); the render pass fills any placeholder
        # left standing rather than shipping braces to the giver.
        receipt_message = render_receipt_message(
            str(request.data.get('receipt_message') or '') or church_settings.default_receipt_message,
            donor_name,
            amount_display,
            account_list,
        )
        reference = contribution.mpesa_receipt_number or contribution.paystack_reference or str(contribution.id)
        date_display = timezone.localtime(contribution.paid_at or timezone.localtime()).strftime('%d %B %Y, %H:%M')
        summary = receipt_summary(account=account_list, amount=amount_display, payment_channel=contribution.get_payment_method_display(), receipt_ref=reference, date_display=date_display)
        # The assign press thanks the giver and hands them the paper in the
        # same act — the slip cut from the ledger rows just credited.
        attachment = contribution_receipt_attachment(contribution) if email else None
        body = (
            f"{receipt_message}\n\n"
            f"{summary}\n\n"
            f"{receipt_email_signature()}"
        )
        delivery = _deliver_receipt_message(
            subject=f"Giving receipt — {account_list}",
            body=body,
            email=email,
            phone=phone,
            mark_sent=lambda: None,
            attachments=[attachment] if attachment else None,
        )
        if delivery['email_sent'] or delivery['sms_sent']:
            contribution.receipt_sent_at = timezone.now()
            contribution.save(update_fields=['receipt_sent_at'])
        return delivery

    def post(self, request, pk):
        if not is_treasurer_or_admin(request.user):
            raise PermissionDenied('Only church treasurers or administrators can assign payments.')
        contribution = generics.get_object_or_404(Contribution, pk=pk)
        if contribution.status != 'completed':
            return Response({'detail': 'Only completed payments can be assigned.'}, status=status.HTTP_400_BAD_REQUEST)
        if not contribution.needs_review:
            return Response({'detail': 'This payment has already been assigned.'}, status=status.HTTP_400_BAD_REQUEST)

        allocations = request.data.get('allocations')
        # Backwards-compatible single-account path: {account_id: <id>}
        if allocations is None:
            account_id = request.data.get('account_id')
            if account_id is None:
                return Response({'detail': 'Supply account_id or allocations.'}, status=status.HTTP_400_BAD_REQUEST)
            account = generics.get_object_or_404(TreasuryAccount, pk=account_id)
            reference = contribution.mpesa_receipt_number or contribution.paystack_reference or f'CONTRIB-{contribution.id}'
            giver = giver_display_name(
                contribution.donor_name,
                member=contribution.member,
                email=contribution.donor_email,
                phone=contribution.phone_number,
            )
            method_display = contribution.get_payment_method_display()
            description = f"{giver or 'Contribution'} — {method_display} ({account.name})"
            row = apply_credit(
                account=account,
                amount=contribution.amount,
                description=description,
                reference=reference,
                created_by=request.user,
                at=contribution.paid_at,
            )
            if row is None:
                return Response({'detail': 'That account could not be credited.'}, status=status.HTTP_400_BAD_REQUEST)
            contribution.needs_review = False
            contribution.purpose = account.name
            contribution.save(update_fields=['needs_review', 'purpose'])
            delivery = self._send_receipt(request, contribution, [account.name])
            return Response({'detail': f'Credited to {account.name}.', 'account': account.name, 'receipt': delivery})

        # Multi-account split: [{account_id, amount}, ...]
        if not isinstance(allocations, list) or not allocations:
            return Response({'detail': 'allocations must be a non-empty list.'}, status=status.HTTP_400_BAD_REQUEST)

        # Resolve all accounts first so a bad id fails before anything is credited.
        resolved = []
        total = Decimal('0')
        for entry in allocations:
            account_id = entry.get('account_id')
            amount = entry.get('amount')
            if account_id is None or amount is None:
                return Response({'detail': 'Each allocation needs account_id and amount.'}, status=status.HTTP_400_BAD_REQUEST)
            try:
                amount = Decimal(str(amount))
            except (ValueError, TypeError):
                return Response({'detail': f'Invalid amount for account {account_id}.'}, status=status.HTTP_400_BAD_REQUEST)
            account = generics.get_object_or_404(TreasuryAccount, pk=account_id)
            resolved.append((account, amount))
            total += amount

        if total != contribution.amount:
            return Response(
                {'detail': f'Allocation amounts (KES {total:,.2f}) must add up to the payment amount (KES {contribution.amount:,.2f}).'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        reference = contribution.mpesa_receipt_number or contribution.paystack_reference or f'CONTRIB-{contribution.id}'

        # The ledger keeps one line per account — the same shape a giver's own
        # split payment is stored in — so every reader of the giving ledger,
        # the receipt paper included, itemises the split the desk chose.
        # Assigning a payment across several accounts therefore rewrites the
        # one held row as the first share and files its siblings beside it
        # under one payment group. A single-account press keeps the row
        # whole, and a payment already stored split (the giver's own lines)
        # is credited as it stands.
        with transaction.atomic():
            if len(resolved) > 1 and not contribution.payment_group:
                group = uuid.uuid4()
                first_account, first_amount = resolved[0]
                copy_fields = (
                    'member', 'donor_name', 'donor_email', 'giving_type', 'currency',
                    'phone_number', 'payment_method', 'status', 'mpesa_receipt_number',
                    'paid_at', 'campaign', 'card_assignment', 'honoree', 'honoree_name',
                    'relationship', 'honoree_phone', 'anonymous',
                )
                Contribution.objects.filter(pk=contribution.pk).update(
                    payment_group=group, purpose=first_account.name, amount=first_amount,
                    needs_review=False,
                )
                Contribution.objects.bulk_create([
                    Contribution(
                        **{field: getattr(contribution, field) for field in copy_fields},
                        payment_group=group,
                        purpose=account.name,
                        amount=amount,
                    )
                    for account, amount in resolved[1:]
                ])
                contribution.refresh_from_db(fields=['amount', 'purpose', 'payment_group', 'needs_review'])
            else:
                contribution.needs_review = False
                contribution.purpose = resolved[0][0].name
                contribution.save(update_fields=['needs_review', 'purpose'])

            credited = credit_contribution_lines(
                contribution,
                allocations=[(account.name, amount) for account, amount in resolved],
                created_by=request.user,
            )
            if not credited:
                transaction.set_rollback(True)
                return Response({'detail': 'No account could be credited.'}, status=status.HTTP_400_BAD_REQUEST)

        delivery = self._send_receipt(request, contribution, [c.account.name for c in credited])
        return Response(
            {
                'detail': f'Credited across {len(credited)} account(s).',
                'accounts': [c.account.name for c in credited],
                'receipt': delivery,
            },
        )


class MpesaB2CResultView(APIView):
    """Receives the async outcome of a B2C refund request from Safaricom."""

    permission_classes = [AllowAny]
    authentication_classes = []

    @payment_callback_alerts('M-Pesa refund result')
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
            if profile and profile.has_role('admin', 'clerk', 'elder', 'pastor', 'chaplaincy'):
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
            audience=instance.audience,
        )


class ChildDedicationRequestView(generics.ListCreateAPIView):
    serializer_class = ChildDedicationRequestSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        user = self.request.user
        if user and user.is_authenticated:
            profile = getattr(user, 'member_profile', None)
            if profile and profile.has_role('admin', 'clerk', 'elder', 'pastor', 'children_ministry'):
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
        sender_for(IDENTITY),
        [pending.email],
        connection=connection_for(IDENTITY),
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


class ChurchFinancialReportsView(generics.ListCreateAPIView):
    """The church's published financial statements: the treasurer posts, members read.

    Reading is open — the reports are the congregation's own accounts, and the
    page is reachable without signing in. The desk (treasurer, admin) also sees
    drafts, which is what lets a report be written, reviewed and published in
    two steps rather than appearing the moment it is typed.
    """

    permission_classes = [AllowAny]
    serializer_class = ChurchFinancialReportSerializer

    def get_queryset(self):
        user = self.request.user if self.request.user.is_authenticated else None
        profile = getattr(user, 'member_profile', None) if user else None
        if profile and profile.has_role('admin', 'treasurer'):
            return ChurchFinancialReport.objects.all()
        return ChurchFinancialReport.objects.filter(published_to_members=True)

    def perform_create(self, serializer):
        if not is_treasurer_or_admin(self.request.user):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only church treasurers or administrators can post financial reports.')
        serializer.save()


class ChurchFinancialReportDetailView(generics.RetrieveUpdateDestroyAPIView):
    """One report: the desk edits it, flips it between draft and published, or drops it."""

    serializer_class = ChurchFinancialReportSerializer
    queryset = ChurchFinancialReport.objects.all()

    def get_permissions(self):
        return [AllowAny()] if self.request.method == 'GET' else [IsAuthenticated()]

    def perform_update(self, serializer):
        if not is_treasurer_or_admin(self.request.user):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only church treasurers or administrators can change financial reports.')
        serializer.save()

    def perform_destroy(self, instance):
        if not is_treasurer_or_admin(self.request.user):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only church treasurers or administrators can remove financial reports.')
        instance.delete()


def _giving_to_tithes(purpose):
    """The one split a statement needs: tithe against everything else.

    Giving is recorded by purpose ("Tithe", "Combined Offering", "Local
    Church Budget"), so the trust-fund split is read off the name rather than
    kept in a second table that would have to be kept in step with it.
    """
    return 'tithe' in str(purpose or '').lower()


class ChurchFinancialReportSuggestionsView(APIView):
    """What a statement for the current period already says.

    The treasury's own ledger knows what came in and what went out, so the
    desk should not have to add it up by hand before publishing the month's
    report. This hands back the month to date — money actually received, and
    money actually spent — and the desk reviews and corrects it in the normal
    composer. Nothing here is authoritative on its own: it is a starting point
    whose figures the treasurer still signs off.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_treasurer_or_admin(request.user):
            raise PermissionDenied('Only church treasurers or administrators can prepare financial reports.')

        today = timezone.localdate()
        start = today.replace(day=1)
        # The desk may ask for another period — the composer re-asks when the
        # treasurer moves the From/To dates, so the figures follow the period
        # they are writing about instead of staying the month to date.
        asked_start = parse_date(str(request.query_params.get('start') or ''))
        asked_end = parse_date(str(request.query_params.get('end') or ''))
        if asked_start:
            start = asked_start
        end = today
        if asked_end:
            end = asked_end
        if end < start:
            end = start
        period_end = end

        # Digital giving counts on the day it was paid; a row still waiting on
        # that stamp falls back to the day it was taken in.
        digital = Contribution.objects.filter(status='completed').filter(
            Q(paid_at__date__range=(start, period_end))
            | Q(paid_at__isnull=True, created_at__date__range=(start, period_end))
        )
        cash = CashContribution.objects.filter(received_on__range=(start, period_end))

        trust_fund = Decimal('0')
        local_offerings = Decimal('0')
        gifts = 0
        for purpose, amount, count in (
            digital.values_list('purpose').annotate(total=Sum('amount'), rows=Count('id'))
        ):
            if _giving_to_tithes(purpose):
                trust_fund += Decimal(amount or 0)
            else:
                local_offerings += Decimal(amount or 0)
            gifts += count
        for purpose, amount, count in (
            cash.values_list('purpose').annotate(total=Sum('amount'), rows=Count('id'))
        ):
            if _giving_to_tithes(purpose):
                trust_fund += Decimal(amount or 0)
            else:
                local_offerings += Decimal(amount or 0)
            gifts += count

        expenses = Expenditure.objects.filter(expenditure_date__range=(start, period_end)).aggregate(
            total=Sum('amount'),
            rows=Count('id'),
        )

        expenditure = Decimal(expenses['total'] or 0).quantize(Decimal('0.01'))
        return Response({
            'period_start': start.isoformat(),
            'period_end': period_end.isoformat(),
            'title': f"{start.strftime('%B %Y')} stewardship report",
            'trust_fund': str(trust_fund.quantize(Decimal('0.01'))),
            'local_church_offerings': str(local_offerings.quantize(Decimal('0.01'))),
            'expenditure': str(expenditure),
            # What the period leaves in hand — local offerings less what was
            # spent, with the trust fund held apart — computed here so the
            # desk sees the same total the published report will carry.
            'total': str(local_offerings.quantize(Decimal('0.01')) - expenditure),
            # How many lines each figure was drawn from, so the desk can tell
            # an empty month from one it has already posted entries against.
            'gift_entries': gifts,
            'expense_entries': expenses['rows'],
        })


class ChurchFinancialReportPdfView(APIView):
    """A statement as a page, printed for the desk's own use.

    The paper copy is the treasurer's instrument — for the noticeboard, the
    records file, a hand-out — so the desk alone may draw one, exactly as the
    desk alone may write the figures the page carries.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        if not is_treasurer_or_admin(request.user):
            return Response(
                {'error': 'Only church treasurers or administrators can print a financial report.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        try:
            report = ChurchFinancialReport.objects.get(pk=pk)
        except ChurchFinancialReport.DoesNotExist:
            return Response({'error': 'Financial report not found.'}, status=status.HTTP_404_NOT_FOUND)

        church_setting = ChurchSettings.objects.first()
        church_name = church_setting.church_name if church_setting else CHURCH_DEFAULT_NAME

        pdf_bytes = generate_financial_report_pdf(
            church_name=church_name, report=report, signatures=report_signatures(),
        )

        safe_title = ''.join(ch if ch.isalnum() else '_' for ch in report.title).strip('_')[:60] or 'Report'
        filename = f"Financial_Report_{safe_title}.pdf"
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'inline; filename="{filename}"'
        return response


class ChurchBudgetsView(generics.ListCreateAPIView):
    """The church's yearly budgets — read by anyone, written by the treasurer.

    The desk posts a budget (or updates the year's figures) and decides when
    it goes out: a budget the treasurer has not published stays behind the
    desk and the public budget page never shows it. One row per year.
    """
    serializer_class = ChurchBudgetSerializer

    def get_permissions(self):
        return [IsAuthenticated(), IsTreasurerOrAdmin()] if self.request.method == 'POST' else [AllowAny()]

    def get_queryset(self):
        queryset = ChurchBudget.objects.all()
        if not is_treasurer_or_admin(self.request.user):
            queryset = queryset.filter(published_to_public=True)
        return queryset

    def perform_create(self, serializer):
        serializer.save()


class ChurchBudgetDetailView(generics.RetrieveUpdateDestroyAPIView):
    """One year's budget — the treasurer's to correct, publish or withdraw."""

    serializer_class = ChurchBudgetSerializer

    def get_permissions(self):
        return [IsAuthenticated(), IsTreasurerOrAdmin()] if self.request.method != 'GET' else [AllowAny()]

    def get_object(self):
        budget = generics.get_object_or_404(ChurchBudget, pk=self.kwargs['pk'])
        if self.request.method == 'GET' and not budget.published_to_public and not is_treasurer_or_admin(self.request.user):
            raise Http404
        return budget


class IsTreasurerOrAdmin(permissions.BasePermission):
    """Budget writing is the treasurer's work, decided before validation."""

    def has_permission(self, request, view):
        return is_treasurer_or_admin(request.user)


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


class InKindThermalReceiptView(APIView):
    """A thermal-style PDF receipt for one in-kind gift, downloaded by its owner.

    There is no money to total, so the receipt itemises the donated goods —
    one line per item — with the purpose naming what the gift was for. Only
    the giver (or an office holder) may fetch it.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        gift = InKindContribution.objects.filter(pk=pk).first()
        if gift is None:
            return Response({'detail': 'In-kind gift not found.'}, status=status.HTTP_404_NOT_FOUND)

        profile = getattr(request.user, 'member_profile', None)
        is_office = bool(profile and profile.has_role('admin', 'treasurer', 'elder'))
        if gift.member_id != request.user.id and not is_office:
            return Response({'detail': 'This receipt belongs to another giver.'}, status=status.HTTP_404_NOT_FOUND)

        items = [line.strip() for line in (gift.items or '').splitlines() if line.strip()] or ['In-kind gift']
        # The receipt letterhead is the short form: SDA Church Loma Linda, no town.
        church_name = church_name_short()

        pdf_bytes = generate_in_kind_thermal_receipt_pdf(
            church_name=church_name,
            donor_name=gift.donor_name or (f"{request.user.first_name} {request.user.last_name}".strip() if gift.member_id else 'Friend'),
            phone_number=gift.phone_number,
            purpose=gift.purpose,
            notes=gift.notes,
            received_on=gift.received_on,
            items=items,
            signatures=receipt_signatures(),
        )
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        stamp = gift.received_on.strftime('%Y%m%d')
        response['Content-Disposition'] = f'attachment; filename="InKind_Receipt_{stamp}_{gift.pk}.pdf"'
        return response


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
            # Null is the church's own money; a set id is a department's or
            # ministry's fund. The unassigned-payments desk offers every
            # account — the same list as Treasury → Church Accounts; the
            # giving form offers both too.
            'department_id': account.department_id,
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
    # The description is the broadcast: what the office wrote about the drive
    # is what members read. A drive from a promotion announcement carries its
    # own text in both fields already; one composed on the fund-drives desk
    # falls back to the description, then to a plain restatement of the goal.
    msg_text = custom_message or campaign.member_message or campaign.description or (
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


def _is_lcb_treasury_account(account):
    """True for the Local Church Budget account, which desks may read but not turn into a drive."""
    text = f"{account.name or ''} {account.description or ''}".lower()
    return account.name.upper() == 'LCB' or 'local church budget' in text or ' lcb' in f" {text}"


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
        user = self.request.user
        if user.is_authenticated and is_treasurer_or_admin(user):
            return FundraisingCampaign.objects.all()
        if user.is_authenticated and is_finance_manager(user):
            return FundraisingCampaign.objects.filter(
                Q(approval_status='approved', is_active=True) | Q(created_by=user)
            )
        return FundraisingCampaign.objects.filter(is_active=True, approval_status='approved')

    def perform_create(self, serializer):
        user = self.request.user
        source_account = serializer.validated_data.get('source_account')
        source_department = str(self.request.data.get('source_department') or '').strip()
        if source_account is None:
            account_name = str(serializer.validated_data.get('account_name') or self.request.data.get('account_name') or '').strip()
            if account_name:
                # A ref may be typed exactly or spoken as the account's fuller
                # description; both answer the same account.
                source_account = (
                    TreasuryAccount.objects.filter(name__iexact=account_name).first()
                    or TreasuryAccount.objects.filter(description__iexact=account_name).first()
                    or account_for_purpose(account_name)
                )

        is_treasury = is_treasurer_or_admin(user)
        approval_status = 'approved' if is_treasury else 'pending'
        if not is_treasury:
            if source_account is None:
                raise PermissionDenied('Choose the department or ministry account this fund drive raises into.')
            if _is_lcb_treasury_account(source_account):
                raise PermissionDenied('Local Church Budget cannot be started as a fund drive from a department desk.')
            if not source_department:
                raise PermissionDenied('Choose the department or ministry desk this fund drive belongs to.')
            accessible_accounts = department_accounts(user, source_department)
            if not can_manage_department(user, source_department) or not any(acc.id == source_account.id for acc in accessible_accounts):
                raise PermissionDenied('You can only start fund drives for accounts managed by your department or ministry.')

        campaign = serializer.save(
            created_by=user,
            source_account=source_account,
            # The drive's account reference IS the account's reference: once
            # the account is known, no wording mints beside it — a drive never
            # carries its own invented ref, or the M-Pesa prompt would offer a
            # second name the account does not answer to.
            account_name=(source_account.name if source_account is not None else serializer.validated_data.get('account_name', '')),
            approval_status=approval_status,
            reviewed_by=(user if is_treasury else None),
            reviewed_at=(timezone.now() if is_treasury else None),
            is_active=True,
        )
        # Giving accounts are treasury accounts now; a drive is offered in the
        # giving form when the treasurer links it to an account, not by minting
        # a giving-purpose row for its name (the old behaviour retired).

        # Announcement option: create linked announcement and broadcast if requested
        post_as_announcement = str(self.request.data.get('post_as_announcement', '')).lower() in ('true', '1', 'yes')
        if post_as_announcement:
            import json
            sharing_opt = str(self.request.data.get('sharing_option') or 'site').strip()
            giving_actions = self.request.data.get('giving_actions')
            if isinstance(giving_actions, str):
                try:
                    giving_actions = json.loads(giving_actions)
                except Exception:
                    giving_actions = [x.strip() for x in giving_actions.split(',') if x.strip()]
            if not isinstance(giving_actions, list) or not giving_actions:
                giving_actions = ['give_now', 'pledge', 'in_kind', 'comment']

            ann_audience = self.request.data.get('announcement_audience') or self.request.data.get('audience')
            if isinstance(ann_audience, str):
                try:
                    ann_audience = json.loads(ann_audience)
                except Exception:
                    ann_audience = [x.strip() for x in ann_audience.split(',') if x.strip()]
            if not isinstance(ann_audience, list):
                ann_audience = []

            is_popup = str(self.request.data.get('is_popup', '')).lower() in ('true', '1', 'yes')
            ann_title = str(self.request.data.get('announcement_title') or campaign.title or campaign.name)[:160]
            ann_text = str(self.request.data.get('announcement_text') or campaign.description or ann_title)

            announcement = Announcement.objects.create(
                title=ann_title,
                text=ann_text,
                announcement_type='promotion',
                support_account=campaign.account_name or (campaign.source_account.name if campaign.source_account else ''),
                campaign=campaign,
                giving_actions=giving_actions,
                sharing_option=sharing_opt,
                is_popup=is_popup,
                audience=ann_audience,
                visibility='all',
                event_date_from=campaign.start_date,
                event_date_to=campaign.end_date,
                attachment=campaign.attachment,
            )
            if campaign.approval_status == 'approved':
                dispatch_announcement_broadcast(announcement, self.request)
            else:
                announcement.published = False
                announcement.save(update_fields=['published'])

        if campaign.approval_status != 'approved':
            treasurers = User.objects.filter(
                Q(is_staff=True) | Q(is_superuser=True) | Q(member_profile__roles__icontains='treasurer') | Q(member_profile__role='treasurer')
            ).distinct()
            for treasurer in treasurers:
                ChurchNotification.objects.create(
                    user=treasurer,
                    title='Fund drive awaiting approval',
                    message=f"{user.get_full_name() or user.username} submitted '{campaign.title or campaign.name}' for treasurer approval.",
                    link='/administration/fund-drives',
                )
            return

        group_role_map = {
            'choir': ('choir_director', 'Choir Ministry'),
            'youth': ('youth_leader', 'Youth Ministries'),
            'children': ('children_ministry', 'Children Ministry'),
            'men': ('men_ministry', 'Adventist Men Ministries'),
            'women': ('women_ministry', 'Adventist Women Ministries'),
            'chaplaincy': ('chaplaincy', 'Chaplaincy'),
            'leaders': ('elder', 'Church Leaders'),
        }

        # NB: no local `from django.contrib.auth.models import User` here — a
        # function-scoped import would shadow the module-level one for the
        # whole function, breaking the treasurer-notification loop above.
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
                        user=u,
                        title=f"Fund Drive Invite Assigned: {campaign.name}",
                        message=f"You have been assigned a personal invite for '{campaign.title or campaign.name}'. Open your card to share your personal link!",
                    )

        # Broadcast on create only when the office scheduled one: a drive's
        # description is its standing broadcast text (and a promotion post's
        # announcement is already out), so nothing is dispatched silently.
        if campaign.schedule_message and campaign.scheduled_at:
            is_immediate = campaign.scheduled_at <= timezone.now()
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

    def get_queryset(self):
        user = self.request.user
        if user.is_authenticated and is_treasurer_or_admin(user):
            return FundraisingCampaign.objects.all()
        if user.is_authenticated:
            return FundraisingCampaign.objects.filter(
                Q(is_active=True, approval_status='approved') | Q(created_by=user)
            )
        return FundraisingCampaign.objects.filter(is_active=True, approval_status='approved')

    def get_permissions(self):
        return [AllowAny()] if self.request.method == 'GET' else [IsAuthenticated()]

    def perform_update(self, serializer):
        if not is_treasurer_or_admin(self.request.user):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only church treasurers or administrators can edit fund drives.')
        previous = self.get_object()
        # A linked drive's reference is its account's own reference: an edit
        # that retypes the ref would put a second wording on the M-Pesa prompt
        # that the account never answers to, so the account's ref wins.
        if serializer.validated_data.get('account_name') and previous.source_account_id is not None:
            serializer.validated_data['account_name'] = previous.source_account.name
        next_status = serializer.validated_data.get('approval_status', previous.approval_status)
        decided = next_status != previous.approval_status and next_status in ('approved', 'rejected')
        update_fields = {}
        if decided:
            update_fields = {
                'reviewed_by': self.request.user,
                'reviewed_at': timezone.now(),
            }
        campaign = serializer.save(**update_fields)
        if decided and next_status == 'approved':
            for ann in campaign.announcements.filter(published=False):
                dispatch_announcement_broadcast(ann, self.request)

        # The desk that raised the drive hears the answer either way — posted
        # or kept off — the same way a withdrawal ask hears its treasurer's
        # reply. Without this the leader submits into silence and never learns
        # why their drive never appeared.
        if decided and campaign.created_by and campaign.created_by_id != self.request.user.pk:
            approved = next_status == 'approved'
            ChurchNotification.objects.create(
                user=campaign.created_by,
                title=f"Fund drive {campaign.title or campaign.name} was {'approved' if approved else 'not approved'}"[:160],
                message=(
                    'It is posted in Fund Drives now and members can give to it.'
                    if approved
                    else (
                        f'The treasurer replied: {campaign.review_note}'
                        if campaign.review_note
                        else 'The treasurer kept it off Fund Drives for now.'
                    )
                ),
                link='/support/campaigns' if approved else '/member',
            )

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
        if next_status == 'approved' and (not current_profile or not current_profile.has_role('admin', 'elder', 'clerk')):
            return Response({'detail': 'Only elders, clerks or administrators can approve transfer requests.'}, status=status.HTTP_403_FORBIDDEN)

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
        if profile and profile.has_role('admin', 'clerk', 'elder', 'pastor'):
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
        invited, sms_sent, emailed = broadcast_invitation(
            meeting,
            BOARD_KIND,
            current_church_name(),
            template=custom_message or None,
            notify_sms=notify_sms,
            notify_email=notify_email,
        )

        serializer = self.get_serializer(meeting)
        data = dict(serializer.data)
        data['invitations'] = {'invited': invited, 'sms_sent': sms_sent, 'emailed': emailed}
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

        invited, sms_sent, emailed = broadcast_invitation(
            meeting,
            BUSINESS_KIND,
            current_church_name(),
            template=custom_message or None,
            notify_sms=notify_sms,
            notify_email=notify_email,
        )

        serializer = self.get_serializer(meeting)
        data = dict(serializer.data)
        data['invitations'] = {'invited': invited, 'sms_sent': sms_sent, 'emailed': emailed}
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

    def post(self, request):
        """Mark notifications read, optionally scoped to specific ids.

        A body of ``{"ids": [1, 2]}`` marks exactly those; an empty body marks
        everything for this user. Each notification owner's ``read`` flag is
        their own — there is no cross-user marking here.
        """
        ids = request.data.get('ids') if isinstance(request.data, dict) else None
        qs = ChurchNotification.objects.filter(user=request.user, read=False)
        if isinstance(ids, list) and ids:
            qs = qs.filter(id__in=[i for i in ids if isinstance(i, int)])
        updated = qs.update(read=True)
        return Response({'marked': updated})


class PushKeyView(APIView):
    """The server's VAPID public key, for the browser's subscription call.

    This is the only door a browser has into push, so it also carries the one
    piece of configuration that lives in the database: a church with no key
    pair on record (a fresh install, a restored dump, a server where nobody ran
    the management command) would otherwise refuse every device that tried to
    enable notifications, with nothing to say for it. The pair is created here
    on first ask — never rotated, since a new pair invalidates the devices that
    already subscribed with the old one.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .models import ChurchSettings
        from .push import ensure_vapid_keys

        ensure_vapid_keys()
        row = ChurchSettings.objects.first()
        key = (row.vapid_public_key if row else '') or ''
        return Response({'public_key': key})


class PushTestView(APIView):
    """Send one test notice to this account's devices and report each answer.

    A member who gets nothing on their phone has no way to tell whether the
    device was never subscribed, whether the row is stale, or whether the push
    service refused it — and neither does the office. This answers with the
    device count and the delivery result per device, which is what turns
    "notifications don't work" into a sentence somebody can act on.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        from .push import send_test_push

        report = send_test_push(request.user)
        return Response(report)


class PushSubscribeView(APIView):
    """Register or remove this browser's push subscription.

    POST stores the endpoint + encryption keys against the signed-in account;
    DELETE removes it (used both by “turn off” and by the service worker when
    the browser itself retires the subscription).
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        from .models import PushSubscription

        endpoint = (request.data.get('endpoint') or '').strip()
        keys = request.data.get('keys') or {}
        p256dh = (keys.get('p256dh') or '').strip()
        auth = (keys.get('auth') or '').strip()
        if not endpoint or not p256dh or not auth:
            return Response(
                {'error': 'endpoint and keys are required'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        PushSubscription.objects.update_or_create(
            endpoint=endpoint[:500],
            defaults={'user': request.user, 'p256dh': p256dh[:120], 'auth': auth[:120]},
        )
        return Response({'status': 'subscribed'})

    def delete(self, request):
        from .models import PushSubscription

        endpoint = (request.data.get('endpoint') or '').strip()
        if endpoint:
            PushSubscription.objects.filter(endpoint=endpoint[:500], user=request.user).delete()
        return Response({'status': 'unsubscribed'})


class VisitationRequestView(generics.ListCreateAPIView):
    permission_classes = [AllowAny]
    serializer_class = VisitationRequestSerializer

    def get_queryset(self):
        user = self.request.user
        if user and user.is_authenticated:
            profile = getattr(user, 'member_profile', None)
            if profile and profile.has_role('admin', 'clerk', 'elder', 'pastor', 'chaplaincy'):
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
        ministry = (request.data.get('ministry') or '').strip()
        if ministry and ministry not in {code for code, _label in MemberProfile.MINISTRY_CHOICES}:
            return Response({'ministry': 'Choose one of the listed ministries.'}, status=status.HTTP_400_BAD_REQUEST)
        department = (request.data.get('department') or '').strip()
        if department and department not in {code for code, _label in MemberProfile.DEPARTMENT_CHOICES}:
            return Response({'department': 'Choose one of the listed departments.'}, status=status.HTTP_400_BAD_REQUEST)
        department_ref_code = (request.data.get('department_ref') or '').strip()
        department_ref_row = None
        if department_ref_code:
            department_ref_row = Department.objects.filter(code=department_ref_code, is_active=True).first()
            if department_ref_row is None:
                return Response({'department_ref': 'Choose one of the listed departments.'}, status=status.HTTP_400_BAD_REQUEST)
        raw_ministries = request.data.get('ministries')
        ministry_wanted = (
            raw_ministries
            if isinstance(raw_ministries, list)
            else [part.strip() for part in str(raw_ministries or '').split(',') if part.strip()]
        )
        ministry_codes = [str(code).strip() for code in ministry_wanted if str(code).strip()]
        ministry_rows = list(Department.objects.filter(code__in=ministry_codes, is_active=True))
        if len(ministry_rows) != len(set(ministry_codes)):
            return Response({'ministries': 'Choose from the listed ministries.'}, status=status.HTTP_400_BAD_REQUEST)
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
        profile_obj.ministry = ministry
        profile_obj.department = department
        profile_obj.department_ref = department_ref_row
        profile_obj.gifts = str(gifts or '').strip()
        profile_obj.disability = str(disability or '').strip()
        if date_of_birth:
            profile_obj.date_of_birth = date_of_birth
        profile_obj.save()
        if ministry_rows:
            profile_obj.ministries.set(ministry_rows)
        sync_role_groups(user, roles_param)

        response_data = UserDetailSerializer(user).data
        if password_generated:
            # Surface the one-time password: the console has no password field, so
            # without this the new account would exist but nobody could sign in.
            response_data['temporary_password'] = password
        return Response(response_data, status=status.HTTP_201_CREATED)


class MemberProfileView(APIView):
    """The church's full record of one member, for the office's See Profile view."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        viewer_profile = getattr(request.user, 'member_profile', None)
        if not viewer_profile or not viewer_profile.has_role('admin', 'clerk', 'elder'):
            return Response({'detail': 'Only church officers can view member profiles.'}, status=status.HTTP_403_FORBIDDEN)
        try:
            target_user = User.objects.select_related('member_profile').get(pk=pk)
        except User.DoesNotExist:
            return Response({'detail': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(member_profile_payload(target_user))


def member_profile_payload(user):
    """Everything the See Profile view shows, in one read-only payload."""
    profile = getattr(user, 'member_profile', None)
    history = RoleHistory.objects.filter(member=user)
    current = list(history.filter(ended_at__isnull=True))
    past = list(history.filter(ended_at__isnull=False))
    held_now = {row.role for row in current}

    def row(row_):
        return {
            'role': row_.role,
            'role_label': role_label(row_.role),
            'started_at': row_.started_at,
            'ended_at': row_.ended_at,
        }

    dept_label = ''
    if profile:
        if profile.department_ref:
            dept_label = profile.department_ref.name
        elif profile.department:
            dept_label = profile.get_department_display()

    ministry_names = []
    if profile:
        ministry_names = list(profile.ministries.values_list('name', flat=True))
        if not ministry_names and profile.ministry:
            ministry_names = [profile.get_ministry_display()]

    return {
        **UserDetailSerializer(user).data,
        'date_joined': user.date_joined,
        'ministry_label': ", ".join(ministry_names) if ministry_names else '',
        'ministries_list': ministry_names,
        'department_label': dept_label,
        'baptismal_status_label': profile.get_baptismal_status_display() if profile and profile.baptismal_status else '',
        'current_roles': [row(r) for r in current],
        'past_roles': [row(r) for r in past],
        # The office's own assessment of whether the member currently holds
        # each role they have ever served in, for the card's chip.
        'ever_held_roles': sorted(held_now | {r.role for r in past}),
    }


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
        # Collected first, applied at the end: the department/ministry blocks
        # below also record their changes here, so the dict must exist before
        # they run — it used to be built after them, and any edit touching
        # those fields died with an UnboundLocalError.
        changes = {}
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
            'department': 'department',
            'disability': 'disability',
        }

        if 'department' in request.data:
            department = str(request.data.get('department') or '').strip()
            if department and department not in {code for code, _label in MemberProfile.DEPARTMENT_CHOICES}:
                return Response({'department': 'Choose one of the listed departments.'}, status=status.HTTP_400_BAD_REQUEST)

        if 'department_ref' in request.data:
            ref_code = str(request.data.get('department_ref') or '').strip()
            if ref_code:
                if not Department.objects.filter(code=ref_code, is_active=True).exists():
                    return Response({'department_ref': 'Choose one of the listed departments.'}, status=status.HTTP_400_BAD_REQUEST)
            current_ref = target_profile.department_ref.code if target_profile.department_ref else ''
            if ref_code != current_ref:
                changes['department_ref'] = ref_code

        if 'ministries' in request.data:
            raw_ministries = request.data.get('ministries')
            wanted = (
                raw_ministries
                if isinstance(raw_ministries, list)
                else [part.strip() for part in str(raw_ministries or '').split(',') if part.strip()]
            )
            ministry_codes = sorted({str(c).strip() for c in wanted if str(c).strip()})
            if ministry_codes:
                valid_count = Department.objects.filter(code__in=ministry_codes, is_active=True).count()
                if valid_count != len(ministry_codes):
                    return Response({'ministries': 'Choose from the listed ministries.'}, status=status.HTTP_400_BAD_REQUEST)
            current_min_codes = sorted(target_profile.ministries.values_list('code', flat=True))
            if ministry_codes != current_min_codes:
                changes['ministries'] = ministry_codes

        def normalise(field, value):
            if field in ('gifts', 'disability') and isinstance(value, list):
                return ", ".join(str(g).strip() for g in value if str(g).strip())
            if field == 'date_of_birth':
                return value or None
            return value

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

        # Admins editing their own profile with name changes can apply immediately
        is_own_profile = target_user.id == request.user.id
        is_name_change = (
            'first_name' in changes or 'last_name' in changes
        )
        is_admin_editing_own_name = is_own_profile and is_name_change

        if is_admin_editing_own_name:
            # Apply the changes immediately without a proposal
            target_profile.save(update_fields=list(changes.keys()))
            # Notify church about the admin edit via a less intrusive means
            # (no profile change request needed since admin has authority)
            return Response(
                UserDetailSerializer(target_user).data,
                status=status.HTTP_200_OK,
            )

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
                if field == 'department_ref':
                    profile.department_ref = Department.objects.filter(code=value, is_active=True).first() if value else None
                elif field == 'ministries':
                    if isinstance(value, list):
                        profile.ministries.set(Department.objects.filter(code__in=value, is_active=True))
                elif field in account_fields:
                    setattr(member, field, value)
                elif hasattr(profile, field):
                    setattr(profile, field, value)
            member.save(update_fields=[f for f in account_fields if f in proposal.changes])
            profile_fields = [f for f in proposal.changes if f not in account_fields and f not in ('ministries',)]
            if profile_fields:
                profile.save(update_fields=profile_fields)
            else:
                profile.save()
            proposal.status = 'approved'
            proposal.decided_at = timezone.now()
            proposal.save(update_fields=['status', 'decided_at'])
            return Response({'detail': 'Profile updated. Thank you for confirming your details.', 'status': 'approved'})

        proposal.status = 'kept'
        proposal.decided_at = timezone.now()
        proposal.save(update_fields=['status', 'decided_at'])
        return Response({'detail': 'Your details were kept as they are.', 'status': 'kept'})


class NameChangeDecisionView(APIView):
    """Approve or refuse a proposed name change. Only the member decides."""

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

        if proposal.change_type != 'name':
            return Response({'detail': 'This proposal is not a name change.'}, status=status.HTTP_400_BAD_REQUEST)

        member = proposal.member
        if decision == 'approve':
            first_name = proposal.changes.get('first_name')
            last_name = proposal.changes.get('last_name')
            if first_name:
                member.first_name = first_name
            if last_name:
                member.last_name = last_name
            member.save(update_fields=['first_name', 'last_name'])
            proposal.status = 'approved'
            proposal.decided_at = timezone.now()
            proposal.save(update_fields=['status', 'decided_at'])
            return Response({'detail': 'Name updated. Thank you for confirming your details.', 'status': 'approved'})

        proposal.status = 'rejected'
        proposal.save(update_fields=['status'])
        return Response({'detail': 'Name change rejected.'})


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
            role_display = role_labels_with_assistants(target_profile, roles_param)
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


class UserActivationView(APIView):
    """Switch an account off, or back on again.

    Deactivating is the gentler sibling of removing someone: the record, the
    roles, the giving history and the roll membership all stay, but the login
    stops working — the JWT authentication rule refuses an inactive account, so
    even a session already signed in dies on its next request. It is meant for
    the accounts that should not sign in right now (someone who has left the
    area, a duplicate registration, an account under review), never as a way to
    erase a person: that is the Remove action's job.

    Reactivating clears the stamp, so the roster can tell a switched-off
    account from one that is merely still waiting for leadership approval —
    both are inactive, and only the switched-off one has anything to restore.
    """

    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        current_profile = getattr(request.user, 'member_profile', None)
        if not current_profile or not current_profile.has_role('admin', 'elder', 'clerk'):
            return Response(
                {'detail': 'Only church administrators, elders or clerks can activate or deactivate an account.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        requested = request.data.get('is_active')
        # A JSON boolean, or one of the words a plain form would send. A string
        # outside that list is refused rather than read as "off": a typo must
        # never lock a member out of their own account.
        if isinstance(requested, str):
            word = requested.strip().lower()
            if word in ('true', '1', 'yes'):
                requested = True
            elif word in ('false', '0', 'no'):
                requested = False
            else:
                requested = None
        if not isinstance(requested, bool):
            return Response(
                {'is_active': 'Send is_active as true (activate) or false (deactivate).'},
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

        target_profile, _ = MemberProfile.objects.get_or_create(user=target_user)

        if not requested:
            if target_user.pk == request.user.pk:
                return Response(
                    {'detail': 'You cannot deactivate your own account.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            # Deactivating an administrator is an administrators' decision, the
            # same rule that governs handing the role out.
            if target_profile.has_role('admin') and not current_profile.has_role('admin'):
                return Response(
                    {'detail': 'Only an administrator can deactivate another administrator.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if not target_user.is_active and target_profile.deactivated_at:
                return Response({'detail': f'{target_user.username} is already deactivated.'},
                                status=status.HTTP_400_BAD_REQUEST)
        else:
            if target_user.is_active and not target_profile.deactivated_at:
                return Response({'detail': f'{target_user.username} is already active.'},
                                status=status.HTTP_400_BAD_REQUEST)

        target_user.is_active = requested
        target_user.save(update_fields=['is_active'])
        target_profile.deactivated_at = None if requested else timezone.now()
        target_profile.save(update_fields=['deactivated_at'])

        # An account switched back on has a member who can read a note; one
        # switched off cannot sign in to read anything.
        if requested:
            ChurchNotification.objects.create(
                user=target_user,
                title='Your account is active again',
                message=(
                    f"Your account at {current_church_name()} has been reactivated. "
                    "You can sign in again with your usual password."
                ),
            )
            # When an account is approved/activated, mark any pending join requests as approved
            # so they no longer show in unapproved requests.
            EnrollmentRequest.objects.filter(
                Q(user=target_user) | Q(email__iexact=target_user.email),
                status__in=['pending', 'verification_pending'],
            ).update(status='approved')
            send_membership_approval_email(
                target_user,
                church_name=current_church_name(),
                name=target_user.first_name,
                phone=target_profile.phone_number,
            )

        serializer = UserDetailSerializer(target_user)
        data = dict(serializer.data)
        data['detail'] = (
            f"{target_user.username} can sign in again."
            if requested
            else f"{target_user.username} can no longer sign in. Their record and history are untouched."
        )
        return Response(data)


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


class MemberNameSearchView(APIView):
    """Name search over the roll — the picker behind "give for someone".

    The gift form's person field searches as the giver types, so this returns
    a short list of id-and-name matches and nothing else: the roll is a
    member's to read, never the public's, so it needs a session; and a search
    result is a name to pick, not a contact card to harvest — no emails, no
    phone numbers. The gift's own receipt goes to the account the id points
    at, resolved on the server where the address never leaves it.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        query = (request.query_params.get('q') or request.query_params.get('query') or '').strip()
        if len(query) < 2:
            return Response({'matches': []})
        matches = User.objects.filter(is_active=True).filter(
            Q(first_name__icontains=query)
            | Q(last_name__icontains=query)
            | Q(username__icontains=query)
            | Q(member_profile__phone_number__icontains=query)
        ).select_related('member_profile').order_by('first_name', 'last_name', 'username')[:8]
        return Response({'matches': [
            {
                'id': user.id,
                'name': (user.get_full_name() or user.username).strip(),
                'phone': getattr(getattr(user, 'member_profile', None), 'phone_number', '') or '',
                'gender': getattr(getattr(user, 'member_profile', None), 'gender', '') or '',
            }
            for user in matches
        ]})


class GivingRequestView(APIView):
    """Ask a member to give: the request, its prompt, and its delivery.

    The mirror of giving for someone — instead of giving in a person's name,
    you ask a person to give in yours. The second modal (the giving form)
    carries the account and the amount, and submitting sends an M-Pesa prompt
    to the phone of the person asked for exactly that gift: they choose by
    entering their PIN, or by giving nothing. The request is also emailed to
    the person named (their account address — never one typed into the form)
    with a link that opens the giving page; a gift made through that link —
    or through the prompt — closes the request. Only members may ask: a
    request without a name behind it is nothing the recipient could act on.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        mine = GivingRequest.objects.filter(requester=request.user).select_related('target')[:50]
        return Response({'requests': [
            {
                'id': row.id,
                'target_name': row.target.get_full_name() or row.target.username,
                'relationship': row.relationship,
                'relationship_display': row.get_relationship_display(),
                'message': row.message,
                'purpose': row.purpose,
                'amount': format(row.amount.normalize(), 'f') if row.amount is not None else None,
                'status': row.status,
                'fulfilled_at': row.fulfilled_at,
                'created_at': row.created_at,
            }
            for row in mine
        ]})

    def post(self, request):
        target_id = request.data.get('target_id')
        relationship = (request.data.get('relationship') or '').strip()
        message = (request.data.get('message') or '').strip()
        # The gift being asked for — account, amount, and the phone the
        # M-Pesa prompt lands on — all arrive from the giving form, the
        # request's second modal. The phone is optional: without it the
        # number on the person's own account is prompted instead.
        giver_phone = (request.data.get('giver_phone') or '').strip()
        purpose = (request.data.get('purpose') or '').strip()
        raw_amount = request.data.get('amount')

        target = User.objects.filter(pk=target_id, is_active=True).first() if target_id else None
        if target is None:
            return Response(
                {'detail': 'Choose the person you are asking from the list.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if target.pk == request.user.pk:
            return Response(
                {'detail': 'You cannot ask yourself to give — use Give Now.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not relationship:
            # The request form no longer asks how the person relates: the
            # member declares relationships once, on their profile, and the
            # request reads the declared answer. Nothing declared reads as
            # Other.
            requester_profile = getattr(request.user, 'member_profile', None)
            relationship = (
                requester_profile.declared_relationship_for_person(target.pk) if requester_profile else ''
            ) or 'other'
        if relationship not in dict(GIFT_RELATIONSHIP_CHOICES):
            return Response(
                {'relationship': 'Say how they relate to you — spouse, parent, sibling, child, friend or other.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not purpose:
            return Response(
                {'purpose': 'Choose the giving account this request is for.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            amount = Decimal(str(raw_amount)) if raw_amount not in (None, '') else None
        except (InvalidOperation, ValueError, TypeError):
            amount = None
        if amount is None or amount < 1:
            return Response(
                {'amount': 'Enter an amount of at least KES 1.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # How the amount reads everywhere a human does: KES 1000, not 1000.00.
        amount_text = format(amount.normalize(), 'f')

        # Where the prompt goes: the phone typed into the form, or the number
        # on the person's own account when none was. A typed number must be a
        # Kenyan line M-Pesa can reach.
        prompt_phone = ''
        if giver_phone:
            try:
                prompt_phone = normalize_mpesa_phone(giver_phone)
            except ValueError:
                return Response(
                    {'giver_phone': 'Enter a valid 10-digit phone number, for example 0712345678.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            profile_phone = MemberProfile.objects.filter(
                user=target
            ).values_list('phone_number', flat=True).first()
            if profile_phone:
                try:
                    prompt_phone = normalize_mpesa_phone(profile_phone)
                except ValueError:
                    prompt_phone = ''

        giving_request = GivingRequest.objects.create(
            requester=request.user,
            target=target,
            relationship=relationship,
            message=message[:1000],
            giver_phone=giver_phone,
            amount=amount,
            purpose=purpose,
        )

        # The letter: to the target's own account address, so a request can
        # never be steered into a stranger's inbox. It carries the link that
        # opens the giving page — a gift through it closes the request.
        target_email = (target.email or '').strip()
        if target_email:
            requester_name = request.user.get_full_name() or request.user.username
            relationship_label = (dict(GIFT_RELATIONSHIP_CHOICES).get(relationship) or 'friend').lower()
            give_link = f"{settings.FRONTEND_URL}/give?request={giving_request.pk}"
            lines = [
                f"Dear {target.get_full_name() or target.username},\n\n",
                f"{requester_name}, your {relationship_label}, has asked you to give.\n\n",
            ]
            if message:
                lines.append(f'"{message}"\n\n')
            if amount is not None and purpose:
                lines.append(f'Give KES {amount_text} toward {purpose}.\n\n')
            lines.extend([
                f"Give when you are ready: {give_link}\n\n",
                "Nothing here is a debt — a request is an invitation, and the "
                "church is grateful either way.\n\n",
                f"Yours in Christ,\n{current_church_name()} Stewardship",
            ])
            send_mail(
                f"{requester_name} has asked you to give",
                ''.join(lines),
                sender_for(MONEY),
                [target_email],
                connection=connection_for(MONEY),
                fail_silently=True,
            )
        try:
            ChurchNotification.objects.create(
                user=target,
                title=f"{request.user.get_full_name() or request.user.username} asks you to give",
                message=message or 'A member has asked you to give.',
                link=f'/give?request={giving_request.pk}',
            )
        except Exception:
            # The bell is a courtesy; the request stands without it.
            logger.exception('Giving request notification (%s) failed.', giving_request.pk)

        # The prompt: one push to the phone of the person asked, for the
        # amount and the account the requester chose — they give by entering
        # their PIN, or not at all. Nothing is written until Safaricom's
        # callback confirms the money; the request id rides the signed
        # context, so the landing gift closes the request.
        prompt_sent = False
        prompt_problem = ''
        if prompt_phone:
            short_account = purpose
            for option in giving_account_options():
                if purpose.lower() in (option['label'].lower(), option['name'].lower()):
                    short_account = option['account']
                    break
            context = {
                'amount': amount_text,
                'purpose': purpose,
                'allocations': [
                    {'purpose': purpose, 'account': str(short_account)[:12], 'amount': amount_text}
                ],
                'phone_number': prompt_phone,
                # The person asked is the one giving: the gift lands on their
                # record even when the prompt is paid from another line.
                'member_id': target.pk,
                'giving_request_id': giving_request.pk,
            }
            try:
                initiate_stk_push_for_context(
                    phone_number=prompt_phone,
                    amount=amount,
                    purpose=str(short_account)[:12],
                    context_token=pack_callback_context(context),
                )
                prompt_sent = True
            except MpesaConfigurationError as error:
                prompt_problem = str(error)
            except Exception as error:
                prompt_problem = f'We could not send the M-Pesa prompt: {error}'
        else:
            prompt_problem = 'there is no phone number we could send an M-Pesa prompt to'

        target_name = target.get_full_name() or target.username
        detail = (
            f'Your request has been sent to {target_name} — an M-Pesa prompt for '
            f'KES {amount_text} toward {purpose} has gone to their phone.'
            if prompt_sent else
            f'Your request has been sent to {target_name}.'
        )
        if not prompt_sent and prompt_problem:
            detail += f' No M-Pesa prompt went out: {prompt_problem}.'
        if not target_email:
            detail += (
                f' {target_name} has no email on their account, so the letter '
                'was recorded but not delivered.'
            )

        return Response(
            {
                'detail': detail,
                'id': giving_request.pk,
                'prompt_sent': prompt_sent,
            },
            status=status.HTTP_201_CREATED,
        )


class GivingRequestDetailView(APIView):
    """One request, read through its own link.

    The emailed link is the credential: whoever holds it may read the few
    lines that tell them what was asked (who asked, how they relate, the
    note) — the recipient is not asked to sign in before they know what they
    are being asked for. Only the address bar carries the id; nothing else
    about either person leaves the server.
    """

    permission_classes = [AllowAny]

    def get(self, request, pk):
        row = GivingRequest.objects.select_related('requester').filter(pk=pk).first()
        if row is None:
            return Response({'detail': 'That request no longer exists.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({
            'id': row.id,
            'requester_id': row.requester_id,
            'requester_name': row.requester.get_full_name() or row.requester.username,
            'relationship': row.relationship,
            'relationship_display': row.get_relationship_display(),
            'message': row.message,
            # What was asked for: the giving form preselects both when the
            # recipient opens the link.
            'purpose': row.purpose,
            'amount': format(row.amount.normalize(), 'f') if row.amount is not None else None,
            'status': row.status,
        })


class LessonRequestView(APIView):
    """The Sabbath School's lesson requests: send one, read the queue.

    Every church member is on the school's roll by default, so every member
    may ask. The reader sees their own requests beside the whole queue only
    when they hold the school's desk (its Leader — the superintendent — or
    an officer); everyone else reads only what they themselves asked, for a
    queue is the desk's work, not the congregation's mirror.
    """

    permission_classes = [IsAuthenticated]

    @staticmethod
    def _row(row):
        status_val = 'delivered' if row.status in ('delivered', 'served') else 'pending'
        profile = getattr(row.member, 'member_profile', None)
        phone = getattr(profile, 'phone_number', '') if profile else ''
        delivered_by_name = (
            row.served_by.get_full_name() or row.served_by.username
        ) if row.served_by_id else ''
        return {
            'id': row.id,
            'lesson': row.lesson,
            'quantity': getattr(row, 'quantity', 1) or 1,
            'note': row.note,
            'status': status_val,
            'created_at': row.created_at,
            'delivered_at': row.served_at,
            'delivered_by_name': delivered_by_name,
            'member_name': (
                row.member.get_full_name() or row.member.username
            ),
            'member_phone': phone,
            'served_at': row.served_at,
            'served_by_name': delivered_by_name,
        }

    def get(self, request):
        serves_the_desk = can_manage_department(request.user, SABBATH_SCHOOL_CODE)
        if serves_the_desk:
            rows = LessonRequest.objects.select_related('member', 'member__member_profile', 'served_by')[:100]
        else:
            rows = LessonRequest.objects.filter(
                member=request.user,
            ).select_related('member', 'member__member_profile', 'served_by')[:100]
        queue = []
        for row in rows:
            item = self._row(row)
            item['mine'] = row.member_id == request.user.id
            queue.append(item)
        return Response({
            'requests': queue,
            'orders': queue,
            'can_serve': serves_the_desk,
            'can_deliver': serves_the_desk,
        })

    def post(self, request):
        lesson = (request.data.get('lesson') or '').strip()
        note = (request.data.get('note') or '').strip()
        raw_qty = request.data.get('quantity', 1)
        try:
            quantity = max(1, int(raw_qty))
        except (TypeError, ValueError):
            quantity = 1

        if not lesson:
            return Response(
                {'lesson': 'Choose or specify the lesson you would like to order.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        row = LessonRequest.objects.create(
            member=request.user, lesson=lesson[:200], quantity=quantity, note=note[:1000],
        )
        data = self._row(row)
        data['mine'] = True
        return Response(
            {
                'detail': 'Your lesson order is placed with the Sabbath School leadership.',
                'order': data,
                'request': data,
            },
            status=status.HTTP_201_CREATED,
        )


class LessonRequestServeView(APIView):
    """Deliver or serve one lesson order — the school's superintendent / leadership desk.

    Delivering is the superintendent's own act: the mark records their name and
    the moment, so an order delivered from the front is traceable.
    A delivered order may be returned to the queue if marked by mistake.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not can_manage_department(request.user, SABBATH_SCHOOL_CODE):
            return Response(
                {'detail': 'Only the Sabbath School leadership may deliver lesson orders.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        row = LessonRequest.objects.filter(pk=pk).first()
        if row is None:
            return Response({'detail': 'That order no longer exists.'}, status=status.HTTP_404_NOT_FOUND)
        reopen = bool(request.data.get('reopen'))
        if reopen:
            row.status = 'pending'
            row.served_by = None
            row.served_at = None
            row.save(update_fields=['status', 'served_by', 'served_at'])
            return Response({'detail': 'The order is back in the queue.', 'status': row.status})

        # Preserve 'served' for backwards-compat if called via legacy /serve/ without deliver action
        is_deliver_route = 'deliver' in request.path or request.data.get('action') == 'deliver'
        row.status = 'delivered' if is_deliver_route else 'served'
        row.served_by = request.user
        row.served_at = timezone.now()
        row.save(update_fields=['status', 'served_by', 'served_at'])
        return Response({'detail': 'Order marked as delivered.', 'status': row.status})


LessonOrderView = LessonRequestView
LessonOrderDeliverView = LessonRequestServeView


class BaptismalClassView(APIView):
    """The baptismal class: the members the elders are preparing for baptism.

    The register is the eldership desk's own — who is being prepared, how
    they are getting on, and who brought them — so only that desk reads it
    and writes it. Adding names a member from the roll (the picker's id);
    someone with no account yet is written in by name, because a candidate
    for baptism is not held back by having no login.
    """

    permission_classes = [IsAuthenticated]

    @staticmethod
    def _row(row):
        name = (row.member.get_full_name() or row.member.username) if row.member_id else row.guest_name
        return {
            'id': row.id,
            'name': name,
            'status': row.status,
            'status_display': row.get_status_display(),
            'note': row.note,
            'added_by_name': (
                row.added_by.get_full_name() or row.added_by.username
            ) if row.added_by_id else '',
            'baptized_on': row.baptized_on,
            'created_at': row.created_at,
        }

    def get(self, request):
        if not can_manage_department(request.user, 'eldership'):
            return Response(
                {'detail': 'Only the eldership desk may read the baptismal class.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        rows = BaptismalClassEntry.objects.select_related('member', 'added_by')
        return Response({'entries': [self._row(row) for row in rows]})

    def post(self, request):
        if not can_manage_department(request.user, 'eldership'):
            return Response(
                {'detail': 'Only the eldership desk may add to the baptismal class.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        member_id = request.data.get('member_id')
        guest_name = (request.data.get('guest_name') or '').strip()
        note = (request.data.get('note') or '').strip()
        member = None
        if member_id:
            member = User.objects.filter(pk=member_id, is_active=True).first()
            if member is None:
                return Response(
                    {'member_id': 'That member could not be found.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        if member is None and not guest_name:
            return Response(
                {'detail': 'Pick a member from the roll, or write in a name for a candidate without an account.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if member and BaptismalClassEntry.objects.filter(member=member, status__in=('preparing', 'ready')).exists():
            return Response(
                {'detail': 'That member is already in the baptismal class.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        row = BaptismalClassEntry.objects.create(
            member=member, guest_name=guest_name if member is None else '',
            note=note[:1000], added_by=request.user,
        )
        return Response(
            {'detail': 'Added to the baptismal class.', 'entry': self._row(row)},
            status=status.HTTP_201_CREATED,
        )


class BaptismalClassEntryView(APIView):
    """One candidate's row: move their preparation on, or take them off.

    The statuses walk the way the class walks — preparing, ready, baptised
    — and baptising stamps the day. Taking a name off the register is the
    desk's own act too; it needs no ceremony, only the keys.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not can_manage_department(request.user, 'eldership'):
            return Response(
                {'detail': 'Only the eldership desk may update the baptismal class.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        row = BaptismalClassEntry.objects.filter(pk=pk).first()
        if row is None:
            return Response({'detail': 'That entry no longer exists.'}, status=status.HTTP_404_NOT_FOUND)
        if request.data.get('remove'):
            row.delete()
            return Response({'detail': 'The name is off the baptismal class.'})
        new_status = (request.data.get('status') or '').strip()
        if new_status not in ('preparing', 'ready', 'baptised'):
            return Response(
                {'status': 'Choose preparing, ready, or baptised.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        row.status = new_status
        fields = ['status', 'updated_at']
        if new_status == 'baptised' and row.baptized_on is None:
            row.baptized_on = timezone.localdate()
            fields.append('baptized_on')
        if new_status != 'baptised':
            row.baptized_on = None
            fields.append('baptized_on')
        note = request.data.get('note')
        if note is not None:
            row.note = str(note)[:1000]
            fields.append('note')
        row.save(update_fields=fields)
        return Response({'detail': f'Marked {row.get_status_display().lower()}.', 'entry': BaptismalClassView._row(row)})


class DailyWordView(APIView):
    """The daily word: today's devotional thought, and the desk that writes it.

    Any signed-in member may read it — a devotional thought meant to be
    shared reads like one. The eldership desk writes it, and one day holds
    one word: posting again replaces the day's own thought rather than
    stacking two. Days before today are kept, so the record of what the
    church has been fed does not vanish when the day turns over.
    """

    permission_classes = [IsAuthenticated]

    @staticmethod
    def _row(row):
        # The writer's own picture, where they have one: the thought is read as
        # written by a person, and the church knows that person's face. An
        # account without a picture answers with an empty line, which the
        # readers draw nothing beside (a broken image is never the fallback).
        profile = getattr(row.author, 'member_profile', None) if row.author_id else None
        return {
            'id': row.id,
            'date': row.date,
            'text': row.text,
            'author_name': (
                row.author.get_full_name() or row.author.username
            ) if row.author_id else '',
            'author_photo_url': getattr(profile, 'photo_url', '') or '',
            'updated_at': row.updated_at,
        }

    def get(self, request):
        today = timezone.localdate()
        row = DailyWord.objects.filter(date=today).select_related('author', 'author__member_profile').first()
        recent = list(DailyWord.objects.select_related('author', 'author__member_profile').order_by('-date')[:14])
        return Response({
            'today': self._row(row) if row else None,
            'recent': [self._row(item) for item in recent],
            'can_write': can_manage_department(request.user, 'eldership'),
        })

    def post(self, request):
        if not can_manage_department(request.user, 'eldership'):
            return Response(
                {'detail': 'Only the eldership desk may write the daily word.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        text = (request.data.get('text') or '').strip()
        if not text:
            return Response(
                {'text': 'Write the thought for today first.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(text) > 2000:
            return Response(
                {'text': 'A daily word is a short thought — keep it under 2000 characters.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        today = timezone.localdate()
        row, created = DailyWord.objects.update_or_create(
            date=today,
            defaults={'text': text, 'author': request.user},
        )
        return Response(
            {'detail': 'The daily word is shared.', 'today': self._row(row)},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


from .pdf_generator import (
    generate_treasury_pdf,
    generate_member_giving_statement_pdf,
    generate_business_meeting_pdf,
    generate_financial_report_pdf,
    generate_contribution_thermal_receipt_pdf,
    generate_in_kind_thermal_receipt_pdf,
)

class TreasuryPdfView(APIView):
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
            # The raw spelling may name the same account another row already
            # opened (an 'LCB' beside a 'Local Church Budget'): the canonical
            # key folds them onto the one row the report should read.
            p = canonical_purpose_name(c.purpose)
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
            p = canonical_purpose_name(c.purpose)
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
                    "purpose_name": canonical_purpose_name(d.purpose),
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
                    "purpose_name": canonical_purpose_name(c.purpose),
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

        pdf_bytes = generate_treasury_pdf(
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
            signatures=report_signatures(),
        )

        filename = f"Individual_Givings_{purpose_param}_{start_date.strftime('%Y%m%d')}.pdf" if purpose_param else f"Financial_Treasury_{start_date.strftime('%Y%m%d')}.pdf"
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
            signatures=report_signatures(),
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

    The week grid is the whole month (so the Saturday columns read as the
    month they name), but the money in it is only what the selected range
    covers — a treasurer who asked for the 8th to the 9th gets those two
    days, not the month the range happens to sit in.
    """
    saturdays = _get_saturdays_in_month(start_date)
    if not saturdays:
        saturdays = [start_date]

    # Determine the month boundaries: the grid is the month the range names,
    # the money in it is only the range itself.
    last_sat = saturdays[-1]
    # Week ends the Friday after the last Saturday
    month_end = last_sat + timedelta(days=6)
    # But cap at end_date if user specified a range
    if end_date < month_end:
        month_end = end_date
    # …and open at start_date, so a range that starts on the 8th does not
    # carry the 1st to the 7th with it.
    month_start = start_date

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
        p = canonical_purpose_name(c.purpose)
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
        p = canonical_purpose_name(c.purpose)
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


class TreasurySpreadsheetView(APIView):
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
        ws['A3'] = (
            f'CASH COUNT AND OFFERING REPORT SUMMARY '
            f'FROM {start_date.strftime("%Y-%m-%d")} TO {end_date.strftime("%Y-%m-%d")}'
        )
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
        def _purpose_total(buckets):
            """One purpose's money in a week: the four payment buckets summed.

            The weekly dict keeps the buckets and no total of its own (only
            the month-wide map carries one), so asking a week for its 'total'
            answered 0 and every purpose row of the grid read empty.
            """
            return sum(float(buckets.get(name, 0) or 0) for name in ('mpesa', 'bank_transfer', 'cheque', 'cash'))

        # Purposes fold their spellings against the rows: 'CampOffering'
        # keys as it arrived and the row is read 'Camp Offering', so one fund
        # does not fall through the rows because of its spacing.
        def _folded(name):
            return ''.join(str(name or '').lower().split())

        def _fold_matches(key, names):
            folded = _folded(key)
            return any(folded == _folded(name) for name in names)

        def _week_sum(week_purposes, purpose_names):
            total = 0.0
            for k, v in week_purposes.items():
                if _fold_matches(k, purpose_names):
                    total += _purpose_total(v)
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
                _purpose_total(v)
                for k, v in week_purposes.items()
                if not _fold_matches(k, claimed_lower)
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


class TreasuryDepartmentAssignmentsView(APIView):
    """View and update treasury accounts assigned to each department/ministry.

    Only treasurers and admins can update assignments.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .models import ChurchSettings, Department, TreasuryAccount
        departments = Department.objects.filter(is_active=True).order_by('sort_order', 'name')
        settings_row, _ = ChurchSettings.objects.get_or_create(pk=1)
        cfg = getattr(settings_row, 'department_accounts_config', None) or {}

        # Compute effective accounts per department
        result = []
        for dept in departments:
            # Check configured IDs first
            configured_ids = cfg.get(dept.code)
            if isinstance(configured_ids, list):
                account_ids = configured_ids
            else:
                # Derive defaults matching department_accounts()
                accs = department_accounts(request.user, dept.code)
                account_ids = [a.id for a in accs]

            result.append({
                'department_code': dept.code,
                'department_name': dept.name,
                'group': dept.group,
                'account_ids': account_ids,
            })
        return Response({
            'assignments': result,
            'config': cfg,
        })

    def put(self, request):
        if not (request.user.is_staff or getattr(request.user, "member_profile", None) and request.user.member_profile.has_role("admin", "treasurer")):
            return Response({"detail": "Only finance team can update department account assignments."}, status=status.HTTP_403_FORBIDDEN)
        from .models import ChurchSettings, Department, TreasuryAccount
        config = request.data.get('config')
        if not isinstance(config, dict):
            return Response({"detail": "config object is required."}, status=status.HTTP_400_BAD_REQUEST)

        valid_dept_codes = set(Department.objects.filter(is_active=True).values_list('code', flat=True))
        valid_account_ids = set(TreasuryAccount.objects.values_list('id', flat=True))

        cleaned_config = {}
        for dept_code, acc_ids in config.items():
            if dept_code not in valid_dept_codes:
                continue
            if isinstance(acc_ids, list):
                cleaned_ids = [int(aid) for aid in acc_ids if int(aid) in valid_account_ids]
                cleaned_config[dept_code] = cleaned_ids

        settings_row, _ = ChurchSettings.objects.get_or_create(pk=1)
        settings_row.department_accounts_config = cleaned_config
        settings_row.save(update_fields=['department_accounts_config'])
        return Response({"status": "success", "config": cleaned_config})


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
        raw_movements = list(qs[:150])
        enrich_transaction_descriptions(raw_movements)
        serializer = TreasuryAccountTransactionSerializer(raw_movements, many=True)
        return Response(serializer.data)


class TreasuryAwaitingView(APIView):
    """What is still waiting on the treasurer: department withdrawal requests
    and fund drives awaiting approval.

    Two queues, one place: the requests the treasurer still has to approve or
    decline, and the fund drives that are still awaiting the treasurer's
    approval. Only the treasurer and administrators reach this endpoint.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_treasurer_or_admin(request.user):
            return Response(
                {'detail': 'Only treasurers or administrators can see what is waiting on the treasury.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        withdrawal_requests = DepartmentWithdrawalRequest.objects.filter(
            status__in=['pending', 'pastor_approved', 'elder_approved'],
        ).count()

        fund_drives = FundraisingCampaign.objects.filter(
            approval_status='pending',
        ).count()

        return Response({
            'withdrawal_requests': withdrawal_requests,
            'fund_drives': fund_drives,
        })


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
    """Who keeps the deaconate's desks: the deacons themselves, and the office.

    The deaconate desk has no role code of its own (``deacon`` is not in
    ``roles.ROLE_DEFINITIONS``), so its membership and its leadership are read
    from the department itself: the roll is the deacons and deaconesses the
    church has seated (``DepartmentMembership``), and the board is its
    Leader/Assistant rows (``can_manage_department``). Both keep the property
    register and the duty rota — the desk that carries the church's furniture
    is the desk that records where it went — and the officers who run the rest
    of the church office, plus staff accounts, keep them as well.

    A plain member reaches neither: the register is the church's property, not
    the congregation's to edit.
    """
    if not user or not user.is_authenticated:
        return False
    if user.is_staff or user.is_superuser:
        return True
    profile = getattr(user, 'member_profile', None)
    if profile and profile.has_role('admin', 'clerk', 'elder', 'pastor'):
        return True
    if can_manage_department(user, 'deaconate'):
        return True
    return DepartmentMembership.objects.filter(
        member=user, department='deaconate',
    ).exists()


def tell_elders_of_property_request(row, raised_by):
    """Carry a register ask to the eldership: bell and email, the way the
    buy/repair asks have always travelled.

    The ask lands with the church's offices — the people who answer for the
    church's money — and the clerk rides along: the register and the
    correspondence are the clerk's hands. Best effort in both directions:
    an unanswered bell never fails the save that raised it.
    """
    audience_ids = set(
        User.objects.filter(
            Q(member_profile__role__in=['admin', 'pastor', 'elder']) | Q(member_profile__role='clerk'),
            is_active=True,
        ).values_list('id', flat=True)
    )
    audience_ids.discard(raised_by.id)
    audience = User.objects.filter(id__in=audience_ids, is_active=True)
    desk_link = f'{settings.FRONTEND_URL}/administration?tab=requests'
    asks = {
        'buy': f'the purchase of {row.item_name}',
        'repair': f'repairs to {row.item_name}',
        'add': f'the registration of {row.item_name} in the property register',
        'use': f'The {row.get_kind_display().lower()} of {row.item_name}',
        'stock': f'An addition to {row.item_name}',
        'movement': f'A movement of {row.item_name}',
        'remove': f'The removal of {row.item_name}',
    }
    subject = f'Property request from the deaconate: {row.item_name}'
    body = (
        f"{raised_by.get_full_name() or raised_by.get_username()} has asked for {asks.get(row.kind, asks['buy'])}"
        + (f" ({row.quantity} {row.get_kind_display().lower().replace(' of', '')})" if row.kind in ('use', 'stock') and row.quantity else '')
        + f". Open the requests desk to respond: {desk_link}"
    )
    ChurchNotification.objects.bulk_create([
        ChurchNotification(user=person, title=subject, message=body, link=desk_link)
        for person in audience
    ])
    try:
        send_mail(
            subject, body, settings.DEFAULT_FROM_EMAIL,
            [u.email for u in audience if u.email],
            fail_silently=True,
        )
    except Exception:
        pass


def apply_property_decision(row, approved):
    """Do the register work an eldership answer stands behind.

    A property ask is not paper older than the register it names: approving
    a use checks the items out of the store (or takes them off the count
    where they are being consumed), approving a stock addition raises the
    count, approving a movement or a removal applies it, and a new row's
    reading moves either way — out of pending into the register, or behind
    its Rejected badge. Returns an error sentence when the item the ask
    waited on has gone away while it waited, so the reviewer's alert says
    what was (not) done instead of pretending; the answer always saves.
    """
    item = row.item
    if row.kind in ('buy', 'repair'):
        return ''
    if item is None:
        if row.kind == 'remove' and approved:
            return f'"{row.item_name}" was already gone from the register, so there was nothing more to remove.'
        return f'"{row.item_name}" left the register while this request waited, so the answer ran on paper alone.'

    today = timezone.localdate()
    if row.kind == 'add':
        item.review_status = 'approved' if approved else 'rejected'
        item.save(update_fields=['review_status'])
        return ''
    if not approved:
        # An unanswered ask leaves the register exactly as it stood.
        return ''
    if row.kind == 'use':
        used = row.quantity or item.quantity
        if (row.details or {}).get('shared', 'reusable') == 'consumed':
            item.quantity = max(0, item.quantity - used)
            item.last_inspected_on = today
            item.save(update_fields=['quantity', 'last_inspected_on'])
            return f'{used} of "{row.item_name}" are taken off the count; {item.quantity} remain.'
        movement = InventoryMovement.objects.create(
            item=item, recorded_by=row.reviewed_by, action='check_out',
            moved_by=(row.details or {}).get('custodian') or row.requested_by.get_full_name() or row.requested_by.get_username(),
            destination=row.purpose or '',
            notes=f'Approved for use by the eldership. Request #{row.id} — {row.purpose}',
            state_after='in_use',
        )
        item.apply_movement(movement)
        return f'"{row.item_name}" checked out to {movement.moved_by}.'
    if row.kind == 'stock':
        item.quantity = item.quantity + (row.quantity or 0)
        item.last_inspected_on = today
        item.save(update_fields=['quantity', 'last_inspected_on'])
        return f'{row.quantity or 0} item(s) added; "{row.item_name}" now counts {item.quantity}.'
    if row.kind == 'movement':
        details = row.details or {}
        movement = InventoryMovement.objects.create(
            item=item, recorded_by=row.reviewed_by,
            # The action is what makes the answer read as custody rather than
            # a condition note: without it the item is marked in use while
            # nobody's name is put on it, and the line prints no verb.
            action=details.get('action') or '',
            moved_by=details.get('moved_by') or row.requested_by.get_full_name() or row.requested_by.get_username(),
            destination=details.get('destination') or '',
            notes=details.get('notes') or f'Approved movement. Request #{row.id}',
            state_after=details.get('state_after') or ('in_use' if details.get('action') == 'check_out' else 'good'),
        )
        item.apply_movement(movement)
        return f'"{row.item_name}" {movement.get_action_display().lower()} applied.'
    if row.kind == 'remove':
        name = item.name
        item.delete()
        # The ask keeps its story and loses its pointer: the row it named is
        # gone, so nothing later tries to save a request pointing at a row
        # that no longer exists.
        row.item = None
        return f'"{name}" is off the register; its movement lines went with it.'
    return ''


class InventoryItemListCreateView(APIView):
    """The deaconate property register: list the items, register a new one."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        # All authenticated members may read the inventory register; write
        # operations (POST, PATCH, DELETE) remain restricted to officers.
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
        # The desk saves its row the moment it types it in — the register
        # never loses what it was told — but a new row waits for an elder to
        # read it: raised on the requests desk with the row pinned to it, its
        # badge Pending until the answer comes back.
        item = serializer.save(registered_by=request.user, review_status='pending')
        ask = DeaconateRequest.objects.create(
            requested_by=request.user, kind='add', item=item,
            item_name=item.name[:200], quantity=item.quantity,
            note=str(request.data.get('notes') or '').strip()[:1000],
        )
        tell_elders_of_property_request(ask, request.user)
        return Response(InventoryItemSerializer(item).data, status=status.HTTP_201_CREATED)


class InventoryMovementCreateView(APIView):
    """Log a movement or condition change and bring its item in line with it.

    A condition report goes straight on the item — an officer walks the room,
    sees two tables with loose brackets, and the register says so the moment
    they write it. Anything that carries the church's things across a door is
    an ask, not an act: a check-out or check-in raised here goes to the
    eldership as a movement request, and the register does not move until an
    elder answers it.
    """

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

        if serializer.validated_data.get('action') == 'state_change':
            with transaction.atomic():
                movement = serializer.save(item=item, recorded_by=request.user)
                item.apply_movement(movement)

            # Re-read through the annotated queryset so the row we hand back counts
            # the movement just recorded instead of the count from before it.
            item = InventoryItem.objects.annotate(movement_count=Count('movements')).get(pk=item.pk)
            payload = InventoryItemSerializer(item).data
            payload['movement'] = InventoryMovementSerializer(movement).data
            return Response(payload, status=status.HTTP_201_CREATED)

        ask = DeaconateRequest.objects.create(
            requested_by=request.user, kind='movement', item=item,
            item_name=item.name[:200], quantity=item.quantity,
            purpose=serializer.validated_data.get('destination') or '',
            details={
                'action': serializer.validated_data.get('action') or '',
                'moved_by': serializer.validated_data.get('moved_by') or '',
                'destination': serializer.validated_data.get('destination') or '',
                'notes': serializer.validated_data.get('notes') or '',
            },
            note=serializer.validated_data.get('notes') or '',
        )
        tell_elders_of_property_request(ask, request.user)
        return Response({
            'status': 'pending',
            'detail': 'The movement is with the eldership: the register moves when an elder answers it.',
        }, status=status.HTTP_201_CREATED)


class InventoryItemDetailView(APIView):
    """One property item, removed from the register.

    A piece of property was entered by mistake, sold, or written off — the
    register must be able to lose the row, not just gain one. Only the item
    goes: its movement lines go with it (the audit trail belongs to the item,
    so a row without its item is a line about nothing), and only the
    deaconate's officers may do it, the same gate that registers one.
    """

    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        if not can_manage_deaconate(request.user):
            return Response(
                {'detail': 'Only church officers can remove church property.'},
                status=status.HTTP_403_FORBIDDEN,
            )
    def patch(self, request, pk):
        """An officer corrects a row the register already holds.

        The desk edits one field set at a time — a tag typed in, a room the
        item moved into, a quantity — so a partial write is the shape it
        asks for, and what it does not name is left as it stands. The edit
        gate is the one the registration takes, the same hands that keep
        the register honest.
        """
        if not can_manage_deaconate(request.user):
            return Response(
                {'detail': 'Only church officers can edit church property.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        item = InventoryItem.objects.filter(pk=pk).first()
        if item is None:
            return Response({'detail': 'Property item not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = InventoryItemSerializer(item, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk):
        """Raise the removal ask, not the removal.

        The register is the desk's ledger, but the item leaving it is the
        eldership's call — sold, written off or never the church's to have
        — so a delete here raises a removal request pinned to the row and
        the register does not move until an elder answers it.
        """
        if not can_manage_deaconate(request.user):
            return Response(
                {'detail': 'Only church officers can remove church property.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        item = InventoryItem.objects.filter(pk=pk).first()
        if item is None:
            return Response({'detail': 'Property item not found.'}, status=status.HTTP_404_NOT_FOUND)
        ask = DeaconateRequest.objects.create(
            requested_by=request.user, kind='remove', item=item,
            item_name=item.name[:200], quantity=item.quantity,
            note=str(request.data.get('note') or request.data.get('reason') or '').strip()[:1000],
        )
        tell_elders_of_property_request(ask, request.user)
        return Response({
            'status': 'pending',
            'detail': 'The removal is with the eldership: when an elder approves it, the row leaves the register.',
        })


def _officer_key(item):
    """Who an officer is on a line, for telling a newly rostered one apart."""
    if isinstance(item, dict):
        return str(item.get('member_id') or '') or str(item.get('name') or '').strip().lower()
    return str(item or '').strip().lower()


def notify_new_duty_officers(entry, previous_officers):
    """Tell each officer newly rostered on ``entry`` (bell, email and SMS).

    Only officers not already on the line before the save are told, so an edit
    that leaves the team unchanged sends nothing. Officers with no account are
    texted when a phone is on the line. Each notice is best-effort: nothing here
    can fail the save that triggered it.
    """
    from .duty import assignment_message, notify_officer, officer_phone, reminder_recipients, rostered_officers

    before = {_officer_key(item) for item in previous_officers}
    newly = [o for o in rostered_officers(entry) if _officer_key(o) not in before]
    if not newly:
        return
    church_name = current_church_name()
    accounts = {user.pk: user for _officer, user in reminder_recipients(entry)}
    for officer in newly:
        user = accounts.get(officer.get('member_id'))
        try:
            if user is not None:
                notify_officer(entry, officer, user, church_name, kind='assignment')
            elif officer_phone(officer, None):
                sms.send(
                    officer_phone(officer, None),
                    assignment_message(entry, officer, None, church_name),
                )
        except Exception:
            logger.exception('Duty assignment notice failed for line %s', entry.pk)


class DutyRotaView(APIView):
    """A desk's duty rota: read it, schedule a line, take one off.

    The rota was the one desk page still living in the browser: the deaconate
    kept its duties in an array, so a shift scheduled for next Sabbath was
    gone on the next reload. These are the church's rows instead.    Two desks keep one here — the deaconate's stewards, the Personal Ministries
    desk for its pulpit team, and the music department for its own players and
    singers — and each reads and writes its own lines only
    (``can_keep_rota``); ``?desk=pulpit`` asks for the pulpit's, ``?desk=music``
    for music's.

    ``GET`` hands the rota over in date order, the earliest duty first, and
    accepts ``from``/``to`` (YYYY-MM-DD) so a desk can read one month of it.
    ``POST`` schedules a line, ``PUT`` — on the detail path — rewrites one the
    desk has already scheduled (the duty itself, or the officers rostered on
    it), and ``DELETE`` takes one off, for the Sabbath whose rota was cancelled
    or written twice. A line never changes desk once written: its desk is who
    may touch it.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        desk = rota_desk_from(request)
        if not can_keep_rota(request.user, desk):
            return Response(
                {'detail': 'Only the officers who keep this desk can read its rota.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        rota = DutyRota.objects.select_related('created_by').filter(desk=desk)
        start = str(request.query_params.get('from') or '').strip()
        end = str(request.query_params.get('to') or '').strip()
        q = str(request.query_params.get('q') or request.query_params.get('query') or '').strip()
        if start:
            rota = rota.filter(duty_date__gte=start)
        if end:
            rota = rota.filter(duty_date__lte=end)
        if q:
            rota = rota.filter(
                Q(title__icontains=q)
                | Q(duty_type__icontains=q)
                | Q(shift__icontains=q)
                | Q(notes__icontains=q)
            )
        return Response(DutyRotaSerializer(rota, many=True).data)

    def post(self, request):
        # The desk is what the line says it is, and it must be a desk this
        # user keeps: a deacon cannot write a pulpit line, nor the reverse.
        desk = str(request.data.get('desk') or DutyRota.DESK_DEACONATE).strip().lower()
        if desk not in dict(DutyRota.DESK_CHOICES):
            desk = DutyRota.DESK_DEACONATE
        if not can_keep_rota(request.user, desk):
            return Response(
                {'detail': 'Only the officers who keep this desk can schedule a line on it.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = DutyRotaSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        entry = serializer.save(created_by=request.user)
        # The row is written; the ringing happens behind the response so the
        # desk is never held open by a mail host or the SMS gateway.
        send_rota_notices_after_save(entry, previous_officers=[], request=request)
        return Response(DutyRotaSerializer(entry).data, status=status.HTTP_201_CREATED)

    def delete(self, request, pk=None):
        if not keeps_any_rota(request.user):
            return Response(
                {'detail': 'Only the officers who keep a rota can remove its lines.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        entry = generics.get_object_or_404(DutyRota, pk=pk)
        if not can_keep_rota(request.user, entry.desk):
            return Response(
                {'detail': 'Only the officers who keep this desk can remove a line from it.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        title = entry.title
        entry.delete()
        return Response({'detail': f'"{title}" is off the duty rota.'})

    def put(self, request, pk=None):
        """Rewrite a line already on the rota — duty, or its officers.

        The schedule form is also the edit form: the desk opens a line,
        changes who is rostered or when the shift runs, and saves it back.
        The same validation runs as on scheduling, so an edited line is
        exactly as strict as a new one.
        """
        if not keeps_any_rota(request.user):
            return Response(
                {'detail': 'Only the officers who keep a rota can edit its lines.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        entry = generics.get_object_or_404(DutyRota, pk=pk)
        if not can_keep_rota(request.user, entry.desk):
            return Response(
                {'detail': 'Only the officers who keep this desk can edit a line on it.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        previous_officers = list(entry.assigned_team or [])
        serializer = DutyRotaSerializer(entry, data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        entry = serializer.save()
        send_rota_notices_after_save(entry, previous_officers=previous_officers, request=request)
        return Response(DutyRotaSerializer(entry).data, status=status.HTTP_200_OK)


class DutyRotaRemindView(APIView):
    """The duty's reminder run again, on the desk's own say-so — the whole
    team, or one officer by account id.

    The daily cron (``manage.py send_duty_reminders``) rings each line the
    day before its duty and stamps it ``reminder_sent_at`` so it is never
    rung twice. But the desk rings duties on its own schedule too: a rota
    written late on Friday is reminded by the desk itself, and a Sabbath
    morning phone call wants the whole team reached at once. ``force`` is
    what makes that honest — the cron's "never twice" stamp is for the cron;
    the desk ringing a line again is the desk's decision, not an accident.

    ``POST duty-rota/<pk>/remind/`` with no body reminds everyone on the
    line who holds a church account (bell, letter, text and push), exactly
    as the cron's run does, and re-stamps the line. With ``member_id`` it
    rings that one officer only — the card's per-officer Remind — and leaves
    the stamp as it is, so the day-before text still reaches the rest.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, pk=None):
        if not keeps_any_rota(request.user):
            return Response(
                {'detail': 'Only the officers who keep a rota can send its reminders.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        entry = generics.get_object_or_404(DutyRota, pk=pk)
        if not can_keep_rota(request.user, entry.desk):
            return Response(
                {'detail': 'Only the officers who keep this desk can remind its team.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        from .duty import (
            notify_officer, reminder_recipients, rostered_officers, send_duty_reminder,
        )

        church_name = current_church_name()

        member_id = request.data.get('member_id')
        if member_id not in (None, ''):
            try:
                member_id = int(member_id)
            except (TypeError, ValueError):
                return Response(
                    {'detail': 'member_id should be the officer\'s account id.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            officer = next(
                (o for o in rostered_officers(entry) if o.get('member_id') == member_id),
                None,
            )
            if officer is None:
                return Response(
                    {'detail': 'That officer is not rostered on this duty.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            accounts = {user.pk: user for _officer, user in reminder_recipients(entry)}
            user = accounts.get(member_id)
            if user is None:
                return Response(
                    {'detail': f'"{officer["name"]}" holds no church account to ring for reminders.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            sent = notify_officer(entry, officer, user, church_name, kind='reminder')
            return Response(
                {'detail': f'Reminder sent to {officer["name"]}.', 'sent': {'recipients': 1, **sent}}
            )

        report = send_duty_reminder(entry, church_name=church_name, force=True)
        recipients = report['recipients']
        detail = (
            f'Reminder sent to {recipients} officer{"" if recipients == 1 else "s"}.'
            if recipients
            else 'The line is stamped so the daily run cannot ring it twice, but nobody rostered on it holds a church account to send to.'
        )
        return Response({'detail': detail, 'sent': {
            'recipients': recipients,
            'bells': report['bell'],
            'letters': report['letters'],
            'texts': report['texts'],
            'pushes': report['pushes'],
        }})


class DutyRotaPdfView(APIView):
    """Generate and return an official aggregated PDF of one desk's rota."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        desk = rota_desk_from(request)
        if not can_keep_rota(request.user, desk):
            return Response(
                {'detail': 'Only the officers who keep this desk can export its rota.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        try:
            settings_obj = ChurchSettings.objects.first()
            church_name = settings_obj.church_name if settings_obj else "SDA Church"
        except Exception:
            church_name = "SDA Church"

        rota = DutyRota.objects.select_related('created_by').filter(desk=desk)
        start = str(request.query_params.get('from') or '').strip()
        end = str(request.query_params.get('to') or '').strip()
        q = str(request.query_params.get('q') or request.query_params.get('query') or '').strip()

        if start:
            rota = rota.filter(duty_date__gte=start)
        if end:
            rota = rota.filter(duty_date__lte=end)
        if q:
            rota = rota.filter(
                Q(title__icontains=q)
                | Q(duty_type__icontains=q)
                | Q(shift__icontains=q)
                | Q(notes__icontains=q)
                | Q(assigned_team__icontains=q)
            )

        entries = DutyRotaSerializer(rota, many=True).data

        from .pdf_generator import generate_duty_rota_pdf
        pdf_bytes = generate_duty_rota_pdf(
            church_name=church_name,
            rota_entries=entries,
            start_date=start or None,
            end_date=end or None,
            search=q or None,
        )
        tag = f"_{start}_to_{end}" if start and end else f"_{start or end}" if start or end else ""
        filename = f"Duty_Rota{tag}.pdf"
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response['Content-Disposition'] = f'inline; filename="{filename}"'
        return response



class DutyRotaPeopleView(APIView):
    """Who the rota's Add Officer modal suggests as the desk types: the roll.

    The gift form's name search (``lookup/names/``) hands back id-and-name
    only — a search result is a pick, not a contact card to harvest. The
    rota's modal is the opposite case: the desk rostering a duty fills a name,
    phone, email and role field from the one member behind the name, and the
    line has to carry the number its officers will be called on. So this
    answers with those four fields — and only for people who may write the
    rota in the first place, the same door the rota itself has.

    Two characters is the least that is worth searching for (a first name, a
    surname, the start of a phone number). Typing without picking stays
    allowed everywhere this list is offered: a deacon who holds no account in
    the church's app is still a deacon the rota must name.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        # The roll is the church's, not a desk's: any rota's stewards may look
        # a member up, since every desk rosters the same people.
        if not (can_keep_rota(request.user, DutyRota.DESK_DEACONATE)
                or can_keep_rota(request.user, DutyRota.DESK_PULPIT)
                or can_keep_rota(request.user, DutyRota.DESK_MUSIC)):
            return Response(
                {'detail': 'Only the officers who keep a rota can look up officers.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        query = (request.query_params.get('q') or request.query_params.get('query') or '').strip()
        if len(query) < 2:
            return Response({'matches': []})
        matches = (
            User.objects.filter(is_active=True)
            .filter(
                Q(first_name__icontains=query)
                | Q(last_name__icontains=query)
                | Q(username__icontains=query)
                | Q(email__icontains=query)
                | Q(member_profile__phone_number__icontains=query)
            )
            .select_related('member_profile')
            .order_by('first_name', 'last_name', 'username')[:8]
        )
        results = []
        for user in matches:
            profile = getattr(user, 'member_profile', None)
            # The plain "Member" role is what everyone holds; it says nothing
            # about the duty they are being rostered for, so it is left off.
            roles = [code for code in profile.get_roles() if code != DEFAULT_ROLE] if profile else []
            results.append({
                'id': user.id,
                'name': (user.get_full_name() or user.username).strip(),
                'phone': (profile.phone_number if profile else '') or '',
                'email': user.email or '',
                'role': role_labels(roles),
            })
        return Response({'matches': results})


# ── Departments ──────────────────────────────────────────────────────────────
# The elder's desk reads departments as units: one directory row per
# department carrying its leadership, roll size and calendar count, plus two
# nested endpoints for the roll and the calendar. Role changes themselves stay
# on the existing user-role endpoint — the department view only needs to read
# who holds what.


def role_labels_with_assistants(profile, codes):
    """Role labels that read "Assistant Choir Director" where the member
    holds the role as an assistant — the same wording the UI shows, so a
    letter about someone's service matches what they see on screen."""
    assistant_codes = set(profile.get_assistant_roles()) if profile else set()
    return ', '.join(
        f"Assistant {role_label(code)}" if code in assistant_codes else role_label(code)
        for code in codes
    )


def member_tie_codes(user):
    """The areas a member genuinely belongs to or serves in.

    Three ties, and only these: the gender- and age-based groups the office
    filed them under (the profile's ``ministry`` and ``department``), their
    places on a department's roll, and the leadership rows they hold. It is
    the honest answer to "which areas are mine" — an elder or administrator
    with no tie to AWM gets nothing back, even though they may open every
    area. The dashboard's "Your areas" reads this, so an office holder sees
    the departments and ministries they are actually part of and reaches the
    rest through the rail; :func:`member_area_codes` keeps the wider
    every-area view the rail and the directory are built on.

    The one area every member belongs to without a row saying so is the
    Sabbath School: it is the church's own school, and every church member
    is its member by default. The tie is given, not filed — which is also
    why its roll carries no rows to remove (see the roll's own read).
    """
    if not getattr(user, 'is_active', False):
        return []
    profile = getattr(user, 'member_profile', None)
    # The profile names the ties in its own vocabulary — ``ministry`` speaks
    # of Adventist Men, ``department`` of age buckets — so both are translated
    # into the department codes the rest of the system files areas by.
    profile_ties = {
        {'adventist_men': 'amm', 'adventist_women': 'awm', 'young_adults': 'aym', 'ambassadors': 'ambassadors'}.get(
            getattr(profile, 'ministry', '') or ''
        ),
        {'children': 'children', 'young_adults': 'aym'}.get(
            getattr(profile, 'department', '') or ''
        ),
    } - {None}
    ties = set(profile_ties)
    roll_codes = set(DepartmentMembership.objects.filter(
        member=user, member__is_active=True,
    ).values_list('department', flat=True))
    assigned_codes = set(
        DepartmentAssignment.objects.filter(
            member=user, department__is_active=True,
        ).values_list('department__code', flat=True)
    )
    # The member's own department and the ministries they serve in, now held as
    # real rows — the same areas the legacy strings name, once the office has
    # re-filed them.
    own_codes = set()
    if profile is not None:
        if profile.department_ref_id and profile.department_ref.is_active:
            own_codes.add(profile.department_ref.code)
        own_codes |= set(
            profile.ministries.filter(is_active=True).values_list('code', flat=True)
        )
    if Department.objects.filter(code=SABBATH_SCHOOL_CODE, is_active=True).exists():
        own_codes.add(SABBATH_SCHOOL_CODE)
    return list(ties | roll_codes | assigned_codes | own_codes)


def member_area_codes(user):
    """The areas of the church this account may see, as department codes.

    The age- and gender-based groups — AMM, AWM, Young Adults, the rest —
    are the church's own way of filing its people: each member belongs to
    exactly one, the profile's ``ministry`` naming the gender-based group
    and ``department`` the age-based one. A member sees that one group (or
    both, when the office has filed them in two), the offices see every
    area, and anyone serving as a department's leader or assistant — or
    carrying a place on its roll — sees that area beside their own, because
    they work there.
    """
    if not getattr(user, 'is_active', False):
        return []
    if department_office_profile(user):
        return list(Department.objects.filter(is_active=True).values_list('code', flat=True))
    return member_tie_codes(user)


def user_departments(user):
    """The departments an account belongs to, for the feed's addressed tab.

    A department counts when the account sits on its roll (the membership
    list the department hub curates), serves among its leaders and
    assistants, or is the age- and gender-based group the member's profile
    names — the same set ``member_area_codes`` answers, so what a member
    sees under "My departments" is exactly the areas they can open on the
    rail and exactly what was addressed to them. The inactive are skipped —
    the audience resolver requires active accounts.
    """
    codes = member_area_codes(user)
    return [
        {'code': row.code, 'label': row.name, 'audience_code': f'dept_{row.code}'}
        for row in Department.objects.filter(code__in=codes, is_active=True)
    ]


def department_office_profile(user):
    """The profile of a signed-in office holder, or None."""
    profile = getattr(user, 'member_profile', None)
    if profile and profile.has_role('admin', 'elder', 'clerk', 'pastor'):
        return profile
    return None


#: The church-wide role code that led each of the original seven departments.
#: Leadership now lives in DepartmentAssignment rows — decided on the
#: department hub — but these pairs remain the bridge: appointing a
#: department's generic Leader/Assistant grants the same role flag the old
#: system carried, so permission checks and audiences follow the person.
DEPARTMENT_LEAD_ROLE = {
    'amm': 'men_ministry',
    'awm': 'women_ministry',
    'aym': 'youth_leader',
    'children': 'children_ministry',
    'ambassadors': 'ambassadors_leader',
    'apm': 'apm_leader',
    'chaplaincy': 'chaplaincy',
    'health': 'health_leader',
    'welfare': 'welfare_leader',
    'education': 'education_leader',
    'development': 'development',
    'dorcas': 'dorcas_leader',
    'pastorate': 'pastor',
}


def department_holders(department, unit=None):
    """``(leader_dict_or_None, [assistant_dicts])`` from the leaders table.

    The department's leader is the member marked ``kind='leader'`` — first
    appointed wins if the desk ever appoints two — and every other row
    reports as an assistant named by its role ("Music Leader (assistant)").

    ``unit`` narrows it to one sub-unit of a department that has them (the
    Children's Kindergarten or Pathfinders), which is what its desk toggles
    between; ``None`` means the whole department, unit-tagged rows included.
    """
    assignments = DepartmentAssignment.objects.select_related(
        'member', 'member__member_profile', 'role', 'department'
    ).filter(department__code=department, department__is_active=True)
    if unit:
        assignments = assignments.filter(unit=unit)
    assignments = list(assignments.order_by('role__sort_order', 'role__id', 'kind', 'id'))

    def holder_dict(assignment):
        user = assignment.member
        profile = getattr(user, 'member_profile', None)
        return {
            'id': user.id,
            'name': f"{user.first_name} {user.last_name}".strip() or user.get_username(),
            'username': user.get_username(),
            'email': user.email or '',
            'phone_number': (profile.phone_number if profile else '') or '',
            # The roll's age-based desks read a sex column; the board leads
            # the table, so the office carries its holder's too.
            'gender': (profile.gender if profile else '') or '',
            'photo_url': getattr(profile, 'photo_url', '') or '',
            'roles': list(profile.get_roles()) if profile else ['member'],
            'assistant_roles': list(profile.get_assistant_roles()) if profile else [],
            'position': assignment.role.name,
            'kind': assignment.kind,
        }

    leader = None
    assistants = []
    for assignment in assignments:
        if not assignment.member.is_active:
            continue
        if assignment.kind == 'leader' and leader is None:
            leader = holder_dict(assignment)
        else:
            assistants.append(holder_dict(assignment))
    return leader, assistants


class DepartmentDirectoryView(APIView):
    """One row per department: leadership, roles, roll size, calendar count.

    The read is the member's own map of the church: a member sees the areas
    they belong to — their age- and gender-based group first, any area they
    serve or hold a place on beside it — while the church's offices see
    every area. The desks keep their own paths to the areas they serve.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.query_params.get('all') in ('true', '1', 'yes', 'True'):
            visible_codes = set(Department.objects.filter(is_active=True).values_list('code', flat=True))
        else:
            visible_codes = set(member_area_codes(request.user))
        counts = {
            row['department']: row['total']
            for row in DepartmentMembership.objects.values('department').annotate(total=Count('id'))
        }
        # The Sabbath School's roll is the roster — every church member is on
        # it by default, whether or not a row was ever filed — so its count
        # reads the roster, not the rows.
        if Department.objects.filter(code=SABBATH_SCHOOL_CODE, is_active=True).exists():
            counts[SABBATH_SCHOOL_CODE] = roster_queryset().filter(is_active=True).count()
        event_counts = {
            row['department']: row['total']
            for row in DepartmentEvent.objects.values('department').annotate(total=Count('id'))
        }
        departments = []
        for department in Department.objects.filter(is_active=True, code__in=visible_codes):
            leader, assistants = department_holders(department.code)
            departments.append({
                'code': department.code,
                'label': department.name,
                'description': department.description,
                'icon': department.icon,
                # Which heading the rail files it under, and the sub-units its
                # desk toggles between (Children's Kindergarten/Pathfinders).
                'group': department.group,
                'units': department.unit_names,
                'leader': leader,
                'assistants': assistants,
                # Whether this account leads the area — the one seat that
                # fills its custom offices (Secretary, Treasurer, Choir
                # Leader) rather than the church's fixed seats.
                'can_manage_custom': is_department_leader(request.user, department.code),
                # The roles the leadership modal edits, with who serves in
                # each and whether the role takes an assistant.
                'roles': [
                    {
                        'id': role.id,
                        'name': role.name,
                        'has_assistant': role.has_assistant,
                        'is_optional': role.is_optional,
                        'is_custom': role.is_custom,
                        'holders': [
                            {
                                'id': assignment.member.id,
                                'name': f"{assignment.member.first_name} {assignment.member.last_name}".strip() or assignment.member.get_username(),
                                'username': assignment.member.get_username(),
                                'kind': assignment.kind,
                            }
                            for assignment in role.assignments.select_related('member')
                            if assignment.member.is_active
                        ],
                    }
                    for role in department.roles.all()
                ],
                'member_count': counts.get(department.code, 0),
                'event_count': event_counts.get(department.code, 0),
            })
        return Response({'departments': departments})


def is_department_leader(user, department, unit=None):
    """Whether ``user`` leads this area — the one who fills its custom offices.

    A leader-kind row on the area's board is the answer: the area's own leader
    answers for every unit in it, and a unit's leader for that unit. An
    assistant keeps the desk keys but not this one — the church asked that the
    area's own offices be its leader's to fill, so the ministry staffs itself.
    """
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    rows = DepartmentAssignment.objects.filter(
        department__code=department, department__is_active=True,
        member=user, kind='leader',
    )
    if unit:
        rows = rows.filter(Q(unit=unit) | Q(unit=''))
    return rows.exists()


def can_manage_department(user, department):
    """Office holders manage any department; its leader and assistant manage their own.

    "Leadership" is anyone with a row in the leaders table — the leader
    certainly, but also an assistant, who keeps the roll and the money and
    so needs the same keys. Administrative access in the department sense
    is exactly leader + assistant; a department's secretary or treasurer
    serves without the desk keys.
    """
    if department_office_profile(user):
        return True
    return DepartmentAssignment.objects.filter(
        department__code=department, member=user, department__is_active=True,
    ).exists()


def can_keep_rota(user, desk):
    """Who keeps one desk's rota: the deaconate's, the pulpit's, or music's.

    The pulpit team is rostered by the Personal Ministries desk — its leader
    and assistant, plus the office as everywhere else — and the music department
    rosters who plays, sings and leads on a day, by its own leadership, the
    same way. A desk's rota is its own business: the deaconate's steward edits
    no pulpit line, and the personal ministries leader edits no deaconate one.
    """
    if desk == DutyRota.DESK_PULPIT:
        return can_manage_department(user, 'personal_ministries')
    if desk == DutyRota.DESK_MUSIC:
        return can_manage_department(user, 'music')
    return can_manage_deaconate(user)


def keeps_any_rota(user):
    """Whether this user keeps a rota at all — either desk.

    Asked before a line is fetched, so the congregation is refused the same
    way it always was (403, whether or not the line exists) and a stranger
    cannot learn a line's id from the difference between 403 and 404. The
    line's own desk is checked after the fetch, by ``can_keep_rota``.
    """
    return (
        can_keep_rota(user, DutyRota.DESK_DEACONATE)
        or can_keep_rota(user, DutyRota.DESK_PULPIT)
        or can_keep_rota(user, DutyRota.DESK_MUSIC)
    )


def rota_desk_from(request, default=DutyRota.DESK_DEACONATE):
    """The desk named in the query string, or the one the rota was born as.

    Absent means the deaconate, so the duty rota's own screens read exactly
    what they always read; the pulpit desk asks for its own with
    ``?desk=pulpit``, the music desk with ``?desk=music``.
    """
    desk = str(request.query_params.get('desk') or '').strip().lower()
    if desk == DutyRota.DESK_PULPIT:
        return DutyRota.DESK_PULPIT
    if desk == DutyRota.DESK_MUSIC:
        return DutyRota.DESK_MUSIC
    return default


#: The desk that keeps the church's own week. The events it plans span every
#: ministry — a youth Sabbath, a men's seminar, a Dorcas drive — so its
#: leadership may write an event on any department's calendar rather than
#: keeping a private copy on its own.
CHURCH_CALENDAR_DEPARTMENT = 'personal_ministries'


def can_schedule_across_departments(user):
    """Church officers, and the personal ministries desk, schedule anywhere.

    Everyone else schedules only what their own desk holds: an AMM leader
    cannot write on AWM's calendar, or the point of a department's own
    calendar — its leadership deciding what lands on it — is lost.
    """
    if department_office_profile(user):
        return True
    if not getattr(user, 'is_authenticated', False):
        return False
    return DepartmentAssignment.objects.filter(
        department__code=CHURCH_CALENDAR_DEPARTMENT,
        department__is_active=True,
        member=user,
    ).exists()


class DepartmentBudgetView(APIView):
    """A department's budget lines: read, add, remove.

    The elder's desk keeps each department's planned spending here — what the
    treasurer's consolidated budget spreadsheet distributes by hand today.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, department):
        if not Department.objects.filter(code=department, is_active=True).exists():
            return Response({'detail': 'Unknown department.'}, status=status.HTTP_404_NOT_FOUND)
        rows = DepartmentBudget.objects.filter(department=department).order_by('-year', 'title')
        return Response({'budgets': [
            {
                'id': row.id,
                'year': row.year,
                'title': row.title,
                'amount': row.amount,
                'notes': row.notes,
                'created_at': row.created_at,
            }
            for row in rows
        ]})

    def post(self, request, department):
        if not can_manage_department(request.user, department):
            return Response({'detail': 'Only office holders or the department lead can manage its budget.'}, status=status.HTTP_403_FORBIDDEN)
        if not Department.objects.filter(code=department, is_active=True).exists():
            return Response({'detail': 'Unknown department.'}, status=status.HTTP_404_NOT_FOUND)
        title = str(request.data.get('title') or '').strip()
        if not title:
            return Response({'title': 'Name what the money is for.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            year = int(request.data.get('year') or timezone.localdate().year)
        except (TypeError, ValueError):
            return Response({'year': 'Enter a valid year.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            amount = Decimal(str(request.data.get('amount') or 0))
        except (InvalidOperation, ValueError):
            return Response({'amount': 'Enter a valid amount.'}, status=status.HTTP_400_BAD_REQUEST)
        row, created = DepartmentBudget.objects.update_or_create(
            department=department, year=year, title=title,
            defaults={'amount': amount, 'notes': str(request.data.get('notes') or '').strip(), 'created_by': request.user},
        )
        return Response({'id': row.id, 'year': row.year, 'title': row.title, 'amount': row.amount, 'notes': row.notes}, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    def delete(self, request, department, budget_id):
        if not can_manage_department(request.user, department):
            return Response({'detail': 'Only office holders or the department lead can manage its budget.'}, status=status.HTTP_403_FORBIDDEN)
        deleted, _ = DepartmentBudget.objects.filter(pk=budget_id, department=department).delete()
        if not deleted:
            return Response({'detail': 'Budget line not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'detail': 'Budget line removed.'})


#: Office titles that correspond to a church-wide role flag. Filling "First
#: Elder" in Eldership or "AYM Leader" in The Church grants the same code the
#: old role-flag system carried, so every permission check, announcement
#: audience and report that reads role flags keeps working while areas become
#: the way roles are assigned. Titles not listed here (Secretary, Treasurer,
#: an area's Choir Leader) are area-scoped offices only —
#: the church's own Choir Director is the 'choir director' entry below, and
#: an area's Choir Leader is deliberately not it.
OFFICE_ROLE_CODES = {
    'first elder': 'first_elder',
    'second elder': 'second_elder',
    'third elder': 'third_elder',
    'elder': 'elder',
    'church clerk': 'clerk',
    'church treasurer': 'treasurer',
    'head deacon': 'head_deacon',
    'head deaconess': 'head_deaconess',
    'pm leader': 'pm_leader',
    'apm leader': 'apm_leader',
    'amm leader': 'men_ministry',
    'awm leader': 'women_ministry',
    'aym leader': 'youth_leader',
    'children leader': 'children_ministry',
    'ambassadors leader': 'ambassadors_leader',
    'chaplaincy leader': 'chaplaincy',
    'health leader': 'health_leader',
    'education leader': 'education_leader',
    'family life leader': 'family_life',
    'publishing head': 'publishing_head',
    'welfare leader': 'welfare_leader',
    'interest coordinator': 'interest_coordinator',
    'development leader': 'development',
    'development': 'development',
    'dorcas leader': 'dorcas_leader',
    'dorcas': 'dorcas_leader',
    'choir director': 'choir_director',
    'pathfinders leader': 'pathfinders_leader',
    'adventurers leader': 'adventurers_leader',
}


#: The church-wide role codes the leaders table manages — the named church
#: offices that exist as department roles (First Elder, Church Clerk, Head
#: Deacon) plus each original department's lead role. Every other church-wide
#: flag (Treasurer, PM Leader, Choir Director…) is assigned in User
#: Management and is never touched here.
DEPARTMENT_MANAGED_ROLE_CODES = frozenset({
    'first_elder', 'second_elder', 'third_elder', 'clerk', 'head_deacon', 'head_deaconess',
} | set(DEPARTMENT_LEAD_ROLE.values()))


def sync_role_flags_from_assignments():
    """Reconcile every member's church-wide role flags with the leaders table.

    Department leadership lives in DepartmentAssignment rows; this keeps the
    derived church-wide flags (the codes the permission checks, audiences
    and the roster read) in step with it — and only within the codes the
    leaders table manages: a named church office ("First Elder", "Church
    Clerk", "Head Deacon") grants its role code wherever it is held — as an
    assistant flag when the holder is the office's assistant — and a
    department's generic Leader/Assistant role grants that department's lead
    role the old system carried. A managed flag without an assignment behind
    it is a leftover, not a right; flags outside the managed set belong to
    User Management and pass through untouched. Run after any leadership
    save; one pass, a handful of rows.
    """
    lead_role_by_department = dict(DEPARTMENT_LEAD_ROLE)
    for profile in MemberProfile.objects.select_related('user').all():
        current = set(profile.get_roles())
        current_assistants = set(profile.get_assistant_roles())
        granted, granted_assistant = set(), set()
        for assignment in DepartmentAssignment.objects.filter(
            member_id=profile.user_id, department__is_active=True,
        ).select_related('role', 'department'):
            named = OFFICE_ROLE_CODES.get(assignment.role.name.strip().lower())
            if named not in DEPARTMENT_MANAGED_ROLE_CODES:
                named = None
            if named is None:
                # A department's own generic Leader/Assistant role maps to
                # its lead role, so the desk's appointment reaches the old
                # permission checks.
                lead = lead_role_by_department.get(assignment.department.code)
                named = lead if assignment.role.name.strip().lower() in ('leader', 'assistant') else None
            if named is None:
                # A pruned office that kept its holder through 0146 — "Church
                # Clerk" left standing after its DepartmentRole row went —
                # still carries the seat's flag by title, so nobody loses a
                # permission because the desk simplified the roles list.
                named = OFFICE_ROLE_CODES.get(assignment.role.name.strip().lower())
            if named is None:
                continue
            if assignment.kind == 'assistant':
                granted_assistant.add(named)
            else:
                granted.add(named)
        mapped = {c for c in current if c in DEPARTMENT_MANAGED_ROLE_CODES}
        mapped_assistants = {c for c in current_assistants if c in DEPARTMENT_MANAGED_ROLE_CODES}
        added, removed = granted - current, mapped - granted - granted_assistant
        added_assistant = granted_assistant - current_assistants
        removed_assistant = mapped_assistants - granted_assistant
        if not (added or removed or added_assistant or removed_assistant):
            continue
        # An assistant holds the role itself (set_roles enforces this), so
        # the granted assistant codes join the role set they mark.
        roles_param = profile.set_roles(
            sorted((current - removed) | added | granted_assistant),
            assistants=sorted((current_assistants - removed_assistant) | added_assistant),
        )
        sync_role_groups(profile.user, roles_param)


class DepartmentCreateView(APIView):
    """Add a department from the desk.

    The body carries the name (required) and optionally a description. Every
    department is seeded with the same offices the church's areas carry —
    ``DEPARTMENT_ROLE_SEED``: the Leader and Assistant positions the
    leadership desk appoints by search, then the catalogue (Secretary,
    Treasurer, Choir Leader) — and the desk fills them through Edit
    leadership or leaves them open. The code is a slug of the name — it names
    the API path and the ``dept_<code>`` audience — and is never reused, even
    after deactivation.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not department_office_profile(request.user):
            return Response({'detail': 'Only church officers can add departments.'}, status=status.HTTP_403_FORBIDDEN)
        name = str(request.data.get('name') or '').strip()
        if not name:
            return Response({'name': 'Give the department a name.'}, status=status.HTTP_400_BAD_REQUEST)
        if Department.objects.filter(name__iexact=name).exists():
            return Response({'name': 'A department with this name already exists.'}, status=status.HTTP_400_BAD_REQUEST)

        base_slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')[:50] or 'department'
        code = base_slug
        suffix = 2
        while Department.objects.filter(code=code).exists():
            code = f"{base_slug}-{suffix}"
            suffix += 1

        description = str(request.data.get('description') or '').strip()[:240]
        group = str(request.data.get('group') or 'department').strip().lower()
        if group not in dict(Department.GROUP_CHOICES):
            return Response({'group': 'Say whether this is a ministry or a department.'}, status=status.HTTP_400_BAD_REQUEST)
        # Sub-units arrive as a list or as the comma-separated text the field
        # stores; either way the stored form is one line of names.
        raw_units = request.data.get('units')
        if isinstance(raw_units, (list, tuple)):
            units = ', '.join(str(unit).strip() for unit in raw_units if str(unit).strip())
        else:
            units = str(raw_units or '').strip()
        units = ', '.join(part.strip() for part in units.split(',') if part.strip())[:200]

        department = Department.objects.create(
            code=code, name=name, description=description, group=group, units=units,
        )
        DepartmentRole.objects.bulk_create([
            DepartmentRole(
                department=department, name=role_name, has_assistant=assistant,
                sort_order=index,
                # The base pair stays with every area; the catalogue offices
                # are the area's own to keep or drop, and its own leader's
                # to fill.
                is_optional=index >= len(DEFAULT_DEPARTMENT_ROLES),
                is_custom=index >= len(DEFAULT_DEPARTMENT_ROLES),
            )
            for index, (role_name, assistant) in enumerate(DEPARTMENT_ROLE_SEED)
        ])
        return Response({
            'code': department.code,
            'name': department.name,
            'group': department.group,
            'units': department.unit_names,
            'roles': [role_name for role_name, _assistant in DEPARTMENT_ROLE_SEED],
        }, status=status.HTTP_201_CREATED)


def send_appointment_emails(department, appointment_notes):
    """Email everyone the leadership save seated and every seat it replaced.

    ``appointment_notes`` is what the PUT built: ``[{'member': user,
    'position': role name, 'kind': 'leader'|'assistant', 'replaced': user|None}]``.
    Each appointee gets the welcome letter; each replaced holder the thank-you,
    which names who takes up the role. Wordings are Church Settings templates
    (default_appointment_message / default_release_thank_you_message), filled
    with the same placeholder machinery the meeting invitations use.

    Both letters leave as the church's appointments address rather than the
    general inbox (members/mailing.py): a member keeps the letter that seated
    them and may answer it months later, and one save can seat a whole board —
    the burst of letters a shared mailbox's sending-velocity rule refuses, so
    the purpose rides the relay. Failure to send never fails the save — the
    letters are a courtesy, and the mail backend logs what it could not
    deliver.
    """
    if not appointment_notes:
        return
    church = ChurchSettings.objects.first()
    church_name = church.church_name if church else ''
    appointment_template = (church.default_appointment_message if church else '') or DEFAULT_APPOINTMENT_MESSAGE
    release_template = (church.default_release_thank_you_message if church else '') or DEFAULT_RELEASE_MESSAGE
    for note in appointment_notes:
        context = {
            'greeting': eat_greeting(),
            'name': recipient_name(note['member']),
            'position': note['position'],
            'area': department.name,
            'church': church_name,
            'successor': note['replaced'] and recipient_name(note['replaced']) or '',
        }
        try:
            send_mail(
                f"{note['position']} — {department.name}",
                render_message(appointment_template, context),
                sender_for(APPOINTMENT),
                [note['member'].email],
                connection=connection_for(APPOINTMENT),
                fail_silently=True,
            )
            if note['replaced'] and note['replaced'].email:
                send_mail(
                    f"Thank you — {note['position']}, {department.name}",
                    render_message(release_template, {**context, 'name': recipient_name(note['replaced'])}),
                    sender_for(APPOINTMENT),
                    [note['replaced'].email],
                    connection=connection_for(APPOINTMENT),
                    fail_silently=True,
                )
        except Exception:
            logger.exception("Could not send the leadership letters for %s", department.code)


class DepartmentLeadershipView(APIView):
    """A department's leadership: read it, appoint and release.

    The PUT body is ``assignments: [{role_id, member_id, kind}]`` — one entry
    per person being appointed, ``kind`` either ``leader`` or ``assistant``.
    Appointing replaces whoever held that leader seat; releasing is a DELETE
    by assignment id.

    The offices themselves are not the desk's to name: every area is seeded
    with the base Leader and Assistant pair and the catalogue beside it
    (``DEPARTMENT_ROLE_SEED``), and the desk picks the person for an office
    rather than inventing one, so there is no create here. A catalogue office
    an area does not use is removed with ``role_id`` like an appointment.
    Every save reconciles the church-wide role flags so permissions and
    audiences follow at once.
    """

    permission_classes = [IsAuthenticated]

    def _department(self, code):
        return Department.objects.filter(code=code, is_active=True).first()

    def get(self, request, department):
        target = self._department(department)
        if target is None:
            return Response({'detail': 'Unknown department.'}, status=status.HTTP_404_NOT_FOUND)
        # A department with sub-units reads one unit at a time: the desk's
        # toggle swaps the whole view, so leadership is asked for the unit too.
        unit = str(request.query_params.get('unit') or '').strip()
        if unit and unit not in target.unit_names:
            return Response({'unit': 'That is not one of this department\u2019s units.'}, status=status.HTTP_400_BAD_REQUEST)
        leader, assistants = department_holders(department, unit=unit or None)
        return Response({
            'leader': leader,
            'assistants': assistants,
            'unit': unit,
            'units': target.unit_names,
            'can_manage_custom': is_department_leader(request.user, target.code, unit or None),
            'roles': [
                {
                    'id': role.id,
                    'name': role.name,
                    'has_assistant': role.has_assistant,
                    'is_optional': role.is_optional,
                    'assignments': [
                        {'id': a.id, 'member_id': a.member_id, 'kind': a.kind}
                        for a in role.assignments.filter(unit=unit)
                    ],
                }
                for role in target.roles.all()
            ],
        })

    def put(self, request, department):
        if not can_manage_department(request.user, department):
            return Response({'detail': "Only church officers or this department's leadership can edit leadership."}, status=status.HTTP_403_FORBIDDEN)
        target = self._department(department)
        if target is None:
            return Response({'detail': 'Unknown department.'}, status=status.HTTP_404_NOT_FOUND)

        units = target.unit_names
        unit = str(request.data.get('unit') or request.query_params.get('unit') or '').strip()
        if unit and unit not in units:
            return Response({'unit': 'That is not one of this department\u2019s units.'}, status=status.HTTP_400_BAD_REQUEST)

        submitted = request.data.get('assignments')
        if not isinstance(submitted, list):
            return Response({'detail': 'Send the appointments as a list.'}, status=status.HTTP_400_BAD_REQUEST)
        roles = {r.id: r for r in DepartmentRole.objects.filter(department=target)}
        # What the save did, for the letters: one note per person seated or
        # replaced, collected as the assignments land.
        appointment_notes = []
        unknown = [entry.get('role_id') for entry in submitted if entry.get('role_id') not in roles]
        if unknown:
            return Response({'detail': 'One of the roles does not belong to this department.'}, status=status.HTTP_400_BAD_REQUEST)
        member_ids = {entry.get('member_id') for entry in submitted if entry.get('member_id')}
        members = User.objects.filter(id__in=member_ids, is_active=True)
        if len(members) != len(member_ids):
            return Response({'detail': 'One of the people chosen is not an active account.'}, status=status.HTTP_400_BAD_REQUEST)

        # The seats the church fills by sex: the deaconate's two offices —
        # the Head Deacon is a man's, the Head Deaconess a woman's. The
        # member's own profile answers where it says; a blank gender cannot
        # prove the rule either way, so it is left to the desk to know their
        # people. Neither seat takes an assistant, and a role that does not
        # take one refuses the flag — all of it checked before anything is
        # seated, so one refused entry refuses the batch.
        seat_sex_by_office = {'head deacon': 'male', 'head deaconess': 'female'}
        for entry in submitted:
            role = roles[entry.get('role_id')]
            kind = entry.get('kind') or 'leader'
            if kind not in ('leader', 'assistant'):
                return Response({'detail': 'An appointment is a leader or an assistant.'}, status=status.HTTP_400_BAD_REQUEST)
            if kind == 'assistant' and not role.has_assistant:
                return Response({'detail': f"{role.name} does not take an assistant."}, status=status.HTTP_400_BAD_REQUEST)
            seat_sex = seat_sex_by_office.get(role.name.strip().lower())
            if seat_sex:
                member = members.get(pk=entry.get('member_id'))
                gender = str(getattr(getattr(member, 'member_profile', None), 'gender', '') or '').strip().lower()
                if gender and gender != seat_sex:
                    return Response(
                        {'detail': f"The {role.name} is a {'man' if seat_sex == 'male' else 'woman'}'s office."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

        # The area's own offices are its leader's to fill. Church officers
        # keep the fixed seats — the base Leader/Assistant pair and the
        # elected offices — while a Secretary, Treasurer or Choir Leader is
        # appointed by the leader whose area it is, so the ministry staffs
        # itself. Checked over the whole batch, so one refused entry refuses
        # the save rather than half-seating a board.
        custom_roles = sorted(
            {roles[e.get('role_id')] for e in submitted if roles[e.get('role_id')].is_custom},
            key=lambda role: role.name,
        )
        if custom_roles and not is_department_leader(request.user, target.code, unit or None):
            names = ', '.join(role.name for role in custom_roles)
            verb = 'is' if len(custom_roles) == 1 else 'are'
            return Response(
                {'detail': f"{names} {verb} set by {target.name}'s leader, not from the church office."},
                status=status.HTTP_403_FORBIDDEN,
            )

        for entry in submitted:
            role = roles[entry.get('role_id')]
            kind = entry.get('kind') or 'leader'
            if kind not in ('leader', 'assistant'):
                return Response({'detail': 'An appointment is a leader or an assistant.'}, status=status.HTTP_400_BAD_REQUEST)
            member = members.get(pk=entry.get('member_id'))
            if kind == 'leader':
                # One leader per role: the new appointment replaces whoever
                # held the seat, the way an appointment lands in person. In a
                # department with units the seat is the unit's — Kindergarten
                # may have its leader while Pathfinders keeps its own.
                replaced = DepartmentAssignment.objects.filter(role=role, kind='leader', unit=unit).exclude(member=member).select_related('member').first()
                DepartmentAssignment.objects.filter(role=role, kind='leader', unit=unit).exclude(member=member).delete()
                appointment_notes.append({'member': member, 'position': role.name, 'kind': kind, 'replaced': replaced.member if replaced else None})
            else:
                already = DepartmentAssignment.objects.filter(role=role, kind='assistant', member=member, unit=unit).exists()
                if not already:
                    # The seat is named once: the generic Assistant role is
                    # itself called "Assistant", and a role on the books may
                    # open with the word too — prefixing again would read
                    # "Assistant Assistant" in the subject and the letter.
                    seat_name = role.name.strip().lower()
                    position = role.name if seat_name.startswith('assistant') else f"Assistant {role.name}"
                    appointment_notes.append({'member': member, 'position': position, 'kind': kind, 'replaced': None})
            assignment, _created = DepartmentAssignment.objects.get_or_create(
                role=role, member=member, kind=kind, unit=unit,
                defaults={'department': target},
            )
            updates = []
            if assignment.department_id != target.id:
                assignment.department = target
                updates.append('department')
            if assignment.unit != unit:
                # A leader who moves unit moves with the seat, the way an
                # appointment in a new unit replaces the old one.
                assignment.unit = unit
                updates.append('unit')
            if updates:
                assignment.save(update_fields=updates)
        sync_role_flags_from_assignments()
        send_appointment_emails(target, appointment_notes)
        return Response({'detail': 'Leadership updated.', 'code': target.code, 'unit': unit})

    def delete(self, request, department):
        """Release one person, or drop a catalogue office the area does not use.

        A body of ``assignment_id`` releases that appointment; a body of
        ``role_id`` removes an optional office ("Choir Leader") and every
        appointment in it. The base pair and the church's own elected offices
        stay — every area keeps the same two seats at its base.
        """
        if not can_manage_department(request.user, department):
            return Response({'detail': "Only church officers or this department's leadership can edit leadership."}, status=status.HTTP_403_FORBIDDEN)
        target = self._department(department)
        if target is None:
            return Response({'detail': 'Unknown department.'}, status=status.HTTP_404_NOT_FOUND)
        if request.data.get('role_id'):
            role = DepartmentRole.objects.filter(
                department=target, pk=request.data.get('role_id'), is_optional=True,
            ).first()
            if role is None:
                return Response({'detail': 'Office not found (the Leader and Assistant seats stay with every area).'}, status=status.HTTP_404_NOT_FOUND)
            # A custom office is the area's own: its leader drops it, the way
            # its leader fills it.
            if role.is_custom and not is_department_leader(request.user, target.code):
                return Response(
                    {'detail': f"{role.name} is set by {target.name}'s leader, not from the church office."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            role.delete()
            sync_role_flags_from_assignments()
            return Response({'detail': 'Office removed.'})
        assignment = DepartmentAssignment.objects.filter(
            department=target, pk=request.data.get('assignment_id'),
        ).first()
        if assignment is None:
            return Response({'detail': 'Appointment not found.'}, status=status.HTTP_404_NOT_FOUND)
        if assignment.role.is_custom and not is_department_leader(request.user, target.code, assignment.unit or None):
            return Response(
                {'detail': f"{assignment.role.name} is set by {target.name}'s leader, not from the church office."},
                status=status.HTTP_403_FORBIDDEN,
            )
        assignment.delete()
        sync_role_flags_from_assignments()
        return Response({'detail': 'Appointment released.'})


def drop_area_filing(user, code):
    """Take the office's filing of this person out of one area.

    ``member_tie_codes`` reads the roll and the seats beside three filings
    the profile itself carries: ``ministry`` and ``department`` (the church's
    way of filing its people by sex and age), the department row they point
    at, and the ministries the profile lists. A member stepping off a roll
    one of those filings names would otherwise stay filed there — their card
    would sit in "My Ministry" after they had left — so leaving an area
    clears every tie to it. Leaders removing someone else leave the office's
    filing alone; that record is the office's to change, not the desk's.
    """
    profile = getattr(user, 'member_profile', None)
    if profile is None:
        return False
    filed_as = {
        'ministry': {'adventist_men': 'amm', 'adventist_women': 'awm', 'young_adults': 'aym', 'ambassadors': 'ambassadors'},
        'department': {'children': 'children', 'young_adults': 'aym'},
    }
    changed = []
    if filed_as['ministry'].get(getattr(profile, 'ministry', '') or '') == code:
        profile.ministry = ''
        changed.append('ministry')
    if filed_as['department'].get(getattr(profile, 'department', '') or '') == code:
        profile.department = ''
        changed.append('department')
    if profile.department_ref_id and profile.department_ref.code == code:
        profile.department_ref = None
        changed.append('department_ref')
    if changed:
        profile.save(update_fields=changed)
    department = Department.objects.filter(code=code).first()
    if department is not None and profile.ministries.filter(pk=department.pk).exists():
        profile.ministries.remove(department)
        changed.append('ministries')
    return bool(changed)


class DepartmentMembersView(APIView):
    """A department's roll: read it, add to it, remove from it."""

    permission_classes = [IsAuthenticated]

    def get(self, request, department, *, unit=None):
        # ``unit`` is passed straight in by the messaging endpoint below, which
        # reads this same roll for its recipients without a query string of its
        # own; a plain read still takes it off the URL as before.
        target = Department.objects.filter(code=department, is_active=True).first()
        if target is None:
            return Response({'detail': 'Unknown department.'}, status=status.HTTP_404_NOT_FOUND)
        if unit is None:
            unit = request.query_params.get('unit')
        unit = str(unit or '').strip()
        if unit and unit not in target.unit_names:
            return Response({'unit': 'That is not one of this department\u2019s units.'}, status=status.HTTP_400_BAD_REQUEST)
        def row_for(user, *, membership_id=None, unit_value='', via='', role=''):
            """One roll row. ``via`` names where a unioned row came from."""
            profile = getattr(user, 'member_profile', None)
            return {
                'membership_id': membership_id,
                'id': user.id,
                'name': f"{user.first_name} {user.last_name}".strip() or user.get_username(),
                'username': user.get_username(),
                'email': user.email or '',
                'phone_number': (profile.phone_number if profile else '') or '',
                'whatsapp_number': (profile.whatsapp_number if profile else '') or '',
                'gender': (profile.gender if profile else '') or '',
                'sex': (profile.gender if profile else '') or '',
                'unit': unit_value,
                'class': unit_value or 'General',
                'via': via,
                'role': role,
                'is_child': False,
                'added_at': None,
            }

        members = []
        seen_ids = set()
        for membership in (
            DepartmentMembership.objects.select_related('member', 'member__member_profile')
            .filter(department=department, member__is_active=True, **({'unit': unit} if unit else {}))
            .order_by('member__first_name', 'member__last_name')
        ):
            user = membership.member
            seen_ids.add(user.id)
            row = row_for(user, membership_id=membership.id, unit_value=membership.unit)
            row['added_at'] = membership.created_at
            members.append(row)

        # Children Ministry is the umbrella over all children classes and records.
        # Include active children records and children sub-department memberships.
        if department == 'children':
            children_departments = {
                'beginners': 'Beginners',
                'kindergarten': 'Kindergarten',
                'primary': 'Primary',
                'junior': 'Junior',
                'teens': 'Teens',
                'pathfinders': 'Pathfinders',
            }
            child_qs = ChildRecord.objects.filter(is_active=True).select_related('group')
            if unit:
                child_qs = child_qs.filter(
                    Q(unit__iexact=unit) | Q(group__name__iexact=unit) | Q(group__code__iexact=unit)
                )
            for child in child_qs.order_by('first_name', 'last_name'):
                cls_name = child.unit or (child.group.name if child.group else '') or 'General'
                members.append({
                    'membership_id': None,
                    'child_id': child.id,
                    'id': f"child_{child.id}",
                    'name': child.full_name,
                    'username': f"child_{child.id}",
                    'email': child.guardian_email or '',
                    'phone_number': child.guardian_phone or '',
                    'whatsapp_number': '',
                    'gender': child.gender or '',
                    'sex': child.gender or '',
                    'unit': cls_name,
                    'class': cls_name,
                    'via': 'Child record',
                    'role': 'Child',
                    'is_child': True,
                    'age': child.get_computed_age(),
                    'guardian_name': child.guardian_name or '',
                    'guardian_phone': child.guardian_phone or '',
                    'added_at': child.created_at,
                })

            if unit:
                sub_dept_codes = [code for code, name in children_departments.items() if name.lower() == unit.lower() or code == unit.lower()]
            else:
                sub_dept_codes = list(children_departments.keys())

            for sub_code in sub_dept_codes:
                sub_dept_name = children_departments.get(sub_code, sub_code.title())
                for membership in (
                    DepartmentMembership.objects.select_related('member', 'member__member_profile')
                    .filter(department=sub_code, member__is_active=True)
                ):
                    if membership.member_id in seen_ids:
                        continue
                    seen_ids.add(membership.member_id)
                    sub_row = row_for(
                        membership.member,
                        membership_id=membership.id,
                        unit_value=sub_dept_name,
                        via=f"{sub_dept_name} Department",
                    )
                    sub_row['class'] = sub_dept_name
                    sub_row['added_at'] = membership.created_at
                    members.append(sub_row)

        # Music is the church's singing: whoever is on the choir's roll, or in a
        # registered singing group, counts as music ministry. The music desk's
        # roll is therefore a union, not only the rows filed by hand. Unmerged
        # rows carry no membership id, so removing one means leaving the choir
        # or the group it came from — the desk cannot quietly undo that here.
        if department == 'music' and not unit:
            unioned = [(member_id, 'Choir') for member_id in DepartmentMembership.objects.filter(department='choir').values_list('member_id', flat=True)]
            unioned += [
                (row.member_id, row.group.name)
                for row in SingingGroupMember.objects.select_related('group')
            ]
            for user_id, via in unioned:
                if user_id in seen_ids:
                    continue
                user = User.objects.select_related('member_profile').filter(pk=user_id, is_active=True).first()
                if user is None:
                    continue
                seen_ids.add(user_id)
                members.append(row_for(user, via=via))

        # The Sabbath School is the church's own school: every church member
        # is its member by default, so its roll is the roster — no rows to
        # file, none to remove. The rows this union adds carry no membership
        # id for the same reason the music desk's do: there is no roll row
        # behind membership that was never filed by hand.
        if department == SABBATH_SCHOOL_CODE and not unit:
            for user in roster_queryset().select_related('member_profile').filter(is_active=True):
                if user.id in seen_ids:
                    continue
                seen_ids.add(user.id)
                members.append(row_for(user, via='Church member'))

        # Annotate each member with any role they hold in this department.
        # A member may hold more than one role (e.g. Leader + Choir Director);
        # we show a comma-joined list, or a blank string when they hold none.
        int_member_ids = [m['id'] for m in members if isinstance(m['id'], int)]
        assignments = (
            DepartmentAssignment.objects.select_related('role')
            .filter(department__code=department, member__in=int_member_ids)
        )
        role_map: dict[int, list[str]] = {}
        for asgn in assignments:
            parts = role_map.setdefault(asgn.member_id, [])
            label = asgn.role.name.strip()
            if asgn.kind == 'assistant':
                lower_label = label.lower()
                if not ('assistant' in lower_label or 'asst' in lower_label):
                    label = 'Assistant Leader' if lower_label == 'leader' else f'Assistant {label}'
            if label not in parts:
                parts.append(label)
        for m in members:
            m['role'] = ', '.join(role_map.get(m['id'], []))

        members.sort(key=lambda m: m['name'].lower())
        # The same flag the writes are guarded by, so a desk's Add button
        # renders only for the hands that can use it.
        return Response({
            'members': members,
            'unit': unit,
            'units': target.unit_names,
            'can_manage': can_manage_department(request.user, department),
        })

    def post(self, request, department):
        if not Department.objects.filter(code=department, is_active=True).exists():
            return Response({'detail': 'Unknown department.'}, status=status.HTTP_404_NOT_FOUND)
        if not can_manage_department(request.user, department):
            return Response({'detail': 'Only church officers or this department\'s leader can add members.'}, status=status.HTTP_403_FORBIDDEN)

        # A list adds them all in one go — a desk builds its roll a Sabbath
        # class at a time, not a name at a time. Everyone named must be an
        # active account before anything is written, so a typo refuses the
        # batch whole; the already-enrolled are counted rather than failing.
        if isinstance(request.data.get('member_ids'), list):
            target = Department.objects.filter(code=department, is_active=True).first()
            unit = str(request.data.get('unit') or '').strip()
            if unit and unit not in target.unit_names:
                return Response({'unit': 'That is not one of this department\u2019s units.'}, status=status.HTTP_400_BAD_REQUEST)
            unique_ids = list(dict.fromkeys(pk for pk in request.data['member_ids'] if pk is not None))
            people = User.objects.filter(pk__in=unique_ids, is_active=True)
            if len(people) != len(unique_ids):
                return Response({'detail': 'One of the people named is not an active account.'}, status=status.HTTP_400_BAD_REQUEST)
            by_id = {row.pk: row for row in people}
            added, already = 0, 0
            for pk in unique_ids:
                membership, created = DepartmentMembership.objects.get_or_create(
                    member=by_id[pk], department=department,
                    defaults={'added_by': request.user, 'unit': unit},
                )
                if created:
                    added += 1
                elif membership.unit != unit:
                    membership.unit = unit
                    membership.save(update_fields=['unit'])
                else:
                    already += 1
            return Response({
                'detail': f"{added} of {len(unique_ids)} added to the roll.",
                'added': added, 'already': already,
            }, status=status.HTTP_201_CREATED if added else status.HTTP_200_OK)

        try:
            target_user = User.objects.get(pk=request.data.get('member_id'))
        except (User.DoesNotExist, TypeError, ValueError):
            return Response({'detail': 'Member not found.'}, status=status.HTTP_404_NOT_FOUND)
        target = Department.objects.filter(code=department, is_active=True).first()
        unit = str(request.data.get('unit') or '').strip()
        if unit and unit not in target.unit_names:
            return Response({'unit': 'That is not one of this department\u2019s units.'}, status=status.HTTP_400_BAD_REQUEST)
        membership, created = DepartmentMembership.objects.get_or_create(
            member=target_user,
            department=department,
            defaults={'added_by': request.user, 'unit': unit},
        )
        if not created:
            # Moving a member between units is an edit on their one row, not a
            # second place on the roll.
            if membership.unit != unit:
                membership.unit = unit
                membership.save(update_fields=['unit'])
                return Response({'detail': 'Member moved to the unit.'})
            return Response({'detail': 'That member is already on this roll.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'detail': 'Member added to the roll.', 'membership_id': membership.id}, status=status.HTTP_201_CREATED)

    def delete(self, request, department, member_id=None):
        """Take a member off the roll.

        A leader or the church office may take anyone off; a member may always
        take *themselves* off — leaving an area is their own call and needs no
        officer's hand. With no name given at all the caller is the one
        stepping away, which is how the ministry card's Leave reads it.

        The roll row and any seat in the same department go together: nobody
        keeps leading an area they have left, and a removed leader does not
        stay on the leadership table after leaving the roll. A member leaving
        also drops the profile's own filing of them into that area, so the map
        files them out at once rather than keeping the card under
        "My Ministry".
        """
        if not Department.objects.filter(code=department, is_active=True).exists():
            return Response({'detail': 'Unknown department.'}, status=status.HTTP_404_NOT_FOUND)
        target_id = member_id if member_id is not None else (request.data.get('member_id') or request.user.pk)
        leaving_self = str(target_id) == str(request.user.pk)
        if not leaving_self and not can_manage_department(request.user, department):
            return Response({'detail': 'Only church officers or this department\'s leader can remove members.'}, status=status.HTTP_403_FORBIDDEN)
        deleted, _ = DepartmentMembership.objects.filter(department=department, member_id=target_id).delete()
        DepartmentAssignment.objects.filter(department__code=department, member_id=target_id).delete()
        unfiled = drop_area_filing(request.user, department) if leaving_self else False
        if not deleted and not unfiled:
            return Response({'detail': 'That member is not on this roll.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'detail': 'Member removed from the roll.'})


def department_message_payload(message):
    """One stored message, as the Messaging view reads it back."""
    sender = message.created_by
    name = ''
    if sender is not None:
        name = f"{sender.first_name} {sender.last_name}".strip() or sender.get_username()
    return {
        'id': message.id,
        'department': message.department,
        'unit': message.unit or '',
        'body': message.body,
        'audience': message.audience,
        'direct_phone': message.direct_phone,
        'recipient_count': message.recipient_count,
        'sent_count': message.sent_count,
        'failed_count': message.failed_count,
        'by': name,
        'created_at': message.created_at,
    }


def send_department_message(message, phones, body):
    """Hand one stored message to the gateway, one number at a time.

    Paced the way a broadcast is: the gateway allows sixty requests a minute,
    so the pause keeps a roll's worth of texts under that ceiling instead of
    collecting refusals halfway down the list. The counts land on the row when
    the walk finishes — the desk reads the log rather than this return value,
    because a send that had to wait off the request still writes its answer.
    """
    sent = failed = 0
    for phone in phones:
        if sms.send(phone, body):
            sent += 1
        else:
            failed += 1
        if settings.SMS_SEND_DELAY > 0:
            time.sleep(settings.SMS_SEND_DELAY)
    DepartmentMessage.objects.filter(pk=message.pk).update(sent_count=sent, failed_count=failed)
    return sent, failed


def dispatch_department_message_safely(message_id, phones, body, schema_name=None):
    """Text a desk's message off the request cycle, failures logged.

    A roll long enough to walk under the gateway's pace would hold the
    officer's request open for a minute or more, so the sends leave in a
    thread — the same reason the announcement broadcast does — and the row
    carries the counts once they are known.
    """
    if schema_name:
        try:
            from django_tenants.utils import schema_context
            with schema_context(schema_name):
                _dispatch_department_message_impl(message_id, phones, body)
            return
        except ImportError:
            pass
    _dispatch_department_message_impl(message_id, phones, body)


def _dispatch_department_message_impl(message_id, phones, body):
    message = DepartmentMessage.objects.filter(pk=message_id).first()
    if message is None:
        # The desk cleared its log between the post and the thread's start.
        return
    try:
        send_department_message(message, phones, body)
    except Exception:
        logger.exception('Department message #%s failed to send', message_id)


class DepartmentMessagesView(APIView):
    """A desk's messages: what it has sent, and one it is sending now.

    Two doors write this one log — the Messaging view's composer and the
    Message button at the foot of the members roll — and both address the
    roll the desk itself reads: the recipients come from
    ``DepartmentMembersView``, so a text can never reach further than the
    list on screen. A desk may also hand it one number of its own, for
    someone the system has never met; that send walks no roll and keeps
    the number it used. Reading the log is open to the desk as the roll is;
    writing to it is the leader's hand, as every other write here is.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, department):
        if not Department.objects.filter(code=department).exists():
            return Response({'detail': 'Unknown department.'}, status=status.HTTP_404_NOT_FOUND)
        # The roll as the composer will address it, counted here so the box can
        # say who it goes to before the officer writes a word of it.
        members = DepartmentMembersView().get(request, department).data.get('members', [])
        reachable = {
            phone for phone in (sms.recipient(row.get('phone_number') or '') for row in members) if phone
        }
        return Response({
            'messages': [
                department_message_payload(message)
                for message in DepartmentMessage.objects.filter(department=department)[:50]
            ],
            # The flag the composer renders behind, so a reader who cannot
            # send is not offered a box that would refuse them.
            'can_send': can_manage_department(request.user, department),
            # Whether the gateway has a token — asked once so the view can say
            # what a send will do before the officer writes one.
            'gateway': sms.configured(),
            'roll_count': len(members),
            'reachable': len(reachable),
        })

    def post(self, request, department):
        target = Department.objects.filter(code=department, is_active=True).first()
        if target is None:
            return Response({'detail': 'Unknown department.'}, status=status.HTTP_404_NOT_FOUND)
        if not can_manage_department(request.user, department):
            return Response(
                {'detail': "Only church officers or this department's leader can message the roll."},
                status=status.HTTP_403_FORBIDDEN,
            )
        body = str(request.data.get('body') or '').strip()
        if not body:
            return Response({'body': 'Write the message first.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(body) > 900:
            return Response({'body': 'That runs past 900 characters — send it as two messages.'}, status=status.HTTP_400_BAD_REQUEST)
        unit = str(request.data.get('unit') or '').strip()
        if unit and unit not in target.unit_names:
            return Response({'unit': 'That is not one of this department\u2019s units.'}, status=status.HTTP_400_BAD_REQUEST)

        # One number the system has never met, typed by hand: the door for a
        # parent who has not joined, a visitor, a supplier. It goes to that
        # number and to nobody else — the roll beside it is not walked — and
        # the row keeps which number it was, so the log still says what left
        # the church's gateway. A number the gateway could not use is refused
        # before anything is stored, rather than kept as a send that never had
        # a chance of landing.
        typed = str(request.data.get('phone') or '').strip()
        direct = ''
        if typed:
            direct = sms.recipient(typed)
            if not direct:
                return Response(
                    {'phone': 'That is not a usable Kenyan mobile number — try 07… or +254….'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            unit = ''

        if direct:
            members, phones = [], [direct]
        else:
            # The roll as the desk reads it — the same union of rows (the choir
            # and the singing groups under music, the roster under Sabbath School,
            # the children's records), so the message goes to exactly the list on
            # screen and no further.
            roll = DepartmentMembersView().get(request, department, unit=unit)
            members = roll.data.get('members', [])
            seen = set()
            phones = []
            for row in members:
                phone = sms.recipient(row.get('phone_number') or '')
                if not phone or phone in seen:
                    continue
                seen.add(phone)
                phones.append(phone)

        count_word = 'number' if len(phones) == 1 else 'numbers'
        message = DepartmentMessage.objects.create(
            department=department,
            unit=unit,
            body=body,
            audience=direct or (f"{target.name} roll" if not unit else f"{target.name} — {unit}"),
            direct_phone=direct,
            recipient_count=1 if direct else len(members),
            created_by=request.user,
        )
        payload = department_message_payload(message)
        if not phones:
            return Response(
                {'message': payload, 'sent': 0, 'failed': 0, 'reachable': 0,
                 'detail': 'Saved — nobody on this roll has a phone number on file yet.'},
                status=status.HTTP_201_CREATED,
            )
        if not sms.configured():
            # An honest answer rather than a walk that silently fails: the
            # message is kept either way, so it is written when the token is.
            return Response(
                {'message': payload, 'sent': 0, 'failed': 0, 'reachable': len(phones),
                 'detail': 'Saved, but nothing went out — the SMS gateway has no key on this server yet.'},
                status=status.HTTP_201_CREATED,
            )
        if sms_broadcasts_run_inline():
            sent, failed = send_department_message(message, phones, body)
            return Response(
                {'message': department_message_payload(message), 'sent': sent, 'failed': failed,
                 'reachable': len(phones),
                 'detail': f'Sent to {sent} of {len(phones)} {count_word}.'},
                status=status.HTTP_201_CREATED,
            )
        schema_name = getattr(connection, 'schema_name', None)
        threading.Thread(
            target=dispatch_department_message_safely,
            args=(message.pk, phones, body, schema_name),
            name=f'department-message-{message.pk}',
            daemon=True,
        ).start()
        return Response(
            {'message': department_message_payload(message), 'sent': None, 'failed': None,
             'reachable': len(phones), 'sending': True,                 'detail': f'Sending to {len(phones)} {count_word}…'},
            status=status.HTTP_201_CREATED,
        )


def singing_group_payload(group):
    """One singing group, with its register of singers."""
    leader = group.leader
    memberships = list(group.memberships.select_related('member', 'member__member_profile'))
    return {
        'id': group.id,
        'name': group.name,
        'description': group.description or '',
        'leader_id': group.leader_id,
        'leader_name': (leader.get_full_name() or leader.get_username()) if leader else '',
        'is_active': group.is_active,
        'created_at': group.created_at,
        'member_count': len(memberships),
        'members': [
            {
                'id': row.member_id,
                'name': row.member.get_full_name() or row.member.get_username(),
                'username': row.member.get_username(),
            }
            for row in memberships
        ],
    }


class DepartmentSingingGroupsView(APIView):
    """The singing groups registered under a department — the music register."""

    permission_classes = [IsAuthenticated]

    def get(self, request, department):
        if not Department.objects.filter(code=department, is_active=True).exists():
            return Response({'detail': 'Unknown department.'}, status=status.HTTP_404_NOT_FOUND)
        groups = SingingGroup.objects.filter(is_active=True).prefetch_related('memberships__member')
        # The desk reads the same flag its writes are guarded by, so the
        # register's buttons render only for the hands that can use them.
        return Response({
            'groups': [singing_group_payload(group) for group in groups],
            'can_manage': can_manage_department(request.user, department),
        })

    def post(self, request, department):
        if not Department.objects.filter(code=department, is_active=True).exists():
            return Response({'detail': 'Unknown department.'}, status=status.HTTP_404_NOT_FOUND)
        if not can_manage_department(request.user, department):
            return Response(
                {'detail': "Only church officers or this department's leader can register a singing group."},
                status=status.HTTP_403_FORBIDDEN,
            )
        name = str(request.data.get('name') or '').strip()
        if len(name) < 3:
            return Response({'name': 'Give the group a name of at least three characters.'}, status=status.HTTP_400_BAD_REQUEST)
        if SingingGroup.objects.filter(name__iexact=name).exists():
            return Response({'name': 'A singing group by that name already exists.'}, status=status.HTTP_400_BAD_REQUEST)
        leader = None
        if request.data.get('leader_id'):
            leader = User.objects.filter(pk=request.data.get('leader_id')).first()
        group = SingingGroup.objects.create(
            name=name,
            description=str(request.data.get('description') or '').strip(),
            leader=leader,
            created_by=request.user,
        )
        return Response(singing_group_payload(group), status=status.HTTP_201_CREATED)


class SingingGroupDetailView(APIView):
    """One singing group: take it off the register."""

    permission_classes = [IsAuthenticated]

    def delete(self, request, department, group_id):
        if not can_manage_department(request.user, department):
            return Response(
                {'detail': "Only church officers or this department's leader can change the register."},
                status=status.HTTP_403_FORBIDDEN,
            )
        deleted, _ = SingingGroup.objects.filter(pk=group_id).delete()
        if not deleted:
            return Response({'detail': 'That singing group does not exist.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'detail': 'Singing group removed.'})


class SingingGroupMembersView(APIView):
    """The singers in one group: add one, or take one out."""

    permission_classes = [IsAuthenticated]

    def post(self, request, department, group_id):
        if not can_manage_department(request.user, department):
            return Response(
                {'detail': "Only church officers or this department's leader can change a group's members."},
                status=status.HTTP_403_FORBIDDEN,
            )
        group = SingingGroup.objects.filter(pk=group_id).first()
        if group is None:
            return Response({'detail': 'That singing group does not exist.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            target = User.objects.get(pk=request.data.get('member_id'))
        except (User.DoesNotExist, TypeError, ValueError):
            return Response({'detail': 'Member not found.'}, status=status.HTTP_404_NOT_FOUND)
        row, created = SingingGroupMember.objects.get_or_create(
            group=group, member=target, defaults={'added_by': request.user},
        )
        if not created:
            return Response({'detail': 'That member is already in this group.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response(singing_group_payload(group), status=status.HTTP_201_CREATED)

    def delete(self, request, department, group_id):
        if not can_manage_department(request.user, department):
            return Response(
                {'detail': "Only church officers or this department's leader can change a group's members."},
                status=status.HTTP_403_FORBIDDEN,
            )
        deleted, _ = SingingGroupMember.objects.filter(
            group_id=group_id, member_id=request.data.get('member_id'),
        ).delete()
        if not deleted:
            return Response({'detail': 'That member is not in this group.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'detail': 'Member removed from the group.'})


def clean_program_items(raw):
    """An event's programme sessions, trimmed to the shape the sheet reads.

    Each entry is one session of the order of service — Sabbath School from
    8:00 to 10:00, say — carrying the hours it runs, what it is called, the
    people facilitating it under their roles, and the events *inside* it: the
    opening song, the mission reading, each with its own hours and its own
    facilitator. Anything else the client sent is dropped rather than stored:
    these rows are printed to the congregation, so a malformed one would
    print as one.
    """
    def clock(value):
        """An hour as ``HH:MM``, or '' when it is not one.

        Padded, because an ``<input type="time">`` only reads a two-digit
        hour back out — a programme typed as "8:00" would open in the
        editor as an empty start time — and refused past a day's bounds,
        since these hours are printed to the congregation.
        """
        value = str(value or '').strip()
        match = re.match(r'^(\d{1,2}):(\d{2})$', value)
        if not match:
            return ''
        hour, minute = int(match.group(1)), int(match.group(2))
        if hour > 23 or minute > 59:
            return ''
        return f'{hour:02d}:{minute:02d}'

    # A browser sending the rows alongside a file would have encoded them as
    # a JSON string on multipart form data; read that as the list it holds.
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except ValueError:
            return []
    if not isinstance(raw, list):
        return []
    def people(entry):
        named = []
        for person in (entry.get('participants') or [])[:20]:
            if not isinstance(person, dict):
                continue
            name = str(person.get('name') or '').strip()[:120]
            if name:
                named.append({'name': name, 'role': str(person.get('role') or '').strip()[:120]})
        return named

    def part_shapes(raw_parts):
        """The events inside a session, each an entry of its own."""
        if not isinstance(raw_parts, list):
            return []
        shaped_parts = []
        for part in raw_parts[:40]:
            if not isinstance(part, dict):
                continue
            shaped = {
                'start': clock(part.get('start')),
                'end': clock(part.get('end')),
                'title': str(part.get('title') or '').strip()[:200],
                'participants': people(part),
            }
            if shaped['title'] or shaped['participants']:
                shaped_parts.append(shaped)
        return shaped_parts

    shaped_items = []
    for entry in raw[:60]:
        if not isinstance(entry, dict):
            continue
        parts = part_shapes(entry.get('parts'))
        shaped = {
            'start': clock(entry.get('start')),
            'end': clock(entry.get('end')),
            'title': str(entry.get('title') or '').strip()[:200],
            'participants': people(entry),
            'parts': parts,
        }
        if shaped['title'] or shaped['participants'] or parts:
            shaped_items.append(shaped)
    return shaped_items


def _calendar_time_from_string(value):
    """``HH:MM`` as the desks' time inputs send it — a ``time``, or None for an
    hour the desk left blank. One parser for the desk's calendar views."""
    value = (value or '').strip()
    if not value:
        return None
    try:
        from datetime import time as dt_time
        parts = value.split(':')
        return dt_time(int(parts[0]), int(parts[1]))
    except Exception:
        return None


# How much calendar an event claims, and when two claims collide.


def _event_slot_bounds(event_date, event_time, end_date=None, end_time=None):
    """The part of the calendar an event takes, as a start and an end instant.

    An event given a date and no time is assumed to run through the whole day
    it is set for — through the whole range of days where an end date is
    given: no hour was set, so the calendar reads it as holding them all.
    An event that carries a time occupies only its own window — the rest of
    its day stays free — closing where end_date/end_time puts the close, and
    closing on the hour it opens at when the desk gave no end, so two events
    set for the same moment still collide.

    Returns (start, end) with end exclusive; (None, None) when the day(s)
    the desk typed cannot be read.
    """
    from datetime import datetime as dt, time as dt_time, timedelta
    from datetime import date as dt_date

    try:
        start_day = dt_date.fromisoformat(str(event_date)[:10])
        end_day = dt_date.fromisoformat(str(end_date)[:10]) if end_date else start_day
    except (ValueError, TypeError):
        return None, None
    if end_day < start_day:
        end_day = start_day
    if event_time is None:
        # The whole day(s): midnight through the midnight after the last day,
        # so the range touches every hour it covers and yields to nothing.
        return (
            dt.combine(start_day, dt_time.min),
            dt.combine(end_day + timedelta(days=1), dt_time.min),
        )
    start = dt.combine(start_day, event_time)
    end = dt.combine(end_day, end_time) if end_time is not None else start
    # A window the desk left open — or one that reads narrower than the days
    # it spans — opens on the hour it was set at, so that hour is still
    # bookable by another event.
    if end <= start:
        end = start + timedelta(seconds=1)
    return start, end


def _spoken_date(value):
    # The church writes its dates day first.
    return f"{value.day}/{value.month}/{value.year}"


def _spoken_time(value):
    hours = value.hour % 12 or 12
    return f"{hours}:{value.minute:02d} {'AM' if value.hour < 12 else 'PM'}"


def _describe_event_slot(event_date, event_time, end_date=None, end_time=None):
    """The slot in words, for the collision notice the desk is shown."""
    day = _spoken_date(event_date)
    span = f"–{_spoken_date(end_date)}" if end_date and end_date != event_date else ""
    if event_time is None:
        return f"all of {day}{span}"
    window = _spoken_time(event_time)
    if end_time:
        window = f"{window}–{_spoken_time(end_time)}"
    return f"{window} on {day}{span}"


def _calendar_slot_conflicts(event_date, event_time, end_date=None, end_time=None, exclude_id=None):
    """The events already holding the slot the desk wants to file into.

    The calendar is one sheet the whole church reads, so a slot is a slot
    whoever files it: an event already set for a period — a day, a range of
    days, or a day-and-hours window — blocks a second one. The row being
    written is excluded here, so a saved event corrected in place is judged
    against the rest of the calendar rather than against itself.
    """
    start, end = _event_slot_bounds(event_date, event_time, end_date, end_time)
    if start is None or end is None:
        return []
    last_day = max(end_date or event_date, event_date, key=str)
    first_day = event_date
    queryset = (
        DepartmentEvent.objects.exclude(pk=exclude_id)
        if exclude_id is not None
        else DepartmentEvent.objects.all()
    )
    # A cheap first sweep — rows whose day range touches the one being filed
    # — then the exact hour-by-hour read in Python, so a 2 PM event beside a
    # 9 AM one shares a day without sharing a slot.
    candidates = queryset.filter(
        Q(event_date__lte=last_day)
        & (Q(end_date__gte=first_day) | Q(end_date__isnull=True, event_date__gte=first_day))
    )
    conflicts = []
    for candidate in candidates:
        other_start, other_end = _event_slot_bounds(
            candidate.event_date, candidate.event_time, candidate.end_date, candidate.end_time
        )
        if other_start is None:
            continue
        if start < other_end and other_start < end:
            conflicts.append(candidate)
    return conflicts


def _slot_conflict_response(conflicts, all_day_arrival=False):
    """The refusal a desk gets when its slot is taken: that another event
    exists for the period, which event occupies the slot, and which
    department or ministry the occupant belongs to."""
    first = conflicts[0]
    holder = Department.objects.filter(code=first.department).first()
    holder_name = holder.name if holder else first.department
    where = f"the {first.unit} of {holder_name}" if first.unit else holder_name
    detail = (
        f'An event exists for that period already: "{first.title}" from {where} '
        f"holds {_describe_event_slot(first.event_date, first.event_time, first.end_date, first.end_time)}."
    )
    if len(conflicts) > 1:
        more = len(conflicts) - 1
        detail += f" {more} more event{'s' if more > 1 else ''} also sit in that period."
    if all_day_arrival or first.event_time is None:
        detail += " An event given a date without a time reads as holding its whole day, so it shares no period with any other event."
    return {
        'detail': detail,
        'conflict': {
            'id': first.id,
            'title': first.title,
            'department': first.department,
            'department_name': holder_name,
            'unit': first.unit,
        },
    }


class DepartmentEventsView(APIView):
    """A department's calendar: the stored events behind the ministry pages."""

    permission_classes = [IsAuthenticated]

    def get(self, request, department):
        if not Department.objects.filter(code=department, is_active=True).exists():
            return Response({'detail': 'Unknown department.'}, status=status.HTTP_404_NOT_FOUND)
        target = Department.objects.filter(code=department, is_active=True).first()
        unit = str(request.query_params.get('unit') or '').strip()
        if unit and unit not in target.unit_names:
            return Response({'unit': 'That is not one of this department\u2019s units.'}, status=status.HTTP_400_BAD_REQUEST)
        events = DepartmentEvent.objects.filter(department=department, **({'unit': unit} if unit else {}))
        events = events.order_by('event_date', 'event_time', 'title')
        church_settings = ChurchSettings.objects.get_or_create(pk=1)[0]
        can_schedule_across = can_schedule_across_departments(request.user)
        return Response({'events': [
            {
                'id': event.id,
                'title': event.title,
                'date': event.event_date,
                'time': event.event_time.strftime('%H:%M') if event.event_time else '',
                'end_date': event.end_date,
                'end_time': event.end_time.strftime('%H:%M') if event.end_time else '',
                'mode': event.mode,
                'location': event.location,
                'meeting_link': event.meeting_link,
                'program_file': request.build_absolute_uri(event.program_file.url) if event.program_file else None,
                'program_items': event.program_items,
                'lead': event.lead,
                'notes': event.notes,
                'unit': event.unit,
            }
            for event in events
        ], 'unit': unit, 'units': target.unit_names, 'church_name': church_settings.church_name,
            # Whether this reader may file an event on another desk's calendar —
            # and so whether the desk should offer the choice at all. Carrying
            # the church's own directory alongside keeps the picker reading the
            # codes the server will accept rather than a second list the page
            # builds for itself.
            'can_schedule_across': can_schedule_across,
            'departments': (
                [{'code': row.code, 'label': row.name}
                 for row in Department.objects.filter(is_active=True).order_by('name')]
                if can_schedule_across else []
            )})

    def post(self, request, department):
        if not Department.objects.filter(code=department, is_active=True).exists():
            return Response({'detail': 'Unknown department.'}, status=status.HTTP_404_NOT_FOUND)
        # An event is written on the calendar that will hold it — usually the
        # desk writing it, but the desk that plans the church's week (personal
        # ministries) files into the ministry that will run the event, and
        # opens that ministry's own calendar to do it. So the write is judged
        # against the calendar named, not the one the URL was opened on: its
        # own desk files its own, church officers file anywhere, and the
        # personal ministries desk keeps every ministry's week.
        target_code = str(request.data.get('department') or department).strip() or department
        if (
            not can_manage_department(request.user, target_code)
            and not can_schedule_across_departments(request.user)
        ):
            return Response(
                {'detail': 'Only church officers, this department\'s leader, or the personal ministries desk can add events.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if target_code != department and not can_schedule_across_departments(request.user):
            return Response(
                {'detail': 'Only church officers or the personal ministries desk can add events to another department.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        target = Department.objects.filter(code=target_code, is_active=True).first()
        if target is None:
            return Response({'department': 'Unknown department.'}, status=status.HTTP_400_BAD_REQUEST)
        title = (request.data.get('title') or '').strip()
        event_date = request.data.get('date') or ''
        if not title or not event_date:
            return Response({'detail': 'A title and a date are required.'}, status=status.HTTP_400_BAD_REQUEST)
        unit = str(request.data.get('unit') or '').strip()
        if unit and unit not in target.unit_names:
            return Response({'unit': 'That is not one of this department\u2019s units.'}, status=status.HTTP_400_BAD_REQUEST)
        mode = (request.data.get('mode') or 'physical').strip()
        if mode not in ('physical', 'virtual'):
            mode = 'physical'
        event_time = _calendar_time_from_string(request.data.get('time'))
        end_event_time = _calendar_time_from_string(request.data.get('end_time'))
        end_event_date = request.data.get('end_date') or None
        # The calendar is shared: nothing may be filed onto a slot another
        # event already holds. The desk is refused with the occupant named.
        conflicts = _calendar_slot_conflicts(event_date, event_time, end_event_date, end_event_time)
        if conflicts:
            return Response(
                _slot_conflict_response(conflicts, all_day_arrival=event_time is None),
                status=status.HTTP_409_CONFLICT,
            )
        event = DepartmentEvent.objects.create(
            department=target_code,
            title=title,
            unit=unit,
            event_date=event_date,
            event_time=event_time,
            end_date=end_event_date,
            end_time=end_event_time,
            mode=mode,
            location=(request.data.get('location') or '').strip(),
            meeting_link=(request.data.get('meeting_link') or '').strip(),
            program_file=request.FILES.get('program_file'),
            lead=(request.data.get('lead') or '').strip(),
            notes=(request.data.get('notes') or '').strip(),
            created_by=request.user,
        )
        return Response(
            {'detail': 'Event added to the calendar.', 'id': event.id, 'department': target_code},
            status=status.HTTP_201_CREATED,
        )


    def patch(self, request, department, event_id=None):
        """An event, once it is on the calendar, corrected — its details typed
        back (title, day, hours, place, meeting link) and its programme given
        after the fact: sessions typed into ``program_items`` (an empty list
        clearing it) or ``program_file`` attached as a file. Either is the
        same programme the congregation reads from the church calendar, so
        the write is held to the same officers the add and the remove are —
        this desk's own leadership, church officers, and the desk that keeps
        the church's week, which edits every ministry's calendar.
        """
        if not Department.objects.filter(code=department, is_active=True).exists():
            return Response({'detail': 'Unknown department.'}, status=status.HTTP_404_NOT_FOUND)
        if not (
            can_manage_department(request.user, department)
            or can_schedule_across_departments(request.user)
        ):
            return Response(
                {'detail': 'Only church officers, this department\'s leader, or the personal ministries desk can edit events.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        event = DepartmentEvent.objects.filter(department=department, pk=event_id).first()
        if event is None:
            return Response({'detail': 'Event not found.'}, status=status.HTTP_404_NOT_FOUND)
        if 'program_file' in request.FILES:
            event.program_file = request.FILES['program_file']
        if 'program_items' in request.data:
            event.program_items = clean_program_items(request.data.get('program_items'))
        # The details the desk typed back: each field it sent is taken, each
        # it left out keeps its stored value — so a programme correction alone
        # does not blank an event's place or its hours.
        if 'title' in request.data:
            title = (request.data.get('title') or '').strip()
            if not title:
                return Response({'detail': 'A title is required.'}, status=status.HTTP_400_BAD_REQUEST)
            event.title = title
        if 'date' in request.data:
            date_value = (request.data.get('date') or '').strip()
            if not date_value:
                return Response({'detail': 'A date is required.'}, status=status.HTTP_400_BAD_REQUEST)
            event.event_date = date_value
        if 'end_date' in request.data:
            event.end_date = (request.data.get('end_date') or '').strip() or None
        if 'time' in request.data:
            event.event_time = _calendar_time_from_string(request.data.get('time'))
        if 'end_time' in request.data:
            event.end_time = _calendar_time_from_string(request.data.get('end_time'))
        if 'mode' in request.data:
            mode = (request.data.get('mode') or 'physical').strip()
            event.mode = mode if mode in ('physical', 'virtual') else 'physical'
        if 'location' in request.data:
            event.location = (request.data.get('location') or '').strip()
        if 'meeting_link' in request.data:
            event.meeting_link = (request.data.get('meeting_link') or '').strip()
        if 'lead' in request.data:
            event.lead = (request.data.get('lead') or '').strip()
        if 'notes' in request.data:
            event.notes = (request.data.get('notes') or '').strip()
        # The same rule a new event is held to: the calendar is shared, so a
        # correction may not drive the event onto a slot another already
        # holds. Its own row is excluded, so everything may return to where
        # it was.
        conflicts = _calendar_slot_conflicts(
            event.event_date, event.event_time, event.end_date, event.end_time,
            exclude_id=event.id,
        )
        if conflicts:
            return Response(
                _slot_conflict_response(conflicts, all_day_arrival=event.event_time is None),
                status=status.HTTP_409_CONFLICT,
            )
        event.save()
        return Response({'detail': 'Event saved.', 'id': event.id, 'department': event.department, 'program_file': request.build_absolute_uri(event.program_file.url) if event.program_file else None, 'program_items': event.program_items})

    def delete(self, request, department, event_id=None):
        if not Department.objects.filter(code=department, is_active=True).exists():
            return Response({'detail': 'Unknown department.'}, status=status.HTTP_404_NOT_FOUND)
        if not (
            can_manage_department(request.user, department)
            or can_schedule_across_departments(request.user)
        ):
            return Response(
                {'detail': 'Only church officers, this department\'s leader, or the personal ministries desk can remove events.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        target_id = event_id or request.data.get('id')
        deleted, _ = DepartmentEvent.objects.filter(department=department, pk=target_id).delete()
        if not deleted:
            return Response({'detail': 'Event not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'detail': 'Event removed from the calendar.'})


class DepartmentEventProgramView(APIView):
    """One calendar event's programme, printed on the church's own paper.

    Reading the sheet is open — the same rows already ride the congregation's
    public calendar feed — so the letterhead printout can be opened, saved and
    shared without the reader being signed in. Taking a programme off an event
    is still the desk's own write, held to the same officers who file events;
    it clears the two parts of a programme at once, the typed rows and the
    file the desk uploaded, since either is the programme the event carries.
    """

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsAuthenticated()]

    def get(self, request, department, event_id):
        department_row = Department.objects.filter(code=department, is_active=True).first()
        if department_row is None:
            return Response({'detail': 'Unknown department.'}, status=status.HTTP_404_NOT_FOUND)
        event = DepartmentEvent.objects.filter(department=department, pk=event_id).first()
        if event is None:
            return Response({'detail': 'Event not found.'}, status=status.HTTP_404_NOT_FOUND)

        from .pdf_generator import (
            generate_event_program_pdf,
            generate_event_program_plain_pdf,
            _spoken_hour,
            _spoken_range,
        )

        # The brochure's back panel speaks for the church: where to find it,
        # its week of worship, and how to give. Everything the office has not
        # written stays off the paper.
        church_row = ChurchSettings.objects.first()

        def _spoken_clock(moment):
            """A stored clock spoken the programme sheet's way — reuse, not a
            second hour format to keep in step."""
            return _spoken_hour(moment.strftime('%H:%M') if hasattr(moment, 'strftime') else str(moment))

        services = [
            {
                'weekday': meeting.get_weekday_display(),
                'text': (
                    f"{meeting.title} \u00b7 "
                    f"{_spoken_range(_spoken_clock(meeting.start_time), _spoken_clock(meeting.end_time))}"
                ),
            }
            for meeting in WeeklyMeeting.objects.filter(is_active=True)[:8]
        ]
        giving = []
        if church_row:
            if church_row.mpesa_paybill_number:
                bits = [f'M-PESA Pay Bill {church_row.mpesa_paybill_number}']
                if church_row.mpesa_account_number:
                    bits.append(f'Account {church_row.mpesa_account_number}')
                if church_row.mpesa_account_name:
                    bits.append(church_row.mpesa_account_name)
                giving.append(', '.join(bits))
            if church_row.mpesa_phone_number:
                giving.append(f'Send Money {church_row.mpesa_phone_number}')
            if church_row.bank_name:
                bank_bits = [church_row.bank_name]
                if church_row.bank_account_number:
                    bank_bits.append(f'A/C {church_row.bank_account_number}')
                giving.append(' \u00b7 '.join(bank_bits))
            if church_row.bank_paybill_number:
                giving.append(f'Bank Pay Bill {church_row.bank_paybill_number}')

        # The day's own ministry account: its department fund, printed beside
        # the church's giving lines. The account name is what the giver types
        # into the M-Pesa prompt for this ministry's money — the same short
        # name the desk's reports read. A fund with no M-Pesa account still
        # speaks through its bank or cash account number when it has one.
        dept_account = None
        fallback_account = None
        for account in department_row.treasury_accounts.all():
            if not (account.name or '').strip():
                continue
            if account.account_type == 'mobile_money':
                dept_account = account
                break
            if fallback_account is None and (account.account_number or '').strip():
                fallback_account = account
        if dept_account or fallback_account:
            account = dept_account or fallback_account
            name = account.name.strip()
            if dept_account and church_row.mpesa_paybill_number:
                giving.append(
                    f'{department_row.name}: M-PESA Pay Bill {church_row.mpesa_paybill_number}, '
                    f'Account {name}'
                )
            elif account.account_number:
                giving.append(f'{department_row.name}: Account {name} · A/C {account.account_number}')
            else:
                giving.append(f'{department_row.name}: Account {name}')

        # The QR the papers carry: the system's own giving page, opened with
        # the ministry's account already chosen when its fund names one, or
        # the plain giving page when it does not — the scanner arrives at the
        # form, not the front door.
        import urllib.parse
        give_account = dept_account or fallback_account
        give_url = (
            f'{settings.FRONTEND_URL}/give?purpose={urllib.parse.quote(give_account.name.strip())}'
            if give_account else
            f'{settings.FRONTEND_URL}/give'
        )

        contact = {
            'address': (church_row.address if church_row else '') or '',
            'services': services,
            'giving': giving,
            'give_url': give_url,
        }
        # Two papers for one programme, chosen by the reader's purpose. The
        # plain sheet (`style=plain`) is the single letterhead page the desk
        # shares — a link sent on, read whole on a phone. The brochure is the
        # bifold — the sheet that folds, printed as the hard copy handed at
        # the door. The brochure stays the default, so a link already handed
        # on before this choice existed still folds into the same paper it
        # always did.
        style = str(request.query_params.get('style') or 'brochure').strip().lower()
        if style == 'plain':
            pdf_bytes = generate_event_program_plain_pdf(
                event, department_row.name, contact=contact, department_code=department,
            )
            filename = f'Event_Program_{event.event_date}.pdf'
        else:
            # The brochure wears the department's own accent — the colour its
            # desk already shows on the site — so the printed sheet and the
            # hub say the same thing about who is running the day.
            pdf_bytes = generate_event_program_pdf(
                event, department_row.name, contact=contact, department_code=department,
            )
            filename = f'Event_Brochure_{event.event_date}.pdf'
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        # Served inline: the desk's "View program" opens the sheet in its own
        # tab to be read. The Download button carries its own `download`
        # attribute, which still decides the filename when this same link is
        # used to keep a copy.
        response['Content-Disposition'] = f'inline; filename="{filename}"'
        return response

    def delete(self, request, department, event_id):
        if not Department.objects.filter(code=department, is_active=True).exists():
            return Response({'detail': 'Unknown department.'}, status=status.HTTP_404_NOT_FOUND)
        if not (
            can_manage_department(request.user, department)
            or can_schedule_across_departments(request.user)
        ):
            return Response(
                {'detail': "Only church officers, this department's leader, or the personal ministries desk can remove a program."},
                status=status.HTTP_403_FORBIDDEN,
            )
        event = DepartmentEvent.objects.filter(department=department, pk=event_id).first()
        if event is None:
            return Response({'detail': 'Event not found.'}, status=status.HTTP_404_NOT_FOUND)
        if event.program_file:
            event.program_file.delete(save=False)
        event.program_file = None
        event.program_items = []
        event.save(update_fields=['program_file', 'program_items'])
        return Response({'detail': 'Program removed from the event.'})


class ChurchCalendarView(APIView):
    """The church calendar: every ministry's own events in one feed.

    The desks write these rows (the department calendar), and this read is
    the congregation's window on them — so it is open, and each event carries
    the ministry's name rather than its code. The desk's own notes stay with
    the desk that wrote them; a programme file and a leader's name are what
    the congregation is shown.

    Each event also carries its ministry's giving purpose — the wording of
    the treasury account the ministry gives into, which is the account a
    giver's deep link must name to preselect it. Reading it from the linked
    fund (rather than the page guessing from the ministry's name) keeps the
    purpose on a row and the fund it opens in step; a ministry with no fund
    yet carries its own name, which is still the purpose its row displays.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        departments = {
            row.code: row.name for row in Department.objects.filter(is_active=True)
        }
        # One fund per ministry, so the first account linked to a department is
        # the one its desk reads and the giving form offers.
        purposes = {}
        for account in TreasuryAccount.objects.filter(
            department__code__in=departments.keys(),
        ).order_by('id'):
            purposes.setdefault(
                account.department.code,
                (account.description or account.name).strip() or account.name,
            )
        events = DepartmentEvent.objects.filter(department__in=departments.keys()).order_by(
            'event_date', 'event_time', 'title',
        )
        return Response({'events': [
            {
                'id': event.id,
                'department': event.department,
                'department_name': departments.get(event.department, event.department),
                'giving_purpose': purposes.get(
                    event.department, departments.get(event.department, event.department),
                ),
                'title': event.title,
                'date': event.event_date,
                'time': event.event_time.strftime('%H:%M') if event.event_time else '',
                'end_date': event.end_date,
                'end_time': event.end_time.strftime('%H:%M') if event.end_time else '',
                'mode': event.mode,
                'location': event.location,
                'meeting_link': event.meeting_link,
                'lead': event.lead,
                'unit': event.unit,
                'program_file': request.build_absolute_uri(event.program_file.url) if event.program_file else None,
                'program_items': event.program_items,
            }
            for event in events
        ]})


def can_manage_weekly_meetings(user):
    """Who keeps the church's week: the personal ministries office.

    These meetings are the whole congregation's — midweek vespers, Friday
    vespers, Sabbath worship — not one department's activity. The personal
    ministries leader maintains them because that office runs the church's
    weekly rhythm, so the gate is that ministry's desk plus the hub's own rule
    for a department (its leader and assistants, and the church officers). A
    ``pm_leader`` role holder counts too: a church may grant the office without
    a leaders-table row, and the desk must still open for them.
    """
    # The week is read by signed-out visitors too, and this gate is reached on
    # that path when they ask for the retired meetings, so the anonymous case
    # is answered here rather than in the query below.
    if user is None or not user.is_authenticated:
        return False
    if can_manage_department(user, 'personal_ministries'):
        return True
    profile = getattr(user, 'member_profile', None)
    return bool(profile and profile.has_role('pm_leader'))


class WeeklyMeetingsView(APIView):
    """The church's ordinary week: read by anyone, written by its keeper.

    Public on GET because the website's week, the calendar and the dashboard
    card all draw it for signed-out visitors too. The desk asks for
    ``?include_inactive=true`` to see the meetings it has retired, so a
    meeting can be put down and picked up again without being deleted.
    """

    def get_permissions(self):
        return [AllowAny()] if self.request.method == 'GET' else [IsAuthenticated()]

    def get(self, request):
        queryset = WeeklyMeeting.objects.all()
        wants_retired = request.query_params.get('include_inactive') == 'true'
        if not (wants_retired and can_manage_weekly_meetings(request.user)):
            queryset = queryset.filter(is_active=True)
        return Response({'meetings': WeeklyMeetingSerializer(queryset, many=True).data})

    def post(self, request):
        if not can_manage_weekly_meetings(request.user):
            return Response(
                {'detail': 'Only the personal ministries leader can set the church\u2019s weekly meetings.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = WeeklyMeetingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class WeeklyMeetingDetailView(APIView):
    """One weekly meeting: change it, retire it, or take it off the week."""

    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        if not can_manage_weekly_meetings(request.user):
            return Response(
                {'detail': 'Only the personal ministries leader can set the church\u2019s weekly meetings.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        meeting = WeeklyMeeting.objects.filter(pk=pk).first()
        if meeting is None:
            return Response({'detail': 'Meeting not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = WeeklyMeetingSerializer(meeting, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk):
        if not can_manage_weekly_meetings(request.user):
            return Response(
                {'detail': 'Only the personal ministries leader can set the church\u2019s weekly meetings.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        deleted, _ = WeeklyMeeting.objects.filter(pk=pk).delete()
        if not deleted:
            return Response({'detail': 'Meeting not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'detail': 'Meeting removed from the week.'})


class AnnouncementResponsesCsvView(APIView):
    """A poll's answers as CSV, one row per response, names included.

    Officers need the raw answers — who answered what and when — to take to
    the board or paste into a report. Only announcement managers may fetch
    it; responses to ordinary announcements (not opinion polls) come out
    too, labelled by action type, so nothing is lost.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        if not can_manage_announcements(request.user):
            return Response({'detail': 'Only officers who manage announcements may export answers.'}, status=status.HTTP_403_FORBIDDEN)
        announcement = Announcement.objects.filter(pk=pk).first()
        if announcement is None:
            return Response({'detail': 'Announcement not found.'}, status=status.HTTP_404_NOT_FOUND)

        is_opinion = announcement.announcement_type == 'opinion'
        buffer = StringIO()
        writer = csv.writer(buffer)

        if is_opinion:
            header = ['Respondent', 'Phone', 'Answer', 'Answered on']
        else:
            # A pledge's promise day and whether it has been honoured ride
            # along: the office takes this sheet to the board, and a pledge
            # nobody has heard about is exactly what it needs to see.
            header = [
                'Respondent', 'Phone', 'Action', 'Response text', 'Pledge (KES)',
                'Promised by', 'Pledge status', 'Closed by', 'Answered on',
            ]
        writer.writerow(header)

        for response in announcement.responses.select_related('user').order_by('created_at'):
            name = response.respondent_name
            if not name and response.user:
                name = response.user.get_full_name() or response.user.username
            phone = response.respondent_phone or ''
            when = timezone.localtime(response.created_at).strftime('%Y-%m-%d %H:%M')
            if is_opinion:
                answer = response.response_choice or response.response_text
                writer.writerow([name or 'Anonymous', phone, answer or '', when])
            else:
                writer.writerow([
                    name or 'Anonymous', phone, response.get_action_type_display(),
                    response.response_text or '',
                    str(response.pledge_amount) if response.pledge_amount is not None else '',
                    response.pledge_due_date.strftime('%Y-%m-%d') if response.pledge_due_date else '',
                    ('Redeemed' if response.pledge_redeemed_at else 'Outstanding') if response.pledge_amount is not None else '',
                    response.get_pledge_redeemed_via_display() if response.pledge_redeemed_via else '',
                    when,
                ])

        stamp = timezone.localtime().strftime('%Y%m%d')
        response = HttpResponse(buffer.getvalue(), content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="poll_answers_{pk}_{stamp}.csv"'
        return response


class DepartmentJoinRequestView(APIView):
    """A member's asks a desk answers: to join an area, or to open a group.

    POST raises one; GET reads the member's own asks and the answers to
    them. The desk that answers them is DepartmentJoinRequestReviewView.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = DepartmentJoinRequest.objects.filter(member=request.user)
        return Response({
            'requests': [
                {
                    'id': row.id,
                    'department': row.department,
                    'kind': row.kind,
                    'group_name': row.group_name,
                    'status': row.status,
                    'reply': row.reply,
                    'created_at': row.created_at,
                    'reviewed_at': row.reviewed_at,
                }
                for row in rows
            ],
        })

    def post(self, request, department):
        target = Department.objects.filter(code=department, is_active=True).first()
        if target is None:
            return Response({'detail': 'Unknown department.'}, status=status.HTTP_404_NOT_FOUND)
        kind = str(request.data.get('kind') or 'join')
        if kind not in ('join', 'singing_group'):
            return Response({'kind': 'Ask to join the ministry or department, or to register a singing group.'}, status=status.HTTP_400_BAD_REQUEST)
        if kind == 'join' and DepartmentMembership.objects.filter(member=request.user, department=department).exists():
            return Response({'detail': 'You are already on this roll.'}, status=status.HTTP_400_BAD_REQUEST)
        # One open ask per member per area, whatever kind — the desk answers
        # people, not stacks.
        if DepartmentJoinRequest.objects.filter(member=request.user, department=department, status='pending').exists():
            return Response({'detail': 'You already have a request waiting with this department.'}, status=status.HTTP_400_BAD_REQUEST)
        group_name = ''
        group_description = ''
        if kind == 'singing_group':
            group_name = str(request.data.get('group_name') or '').strip()
            if len(group_name) < 3:
                return Response({'group_name': 'Give the group a name of at least three characters.'}, status=status.HTTP_400_BAD_REQUEST)
            if SingingGroup.objects.filter(name__iexact=group_name).exists():
                return Response({'group_name': 'A singing group by that name already exists.'}, status=status.HTTP_400_BAD_REQUEST)
            group_description = str(request.data.get('group_description') or '').strip()[:240]
        row = DepartmentJoinRequest.objects.create(
            member=request.user,
            department=department,
            kind=kind,
            group_name=group_name,
            group_description=group_description,
            note=str(request.data.get('note') or '').strip()[:500],
        )
        # The ask lands with the department's own leadership and the elders'
        # desk — the people who answer for the area in church — and with the
        # administrators, who answer join asks from Administration's Join
        # Requests toggle. ``request_audience('join')`` is the office rule the
        # other request desks already answer to; join and transfer are the two
        # desks that reach the admin role, because admitting or sending away a
        # member is the office's to do. Dept leadership then widens it to the
        # area's own leaders.
        from .requests import request_audience

        audience_ids = set(DepartmentAssignment.objects.filter(
            department__code=department, department__is_active=True, member__is_active=True,
        ).values_list('member_id', flat=True))
        audience_ids.update(request_audience('join').values_list('id', flat=True))
        audience_ids.discard(request.user.id)
        audience = User.objects.filter(id__in=audience_ids, is_active=True)
        # The desk that answers it: Administration's Join Requests toggle,
        # opened on this very request, so the notice is one tap from a
        # decision rather than a hunt through a queue of other desks.
        desk_link = f'{settings.FRONTEND_URL}/administration?tab=join-requests&request=area-{row.id}'
        ask = (
            f'wants to register the singing group "{group_name}" under'
            if kind == 'singing_group' else 'has asked to join'
        )
        subject = (
            f'New singing group proposal for {target.name}'
            if kind == 'singing_group' else f'New join request for {target.name}'
        )
        body = (
            f"{request.user.get_full_name() or request.user.get_username()} {ask} "
            f"{target.name}. Open the requests desk to respond: {desk_link}"
        )
        ChurchNotification.objects.bulk_create([
            ChurchNotification(user=person, title=subject, message=body, link=desk_link)
            for person in audience
        ])
        # And the phone itself, to the very same people: the bell above is only
        # read by someone who opens the site, while a request to join waits on
        # an answer either way. The push carries the words of the in-app notice
        # and lands on the same desk, so both doors open the same request.
        # Keys are checked once, not per reader, and a push failure never fails
        # the ask — the same covenant as the email.
        try:
            from .push import push_to_user, vapid_keys_ready

            if vapid_keys_ready():
                for person in audience:
                    push_to_user(person, title=subject, body=body, link=desk_link)
        except Exception:
            pass
        try:
            send_mail(
                subject, body, settings.DEFAULT_FROM_EMAIL,
                [u.email for u in audience if u.email],
                fail_silently=True,
            )
        except Exception:
            pass
        return Response({'id': row.id, 'status': row.status, 'detail': 'Your request has been sent.'}, status=status.HTTP_201_CREATED)


class DepartmentJoinRequestReviewView(APIView):
    """The desk's answer to a join request: approve, decline, and reply.

    The department's own leadership (leader or assistant, per
    ``can_manage_department``) and the office review here. Approving puts the
    member on the roll the same way the desk's own Add member does, and the
    reply — optional but encouraged — is what the member reads on their rail.
    """

    permission_classes = [IsAuthenticated]

    def _visible(self, user):
        managed = DepartmentAssignment.objects.filter(
            member=user, department__is_active=True,
        ).values_list('department__code', flat=True)
        codes = set(managed)
        # Only the installation administrator sees every department's join
        # requests. Department leaders see their own departments' requests
        # through their DepartmentAssignment rows. Elders, clerks and pastors
        # do not get the "see all" treatment here — a join request for the
        # Music department goes to Music's leaders, not to the eldership.
        #
        # The admin role counts beside Django staff: Administration's Join
        # Requests toggle is the admin's own way in, and an admin who is not
        # also ``is_staff`` would otherwise open the toggle to an empty queue
        # while every notice the request sent named them as the person to
        # answer it.
        profile = getattr(user, 'member_profile', None)
        if user.is_staff or getattr(user, 'is_superuser', False) or (profile and profile.has_role('admin')):
            codes.update(code for code in Department.objects.filter(is_active=True).values_list('code', flat=True))
        return DepartmentJoinRequest.objects.filter(department__in=codes).select_related('member', 'reviewed_by')

    def get(self, request):
        rows = self._visible(request.user)
        return Response({
            'requests': [
                {
                    'id': row.id,
                    'department': row.department,
                    'kind': row.kind,
                    'group_name': row.group_name,
                    'group_description': row.group_description,
                    'member_id': row.member_id,
                    'member_name': f"{row.member.first_name} {row.member.last_name}".strip() or row.member.get_username(),
                    'member_email': row.member.email or '',
                    'member_phone': (getattr(row.member, 'member_profile', None).phone_number if getattr(row.member, 'member_profile', None) else '') or '',
                    'note': row.note,
                    'status': row.status,
                    'reply': row.reply,
                    'created_at': row.created_at,
                }
                for row in rows
            ],
        })

    def patch(self, request, pk):
        row = DepartmentJoinRequest.objects.select_related('member').filter(pk=pk).first()
        if row is None:
            return Response({'detail': 'Unknown request.'}, status=status.HTTP_404_NOT_FOUND)
        # Same visibility rule as GET: only the department's own leaders and the
        # installation administrator may answer a join request. Elders, clerks
        # and pastors do not get blanket access here — a Music join request is
        # answered by Music's leaders, not by the eldership.
        visible = self._visible(request.user)
        if not visible.filter(pk=pk).exists():
            return Response({'detail': 'You cannot answer this request.'}, status=status.HTTP_403_FORBIDDEN)
        decision = str(request.data.get('status') or '')
        if decision not in ('approved', 'rejected'):
            return Response({'detail': 'Answer with approved or rejected.'}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            row.status = decision
            row.reply = str(request.data.get('reply') or '').strip()[:500]
            row.reviewed_by = request.user
            row.reviewed_at = timezone.now()
            row.save(update_fields=['status', 'reply', 'reviewed_by', 'reviewed_at'])
            if decision == 'approved' and row.kind == 'singing_group':
                # A proposal the desk accepts becomes a registered group — the
                # ask itself never wrote to the register. If the name was
                # registered in the meantime, the desk's approval still honours
                # the ask by seating the proposer in the group that bears it.
                group, _ = SingingGroup.objects.get_or_create(
                    name=row.group_name,
                    defaults={'description': row.group_description, 'created_by': request.user},
                )
                SingingGroupMember.objects.get_or_create(
                    group=group, member=row.member, defaults={'added_by': request.user},
                )
            elif decision == 'approved':
                DepartmentMembership.objects.get_or_create(
                    member=row.member, department=row.department,
                )
        approved = decision == 'approved'
        if row.kind == 'singing_group':
            title = f'Your singing group "{row.group_name}" was {"approved" if approved else "declined"}'
            message = row.reply or (
                f'"{row.group_name}" is registered under {row.department.replace("_", " ").title()} — and you are its first singer.'
                if approved
                else 'Thank you for offering to start the group. The desk could not take it on this time.'
            )
        else:
            title = f'Your request to join {row.department.replace("_", " ").title()} was {"approved" if approved else "declined"}'
            message = row.reply or (
                'Welcome aboard — you are now on the roll.' if approved
                else 'Thank you for offering to serve. The desk could not take you on this time.'
            )
        ChurchNotification.objects.create(
            user=row.member,
            title=title,
            message=message,
            link=f'{settings.FRONTEND_URL}/member',
        )
        return Response({'id': row.id, 'status': row.status, 'reply': row.reply})


def department_account(user, code):
    """The department's primary fund, for the desk that may read it — or None."""
    accounts = department_accounts(user, code)
    return accounts[0] if accounts else None


LCB_DEPARTMENT_ACCESS_CODES = {'amm', 'awm', 'eldership', 'clerkship', 'deaconate', 'education', 'personal_ministries', 'pastorate'}
#: The desks that read the Msamaria Mwema fund beside their own: the
#: deaconate serves its welfare work, and the elders answer for the fund.
MSAMARIA_DEPARTMENT_ACCESS_CODES = {'eldership', 'deaconate'}


def lcb_account():
    return TreasuryAccount.objects.filter(
        Q(name__iexact='LCB') | Q(description__icontains='Local Church Budget')
    ).order_by('id').first()


def msamaria_account():
    return TreasuryAccount.objects.filter(
        Q(name__icontains='Msamaria') | Q(description__icontains='Msamaria')
    ).order_by('id').first()


def evangelism_account():
    return TreasuryAccount.objects.filter(
        Q(name__icontains='Evangelism') | Q(description__icontains='Evangelism')
    ).order_by('id').first()


def department_accounts(user, code):
    """The treasury accounts accessible for this department desk:
    - Specific account mappings:
        - development: Church Plot and Church Development accounts
        - clerkship: LCB (Local Church Budget), Msamaria Mwema and Evangelism
        - dorcas: Nyakundis / Dorcas account
        - education: LCB (Local Church Budget) — the ministry's work is the
          church's own budget line, not an offering of its own
        - personal_ministries: Evangelism
        - children, youth, pathfinders: Department fund + Camporee / Campout accounts
        - Other departments: Their linked treasury account
    - The camp funds are kept off the Ambassadors and AYM desks: neither
      ministry raises a camp offering, so each reads its own fund alone.
    - LCB is included only for AWM, Eldership, Clerkship, Deaconate and
      Education, so an Education desk reads the church budget, raises its
      funding asks against it and can never reach another ministry's fund.
    - Msamaria Mwema is included only for Eldership and Deaconate.
    - The clerk keeps the church's own books, so the Clerkship desk reads the
      church budget with the welfare and outreach funds beside it — LCB,
      Msamaria Mwema and Evangelism.
    - Eldership reads its own fund (the Elders Kitty) with LCB and Msamaria
      beside it — never the whole treasury.
    - The Treasury desk itself reads every account: it keeps the whole
      treasury, not one fund of it.
    - Regular roll members see the department's primary fund(s).
    """
    can_manage = can_manage_department(user, code) or is_treasurer_or_admin(user)
    on_roll = DepartmentMembership.objects.filter(member=user, department=code).exists()
    if not can_manage and not on_roll:
        return []

    dept_account = TreasuryAccount.objects.filter(
        department__code=code, department__is_active=True,
    ).order_by('id').first()

    accounts = []
    if dept_account:
        accounts.append(dept_account)

    # Check for custom treasurer assignments in ChurchSettings
    try:
        from .models import ChurchSettings
        settings_row = ChurchSettings.objects.filter(pk=1).first()
        cfg = getattr(settings_row, 'department_accounts_config', None) or {}
        assigned_ids = cfg.get(code)
        if isinstance(assigned_ids, list):
            assigned_accounts = list(TreasuryAccount.objects.filter(id__in=assigned_ids).order_by('id'))
            for acc in assigned_accounts:
                if acc not in accounts:
                    accounts.append(acc)
    except Exception:
        pass

    # 1. Development: Church Plot and Church Development accounts (excluding station development)
    if code in ('development', 'church_development', 'building'):
        dev_accounts = TreasuryAccount.objects.filter(
            Q(name__icontains='plot') | Q(description__icontains='plot') |
            Q(name__icontains='dev') | Q(description__icontains='development') |
            Q(name__icontains='build') | Q(description__icontains='building')
        ).exclude(
            Q(name__icontains='station') | Q(description__icontains='station')
        ).order_by('id')
        for acc in dev_accounts:
            if acc not in accounts:
                accounts.append(acc)
        accounts = [
            a for a in accounts
            if 'station' not in (a.name or '').lower() and 'station' not in (a.description or '').lower()
        ]

    # 2. Clerkship: the clerk keeps the church's books, so the desk reads the
    #    church budget and the two funds the church's welfare and outreach sit
    #    in beside it: LCB, Msamaria Mwema and Evangelism.
    if code == 'clerkship':
        for account in (lcb_account(), msamaria_account(), evangelism_account()):
            if account and account not in accounts:
                accounts.append(account)

    # 3. Dorcas: Nyakundi / Dorcas account
    if code in ('dorcas', 'dorcas_ministry'):
        nyakundi_accounts = TreasuryAccount.objects.filter(
            Q(name__icontains='nyakundi') | Q(description__icontains='nyakundi') |
            Q(name__icontains='dorcas') | Q(description__icontains='dorcas')
        ).order_by('id')
        for acc in nyakundi_accounts:
            if acc not in accounts:
                accounts.append(acc)

    # 4. Personal Ministries: Evangelism
    if code == 'personal_ministries':
        evang_accounts = TreasuryAccount.objects.filter(
            Q(name__icontains='evangelism') | Q(description__icontains='evangelism') |
            Q(name__icontains='personal') | Q(description__icontains='personal')
        ).order_by('id')
        for acc in evang_accounts:
            if acc not in accounts:
                accounts.append(acc)

    # 5. Children, Youth and Pathfinders: department fund + camporee & camp
    #    out accounts. Ambassadors and AYM sit outside this: they raise no
    #    camp offering, so their desks read only their own fund.
    if code in ('children', 'youth', 'pathfinders'):
        camp_accounts = TreasuryAccount.objects.filter(
            Q(name__icontains='camp') | Q(description__icontains='camp') |
            Q(name__icontains='camporee') | Q(description__icontains='camporee') |
            Q(name__icontains='campout') | Q(description__icontains='campout')
        ).order_by('id')
        for acc in camp_accounts:
            if acc not in accounts:
                accounts.append(acc)

    if can_manage and code in LCB_DEPARTMENT_ACCESS_CODES:
        lcb = lcb_account()
        if lcb and lcb not in accounts:
            accounts.append(lcb)

    # 7. Deaconate and Eldership: the Msamaria Mwema fund, whose welfare
    #    work the deaconate serves and the elders answer for.
    if can_manage and code in MSAMARIA_DEPARTMENT_ACCESS_CODES:
        msamaria = msamaria_account()
        if msamaria and msamaria not in accounts:
            accounts.append(msamaria)

    # 8. Treasury: the treasurer's own ministry keeps the whole treasury,
    #    so its desk reads every account the church holds.
    if can_manage and code == 'treasury':
        for acc in TreasuryAccount.objects.all().order_by('id'):
            if acc not in accounts:
                accounts.append(acc)

    return accounts


class DepartmentAccountView(APIView):
    """A department's own fund: what it holds, and what built it.

    GET answers the balance, the movements on the fund (the ledger lines the
    treasury already writes — contributions credited, withdrawals debited)
    and the withdrawal asks the desk has raised. The desk raises a withdrawal
    with POST — anyone the fund is open to, its leadership and the roll that
    reads it alike — and the treasurer answers at
    DepartmentWithdrawalReviewView.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, department):
        target = Department.objects.filter(code=department, is_active=True).first()
        if target is None:
            return Response({'detail': 'Unknown department.'}, status=status.HTTP_404_NOT_FOUND)
        accounts = department_accounts(request.user, department)
        if not accounts:
            return Response({
                'account': None,
                'accounts': [],
                'can_request_withdrawal': False,
                'can_start_fund_drive': False,
                'movements': [],
                'withdrawals': [],
            })

        account_id_param = request.query_params.get('account_id')
        if account_id_param and account_id_param != 'all':
            active_accounts = [a for a in accounts if str(a.id) == str(account_id_param)]
            if not active_accounts:
                active_accounts = accounts
        else:
            active_accounts = accounts

        primary_account = accounts[0]

        raw_movements = list(
            TreasuryAccountTransaction.objects.filter(
                account__in=active_accounts
            ).select_related('account').order_by('-created_at')[:150]
        )
        enrich_transaction_descriptions(raw_movements)

        movements = [
            {
                'id': movement.id,
                'account_id': movement.account_id,
                'account_name': movement.account.name,
                'account_description': movement.account.description or movement.account.name,
                'transaction_type': movement.transaction_type,
                'transaction_type_display': movement.get_transaction_type_display(),
                'amount': str(movement.amount),
                'description': movement.description,
                'reference': movement.reference,
                'created_at': movement.created_at,
            }
            for movement in raw_movements
        ]

        withdrawals = [
            {
                'id': row.id,
                'account_id': row.account_id,
                'account_name': row.account.name,
                'account_description': row.account.description or row.account.name,
                'amount': str(row.amount),
                'reason': row.reason,
                'status': row.status,
                'reply': row.reply,
                'requested_by': giver_display_name('', member=row.requested_by),
                'created_at': row.created_at,
                'decided_at': row.decided_at,
            }
            for row in DepartmentWithdrawalRequest.objects.filter(
                department=target,
                account__in=active_accounts,
            ).select_related('requested_by', 'decided_by', 'account').order_by('-created_at')[:50]
        ]

        is_deaconate = target.code == 'deaconate'
        return Response({
            'account': TreasuryAccountSerializer(primary_account).data,
            'accounts': [
                {
                    **TreasuryAccountSerializer(acc).data,
                    'is_primary': (acc.department_id == target.id if target else False),
                    'is_lcb': (acc.name.upper() == 'LCB' or 'LOCAL CHURCH BUDGET' in (acc.description or '').upper()),
                }
                for acc in accounts
            ],
            # The button follows the fund, not the office: a desk that can read
            # an account can ask for money out of it (see
            # ``department_accounts``). The treasurer still answers every ask,
            # so nothing moves on the asker's word.
            'can_request_withdrawal': bool(accounts),
            # A fund drive is the desk's own campaign to raise money, not an
            # ask of the fund: that one stays with the desk's leadership.
            'can_start_fund_drive': (
                can_manage_department(request.user, department)
                or is_treasurer_or_admin(request.user)
            ),
            'is_deaconate': is_deaconate,
            'movements': movements,
            'withdrawals': withdrawals,
        })

    def post(self, request, department):
        """The desk asks the treasurer to pay something out of the fund.

        The ask runs on the same door as the read: whoever the fund is open to
        — its leadership, and the roll the desk reads for — may ask from it, so
        the button and the ask it opens never disagree. The treasurer still
        answers every request, and only their word debits the fund.
        """
        target = Department.objects.filter(code=department, is_active=True).first()
        if target is None:
            return Response({'detail': 'Unknown department.'}, status=status.HTTP_404_NOT_FOUND)
        accounts = department_accounts(request.user, department)
        if not accounts:
            if not can_manage_department(request.user, department) and not is_treasurer_or_admin(request.user):
                return Response(
                    {'detail': "Only this department's desk can request a withdrawal or funding."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            return Response({'detail': 'This department has no account to withdraw from yet.'}, status=status.HTTP_400_BAD_REQUEST)

        account_id = request.data.get('account_id')
        if account_id:
            account = next((a for a in accounts if str(a.id) == str(account_id)), None)
            if account is None:
                return Response({'detail': 'Invalid or inaccessible treasury account selected.'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            account = accounts[0]

        try:
            amount = Decimal(str(request.data.get('amount')))
            if amount <= 0:
                raise ValueError()
        except (ValueError, TypeError):
            return Response({'detail': 'Say how much the request is for.'}, status=status.HTTP_400_BAD_REQUEST)
        if amount > account.balance:
            return Response(
                {'detail': f'The requested amount (KES {amount:,.2f}) exceeds the available balance in {account.description or account.name} (KES {account.balance:,.2f}).'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        reason = str(request.data.get('reason') or '').strip()
        if not reason:
            return Response({'reason': 'Tell the treasurer what the money is for.'}, status=status.HTTP_400_BAD_REQUEST)

        row = DepartmentWithdrawalRequest.objects.create(
            department=target, account=account, amount=amount,
            reason=reason[:255], requested_by=request.user,
        )

        is_deaconate = target.code == 'deaconate'
        # The ask lands with the treasury (which reads it first), the pastor's
        # office, the clerk and administration — the first pen in the chain is
        # the treasurer's, so the treasury has to hear about it.
        audience = User.objects.filter(
            Q(member_profile__role__in=['pastor', 'admin', 'clerk', 'treasurer']) |
            Q(member_profile__roles__contains='pastor') |
            Q(member_profile__roles__contains='admin') |
            Q(member_profile__roles__contains='clerk') |
            Q(member_profile__roles__contains='treasurer'),
            is_active=True,
        ).distinct()
        desk_link = f'{settings.FRONTEND_URL}/my-areas?area=pastorate&view=treasury-approvals'
        subject = f'Funding request from {target.name}' if is_deaconate else f'Withdrawal request from {target.name}'
        account_name = account.description or account.name
        requester_name = giver_display_name('', member=request.user)
        body = (
            f"{requester_name} asks for KES {amount:,.2f} "
            f"from the {account_name} account — {reason}. "
            f"Awaiting pastor approval: {desk_link}"
        )
        sms_text = (
            f"SDA Loma Linda: KES {amount:,.2f} withdrawal requested by {requester_name} "
            f"for {target.name} ({account_name}) — {reason}. Review & approve: {desk_link}"
        )
        _notify_withdrawal_audience(audience, subject, body, desk_link, sms_text)
        detail_msg = 'Your funding request has been sent to the treasurer.' if is_deaconate else 'Your withdrawal request has been sent to the treasurer.'
        return Response({'id': row.id, 'status': row.status, 'detail': detail_msg}, status=status.HTTP_201_CREATED)


def _notify_withdrawal_audience(audience, subject, body, link, sms_text=None):
    """Notify officers across in-app, email, SMS, and push notification channels."""
    ChurchNotification.objects.bulk_create([
        ChurchNotification(user=person, title=subject, message=body, link=link)
        for person in audience
    ])
    emails = [u.email for u in audience if u.email]
    if emails:
        try:
            send_mail(
                subject, body, settings.DEFAULT_FROM_EMAIL,
                emails, fail_silently=True,
            )
        except Exception:
            logger.exception("Withdrawal notice email failed.")
    text = sms_text or body
    for person in audience:
        phone = getattr(getattr(person, 'member_profile', None), 'phone_number', '')
        if phone:
            try:
                sms.send(phone, text)
            except Exception:
                logger.exception("Withdrawal notice SMS failed for %s.", phone)
    try:
        from .push import push_to_user
        for person in audience:
            push_to_user(person, title=subject, body=text, link=link)
    except Exception:
        pass


def _withdrawal_review_row(row):
    """One withdrawal request as the review queue shows it — and as its
    printed report shows it, so the screen and the paper cannot drift apart."""
    return {
        'id': row.id,
        'department': row.department.name,
        'department_code': row.department.code,
        'account_name': row.account.description or row.account.name,
        'account_balance': str(row.account.balance),
        'amount': str(row.amount),
        'reason': row.reason,
        'status': row.status,
        'requested_by': giver_display_name('', member=row.requested_by),
        # The three clearances in the order they are given: the treasurer's
        # first read, the elder's blessing, then the pastor's approval.
        'treasurer_approved_by': giver_display_name('', member=row.treasurer_approved_by) if row.treasurer_approved_by else None,
        'treasurer_approved_at': row.treasurer_approved_at,
        'pastor_approved_by': giver_display_name('', member=row.pastor_approved_by) if row.pastor_approved_by else None,
        'pastor_approved_at': row.pastor_approved_at,
        'elder_approved_by': giver_display_name('', member=row.elder_approved_by) if row.elder_approved_by else None,
        'elder_approved_at': row.elder_approved_at,
        'decided_by': giver_display_name('', member=row.decided_by) if row.decided_by else None,
        'decided_at': row.decided_at,
        'reply': row.reply,
        'created_at': row.created_at,
    }


class DepartmentWithdrawalReviewView(APIView):
    """The four clearances a department's withdrawal ask passes through.

    GET  — returns every request across every department, with enough detail
           for each gate: the treasurer's screen, the elder's blessing, the
           pastor's approval and the treasurer's release. Reversed rows
           are kept in the list: the treasurer answers them again by
           approving the request afresh.
    POST — handles five actions via the ``action`` field:
           • ``pastor_approve`` (pastor or admin only) — blesses the pending ask
             so an elder can then act on it.
           • ``elder_approve`` (elder or admin only) — requires the request to be
             ``pastor_approved``; blesses the request so the treasurer can then act on it.
           • ``approve`` (treasurer or admin only, and never an officer who gave
             prior clearance) — requires the request to be ``elder_approved``
             (or ``reversed``, releasing it a second time); debits the fund, never below zero.
           • ``decline`` (pastor, elder, or treasurer) — declines with a reply.
           • ``reverse`` (treasurer or admin only) — credits the fund back
             and marks the request ``reversed``.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_treasurer_or_admin(request.user) and not is_elder_or_admin(request.user) and not is_pastor_or_admin(request.user):
            return Response({'detail': 'Only pastors, elders, or treasurers can review withdrawal requests.'}, status=status.HTTP_403_FORBIDDEN)
        rows = DepartmentWithdrawalRequest.objects.select_related(
            'department', 'account', 'requested_by', 'treasurer_approved_by', 'pastor_approved_by', 'elder_approved_by', 'decided_by',
        ).order_by('-created_at')
        data = []
        for row in rows:
            item = _withdrawal_review_row(row)
            # Per-viewer, so the queue can tell the truth about the release:
            # whoever cleared this one as the elder or pastor may not also be the
            # treasurer who pays it, and the desk says so before the button
            # is pressed rather than answering with a refusal.
            item['you_pastor_approved'] = row.pastor_approved_by_id == request.user.id
            item['you_elder_approved'] = row.elder_approved_by_id == request.user.id
            item['you_treasurer_approved'] = row.treasurer_approved_by_id == request.user.id
            data.append(item)
        return Response({'requests': data})

    def post(self, request):
        action = str(request.data.get('action') or '').strip()
        row_id = request.data.get('id')

        if action == 'pastor_approve':
            if not is_treasurer_or_admin(request.user) and not is_pastor_or_admin(request.user):
                return Response({'detail': 'Only pastors, elders, or treasurers can give initial approval.'}, status=status.HTTP_403_FORBIDDEN)
            row = DepartmentWithdrawalRequest.objects.select_related('department', 'account', 'requested_by').filter(
                pk=row_id, status='pending',
            ).first()
            if row is None:
                return Response({'detail': 'That request is not pending initial approval or does not exist.'}, status=status.HTTP_404_NOT_FOUND)
            row.status = 'treasurer_approved'
            row.treasurer_approved_by = request.user
            row.treasurer_approved_at = timezone.now()
            row.save(update_fields=['status', 'treasurer_approved_by', 'treasurer_approved_at'])
            # Notify elders so they can review and approve
            audience = User.objects.filter(
                Q(member_profile__role='elder') | Q(member_profile__roles__contains='elder') |
                Q(member_profile__role='admin') | Q(member_profile__roles__contains='admin'),
                is_active=True,
            ).distinct()
            desk_link = f'{settings.FRONTEND_URL}/administration?view=accounts&withdrawals=1'
            title = f'{row.department.name} withdrawal cleared for elder approval'
            pastor_name = giver_display_name('', member=request.user)
            account_name = row.account.description or row.account.name
            msg = (
                f"{pastor_name} has cleared the "
                f"KES {row.amount:,.2f} withdrawal request from {row.department.name} "
                f"({account_name}) — it is ready for elder approval: {desk_link}"
            )
            sms_text = (
                f"SDA Loma Linda: KES {row.amount:,.2f} withdrawal for {row.department.name} "
                f"cleared by Treasurer {pastor_name}. Waiting for elder approval: {desk_link}"
            )
            _notify_withdrawal_audience(audience, title, msg, desk_link, sms_text)
            return Response({'id': row.id, 'status': row.status})

        if action == 'elder_approve':
            if not is_elder_or_admin(request.user):
                return Response({'detail': 'Only elders or administrators can give elder approval.'}, status=status.HTTP_403_FORBIDDEN)
            row = DepartmentWithdrawalRequest.objects.select_related('department', 'account', 'requested_by').filter(
                pk=row_id,
            ).first()
            if row is None:
                return Response({'detail': 'That request does not exist.'}, status=status.HTTP_404_NOT_FOUND)
            if row.status == 'pending':
                return Response({'detail': 'A funds withdrawal request must be approved by the Treasurer before an elder can approve.'}, status=status.HTTP_400_BAD_REQUEST)
            if row.status != 'treasurer_approved':
                return Response({'detail': 'That request is not waiting for treasurer approval.'}, status=status.HTTP_400_BAD_REQUEST)
            if row.treasurer_approved_by_id == request.user.id and not (request.user.is_superuser or request.user.is_staff):
                return Response(
                    {'detail': 'You gave this request its treasurer approval — a different elder must approve it.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            row.status = 'elder_approved'
            row.elder_approved_by = request.user
            row.elder_approved_at = timezone.now()
            row.save(update_fields=['status', 'elder_approved_by', 'elder_approved_at'])
            # Notify the pastor so they can give final approval
            audience = User.objects.filter(
                Q(member_profile__role='pastor') | Q(member_profile__roles__contains='pastor') |
                Q(member_profile__role='admin') | Q(member_profile__roles__contains='admin'),
                is_active=True,
            ).distinct()
            desk_link = f'{settings.FRONTEND_URL}/administration?view=accounts&withdrawals=1'
            title = f'{row.department.name} withdrawal cleared by elder'
            elder_name = giver_display_name('', member=request.user)
            account_name = row.account.description or row.account.name
            msg = (
                f"{elder_name} has cleared the "
                f"KES {row.amount:,.2f} withdrawal request from {row.department.name} "
                f"({account_name}) — it is ready for pastor approval: {desk_link}"
            )
            sms_text = (
                f"SDA Loma Linda: KES {row.amount:,.2f} withdrawal for {row.department.name} "
                f"cleared by Elder {elder_name}. Waiting for pastor approval: {desk_link}"
            )
            _notify_withdrawal_audience(audience, title, msg, desk_link, sms_text)
            return Response({'id': row.id, 'status': row.status})

        # The last clearance before the money moves: the treasurer screened it,
        # the elder blessed it, and the pastor's approval is what makes it
        # releasable — the chain the model's STATUS_CHOICES lists in order.
        if action == 'pastor_final_approve':
            if not is_pastor_or_admin(request.user):
                return Response({'detail': 'Only the church pastor or an administrator can give the final approval.'}, status=status.HTTP_403_FORBIDDEN)
            row = DepartmentWithdrawalRequest.objects.select_related('department', 'account', 'requested_by').filter(
                pk=row_id,
            ).first()
            if row is None:
                return Response({'detail': 'That request does not exist.'}, status=status.HTTP_404_NOT_FOUND)
            if row.status == 'pending':
                return Response({'detail': 'A funds withdrawal request must be cleared by the treasurer and the elder before the pastor can approve it.'}, status=status.HTTP_400_BAD_REQUEST)
            if row.status != 'elder_approved':
                return Response({'detail': 'That request is not waiting for pastoral approval.'}, status=status.HTTP_400_BAD_REQUEST)
            row.status = 'pastor_approved'
            row.pastor_approved_by = request.user
            row.pastor_approved_at = timezone.now()
            row.save(update_fields=['status', 'pastor_approved_by', 'pastor_approved_at'])
            # Tell the treasury: every clearance is on the ask, so the money can go.
            audience = User.objects.filter(
                Q(member_profile__role='treasurer') | Q(member_profile__roles__contains='treasurer') |
                Q(member_profile__role='admin') | Q(member_profile__roles__contains='admin'),
                is_active=True,
            ).distinct()
            desk_link = f'{settings.FRONTEND_URL}/administration?view=accounts&withdrawals=1'
            title = f'{row.department.name} withdrawal approved by pastor'
            pastor_name = giver_display_name('', member=request.user)
            account_name = row.account.description or row.account.name
            msg = (
                f"{pastor_name} has given final approval for the "
                f"KES {row.amount:,.2f} withdrawal request from {row.department.name} "
                f"({account_name}) — the treasury can release it now: {desk_link}"
            )
            sms_text = (
                f"SDA Loma Linda: KES {row.amount:,.2f} withdrawal for {row.department.name} "
                f"approved by Pastor {pastor_name}. Ready for release: {desk_link}"
            )
            _notify_withdrawal_audience(audience, title, msg, desk_link, sms_text)
            return Response({'id': row.id, 'status': row.status})

        if action == 'approve':
            if not is_treasurer_or_admin(request.user):
                return Response({'detail': 'Only church treasurers or administrators can approve withdrawals.'}, status=status.HTTP_403_FORBIDDEN)
            # A reversed request may be approved again: the reversal credited
            # the fund back, so releasing it a second time is a fresh debit —
            # still gated by the balance check below, so the fund can never
            # go below zero however many times a request swings.
            row = DepartmentWithdrawalRequest.objects.select_related('department', 'account', 'requested_by').filter(
                pk=row_id, status__in=['pastor_approved', 'reversed'],
            ).first()
            if row is None:
                return Response({'detail': 'That request is not waiting on approval, or does not exist.'}, status=status.HTTP_404_NOT_FOUND)
            # Separation of duties: whoever cleared this ask as pastor or elder
            # cannot also release it as the treasurer.
            if (row.elder_approved_by_id == request.user.id or row.treasurer_approved_by_id == request.user.id or row.pastor_approved_by_id == request.user.id) and not (request.user.is_superuser or request.user.is_staff):
                return Response(
                    {'detail': 'You gave this request prior clearance — a different treasurer must release the money.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if row.amount > row.account.balance:
                return Response({'detail': f'The {row.account.description or row.account.name} account holds KES {row.account.balance:,.2f} — less than the KES {row.amount:,.2f} asked for.'}, status=status.HTTP_400_BAD_REQUEST)
            reply = str(request.data.get('reply') or '').strip()[:255]
            with transaction.atomic():
                row.account.balance -= row.amount
                row.account.save()
                TreasuryAccountTransaction.objects.create(
                    account=row.account,
                    transaction_type='debit',
                    amount=row.amount,
                    description=f"Withdrawal for {row.department.name}: {row.reason}"[:255],
                    reference=f'WD-{row.id}',
                    created_by=request.user,
                )
                # Reflect approved withdrawal as an expenditure record in the treasurer's expenses table
                Expenditure.objects.create(
                    title=f"{row.department.name} withdrawal: {row.reason}"[:200],
                    amount=row.amount,
                    category='operations',
                    account=row.account,
                    payment_method='mpesa',
                    vendor_payee=giver_display_name('', member=row.requested_by),
                    receipt_number=f"WD-{row.id}",
                    expenditure_date=timezone.localdate(),
                    notes=(reply or "").strip(),
                    recorded_by=request.user,
                )
                row.status = 'approved'
                row.decided_by = request.user
                row.decided_at = timezone.now()
                row.reply = reply
                row.save(update_fields=['status', 'decided_by', 'decided_at', 'reply'])
            self._notify_department(row, approved=True)
            return Response({'id': row.id, 'status': row.status, 'reply': row.reply})

        if action == 'decline':
            if not is_treasurer_or_admin(request.user) and not is_elder_or_admin(request.user) and not is_pastor_or_admin(request.user):
                return Response({'detail': 'Only pastors, elders, or treasurers can decline withdrawal requests.'}, status=status.HTTP_403_FORBIDDEN)
            row = DepartmentWithdrawalRequest.objects.select_related('department', 'account', 'requested_by').filter(
                pk=row_id, status__in=['pending', 'treasurer_approved', 'elder_approved', 'pastor_approved'],
            ).first()
            if row is None:
                return Response({'detail': 'That request cannot be declined at this point.'}, status=status.HTTP_404_NOT_FOUND)
            reply = str(request.data.get('reply') or '').strip()[:255]
            row.status = 'declined'
            row.decided_by = request.user
            row.decided_at = timezone.now()
            row.reply = reply or 'The request could not be approved.'
            row.save(update_fields=['status', 'decided_by', 'decided_at', 'reply'])
            self._notify_department(row, approved=False)
            return Response({'id': row.id, 'status': row.status, 'reply': row.reply})

        if action == 'reverse':
            if not is_treasurer_or_admin(request.user):
                return Response({'detail': 'Only church treasurers or administrators can reverse withdrawals.'}, status=status.HTTP_403_FORBIDDEN)
            row = DepartmentWithdrawalRequest.objects.select_related('department', 'account', 'requested_by').filter(
                pk=row_id, status='approved',
            ).first()
            if row is None:
                return Response({'detail': 'That request is not approved, or does not exist.'}, status=status.HTTP_404_NOT_FOUND)
            with transaction.atomic():
                row.account.balance += row.amount
                row.account.save()
                TreasuryAccountTransaction.objects.create(
                    account=row.account,
                    transaction_type='credit',
                    amount=row.amount,
                    description=f"Reversal of withdrawal for {row.department.name}: {row.reason}"[:255],
                    reference=f'WD-REV-{row.id}',
                    created_by=request.user,
                )
                # Remove corresponding expenditure record upon reversal
                Expenditure.objects.filter(receipt_number=f"WD-{row.id}").delete()
                row.status = 'reversed'
                row.save(update_fields=['status'])
            # Notify the department.
            audience_ids = {row.requested_by_id}
            audience_ids.update(DepartmentAssignment.objects.filter(
                department=row.department, member__is_active=True,
            ).values_list('member_id', flat=True))
            audience = User.objects.filter(id__in=audience_ids, is_active=True).exclude(pk=request.user.id)
            desk_link = f'{settings.FRONTEND_URL}/administration?tab=leaders&dept={row.department.code}'
            title = f'{row.department.name} withdrawal reversed'
            msg = f'The KES {row.amount:,.2f} withdrawal from {row.account.description or row.account.name} has been reversed by the treasurer.'
            ChurchNotification.objects.bulk_create([ChurchNotification(user=p, title=title, message=msg, link=desk_link) for p in audience])
            try:
                send_mail(title, msg, settings.DEFAULT_FROM_EMAIL, [u.email for u in audience if u.email], fail_silently=True)
            except Exception:
                pass
            return Response({'id': row.id, 'status': row.status})

        return Response({'detail': 'Unknown action. Use pastor_approve, elder_approve, approve, decline, or reverse.'}, status=status.HTTP_400_BAD_REQUEST)

    def _notify_department(self, row, approved: bool):
        audience_ids = {row.requested_by_id}
        audience_ids.update(DepartmentAssignment.objects.filter(
            department=row.department, member__is_active=True,
        ).values_list('member_id', flat=True))
        audience = User.objects.filter(id__in=audience_ids, is_active=True)
        verb = 'approved' if approved else 'declined'
        title = f'{row.department.name} withdrawal {verb}'
        message = row.reply or (
            f'KES {row.amount:,.2f} has been released from the '
            f'{row.account.description or row.account.name} account.'
            if approved else
            'The request could not be approved.'
        )
        desk_link = f'{settings.FRONTEND_URL}/administration?tab=leaders&dept={row.department.code}'
        ChurchNotification.objects.bulk_create([
            ChurchNotification(user=person, title=title, message=message, link=desk_link)
            for person in audience
        ])
        try:
            send_mail(title, message, settings.DEFAULT_FROM_EMAIL, [u.email for u in audience if u.email], fail_silently=True)
        except Exception:
            pass


class WithdrawalRequestsPdfView(APIView):
    """The treasury desk's withdrawal-requests report, printed from the server.

    The Print button used to hand the browser's own print dialog whatever
    the live table happened to show — a screenshot of the screen with no way
    to sign it. This endpoint prints the same rows, under the same filters
    and the same permissions as the review queue, as a real PDF that ends in
    three signature slots: the authorizing officer, the one issuing, and the
    receiver.
    """

    permission_classes = [IsAuthenticated]

    # The panel's status filter, mapped to the rows each choice shows — the
    # same mapping the on-screen table applies.
    STATUS_FILTERS = {
        'pending': ('pending', 'pastor_approved', 'elder_approved'),
        'approved': ('approved',),
        'rejected': ('declined',),
    }
    STATUS_LABELS = {'pending': 'Pending', 'approved': 'Approved', 'rejected': 'Rejected'}

    def get(self, request):
        if not is_treasurer_or_admin(request.user) and not is_elder_or_admin(request.user) and not is_pastor_or_admin(request.user):
            return Response({'detail': 'Only pastors, elders, or treasurers can print withdrawal requests.'}, status=status.HTTP_403_FORBIDDEN)

        status_param = (request.query_params.get('status') or 'all').strip()
        search = (request.query_params.get('search') or '').strip().lower()
        wanted = self.STATUS_FILTERS.get(status_param)

        # The desk's date window, read the way the screen's own inputs send it
        # (YYYY-MM-DD), so the printed report shows the same rows the filtered
        # queue shows — the day each request was asked.
        def _read_window_date(value):
            value = (value or '').strip()
            try:
                return datetime.strptime(value, '%Y-%m-%d').date() if value else None
            except ValueError:
                return None

        wanted_from = _read_window_date(request.query_params.get('from_date'))
        wanted_to = _read_window_date(request.query_params.get('to_date'))
        if wanted_from and wanted_to and wanted_from > wanted_to:
            wanted_from, wanted_to = wanted_to, wanted_from

        rows = DepartmentWithdrawalRequest.objects.select_related(
            'department', 'account', 'requested_by', 'treasurer_approved_by', 'pastor_approved_by', 'elder_approved_by', 'decided_by',
        ).order_by('-created_at')

        data = []
        for row in rows:
            if wanted and row.status not in wanted:
                continue
            asked_on = timezone.localdate(row.created_at)
            if wanted_from and asked_on < wanted_from:
                continue
            if wanted_to and asked_on > wanted_to:
                continue
            item = _withdrawal_review_row(row)
            if search and not self._matches(item, search):
                continue
            data.append(item)

        church_name = current_church_name()

        from .pdf_generator import generate_withdrawal_requests_pdf
        # The heading names the window when one stands, so a filtered report
        # does not print as if it were the whole history.
        window_suffix = (
            f' {wanted_from.isoformat()} to {wanted_to.isoformat()}'
            if wanted_from and wanted_to
            else f' from {wanted_from.isoformat()}'
            if wanted_from
            else f' to {wanted_to.isoformat()}'
            if wanted_to
            else ''
        )
        pdf_bytes = generate_withdrawal_requests_pdf(
            church_name,
            data,
            status_label=f"{self.STATUS_LABELS.get(status_param, 'All requests')}{window_suffix}",
            search=request.query_params.get('search', '').strip(),
            # This is the desk's wide report; a signed sheet belongs to one
            # request, printed from that request's own row.
            signatures=False,
        )

        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        filename = f'Withdrawal_Requests_{timezone.localdate().strftime("%Y%m%d")}.pdf'
        response['Content-Disposition'] = f'inline; filename="{filename}"'
        return response

    @staticmethod
    def _matches(item, needle):
        """The panel's search, field for field: department, account, purpose,
        the parties, the reply — and the amount as it prints."""
        haystack = ' '.join(str(part or '') for part in (
            item['department'], item['account_name'], item['reason'],
            item['requested_by'], item.get('pastor_approved_by'), item['elder_approved_by'], item['decided_by'],
            item['reply'], item['amount'],
        ))
        return needle in haystack.lower()


class WithdrawalRequestPdfView(APIView):
    """One withdrawal request, printed from the treasury queue as a form.

    Where the desk's foot button prints the whole filtered list, each row's
    own Print button prints that one request — laid out on its own sheet with
    the amount spelled out and the three signature slots (authorizing officer,
    treasury office, department representative) at the foot, so the
    department's representative can sign for the money when it is handed over.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        if not is_treasurer_or_admin(request.user) and not is_elder_or_admin(request.user) and not is_pastor_or_admin(request.user):
            return Response({'detail': 'Only pastors, elders, or treasurers can print withdrawal requests.'}, status=status.HTTP_403_FORBIDDEN)

        row = DepartmentWithdrawalRequest.objects.select_related(
            'department', 'account', 'requested_by', 'treasurer_approved_by', 'pastor_approved_by', 'elder_approved_by', 'decided_by',
        ).filter(pk=pk).first()
        if row is None:
            return Response({'detail': 'That withdrawal request does not exist.'}, status=status.HTTP_404_NOT_FOUND)

        church_name = current_church_name()

        from .pdf_generator import generate_withdrawal_request_pdf
        pdf_bytes = generate_withdrawal_request_pdf(
            church_name, _withdrawal_review_row(row), signatures=report_signatures(),
        )

        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        filename = f'Withdrawal_Request_{row.id}.pdf'
        response['Content-Disposition'] = f'inline; filename="{filename}"'
        return response


def _letter_desk_link(department):
    """Where the next pen finds a department's letters.

    A letter waits on its own department's Requests view — the page that now
    carries the desk's letters and its fund asks together. The Pastorate is
    the one desk whose Requests chip is gone: its three pages are named
    directly, and a letter written by that desk waits on Letter Approvals.
    """
    view = 'letter-approvals' if department.code == 'pastorate' else 'accounts'
    return f'{settings.FRONTEND_URL}/my-areas?area={department.code}&view={view}'


class DepartmentLetterListCreateView(APIView):
    """List or create official department letters.

    A department member/leader writes a letter -> status becomes 'pending_pastor'.
    Pastor signs -> status becomes 'pastor_signed'.
    Clerk signs -> status becomes 'completed' (fully signed and ready to download for stamping).
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        dept_code = (request.query_params.get('department') or '').strip().lower()
        status_filter = (request.query_params.get('status') or '').strip()
        user = request.user
        is_pastor = is_pastor_or_admin(user)
        is_clerk = is_clerk_or_admin(user)
        is_elder = is_elder_or_admin(user)

        qs = DepartmentLetterRequest.objects.select_related(
            'department', 'requested_by', 'pastor_signed_by', 'clerk_signed_by', 'declined_by'
        ).order_by('-created_at')

        if dept_code:
            qs = qs.filter(department__code=dept_code)
        elif not (is_pastor or is_clerk or is_elder):
            user_depts = DepartmentMembership.objects.filter(member=user).values_list('department_id', flat=True)
            qs = qs.filter(Q(requested_by=user) | Q(department_id__in=user_depts))

        if status_filter:
            qs = qs.filter(status=status_filter)

        serializer = DepartmentLetterRequestSerializer(qs, many=True)
        return Response(serializer.data)

    def post(self, request):
        dept_code = (request.data.get('department') or '').strip()
        title = str(request.data.get('title') or '').strip()
        content = str(request.data.get('content') or '').strip()

        if not dept_code:
            return Response({'detail': 'Specify the department for this letter.'}, status=status.HTTP_400_BAD_REQUEST)
        if not title:
            return Response({'title': 'Provide a letter title or subject.'}, status=status.HTTP_400_BAD_REQUEST)
        if not content:
            return Response({'content': 'Provide the letter content or body.'}, status=status.HTTP_400_BAD_REQUEST)

        dept = Department.objects.filter(code=dept_code).first()
        if not dept:
            dept = Department.objects.filter(pk=dept_code).first() if str(dept_code).isdigit() else None
        if not dept:
            return Response({'detail': f'Department "{dept_code}" not found.'}, status=status.HTTP_404_NOT_FOUND)

        row = DepartmentLetterRequest.objects.create(
            department=dept,
            requested_by=request.user,
            title=title[:200],
            content=content,
            status='pending_pastor',
        )

        # Notify Pastor and Administration (SMS, email, push, in-app)
        pastor_audience = User.objects.filter(
            Q(member_profile__role__in=['pastor', 'admin']) |
            Q(member_profile__roles__contains='pastor') |
            Q(member_profile__roles__contains='admin'),
            is_active=True,
        ).distinct()

        # The letter itself is what the pastor must open, and its paper lives
        # on its own department's Requests view — the link goes straight to it
        # rather than to an office's inbox that does not hold this letter.
        desk_link = _letter_desk_link(dept)
        subject = f'Official Letter for Signature: {dept.name}'
        requester_name = giver_display_name('', member=request.user)
        body = (
            f"{requester_name} has submitted an official letter for {dept.name}: \"{title}\". "
            f"Awaiting your pastoral signature: {desk_link}"
        )
        sms_text = (
            f"SDA Loma Linda: {requester_name} submitted a letter for {dept.name} ({title[:30]}). "
            f"Review & sign: {desk_link}"
        )
        _notify_withdrawal_audience(pastor_audience, subject, body, desk_link, sms_text)

        serializer = DepartmentLetterRequestSerializer(row)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class DepartmentLetterReviewView(APIView):
    """Pastor and Clerk signing workflow for official department letters."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        row = DepartmentLetterRequest.objects.select_related(
            'department', 'requested_by', 'pastor_signed_by', 'clerk_signed_by'
        ).filter(pk=pk).first()
        if not row:
            return Response({'detail': 'Letter request not found.'}, status=status.HTTP_404_NOT_FOUND)

        action = request.data.get('action')
        reply = str(request.data.get('reply') or '').strip()[:255]

        if action == 'pastor_sign':
            if not is_pastor_or_admin(request.user):
                return Response({'detail': 'Only the church pastor or administrator can sign as pastor.'}, status=status.HTTP_403_FORBIDDEN)
            if row.status != 'pending_pastor':
                return Response({'detail': 'This letter is not currently awaiting pastor signature.'}, status=status.HTTP_400_BAD_REQUEST)

            row.status = 'pastor_signed'
            row.pastor_signed_by = request.user
            row.pastor_signed_at = timezone.now()
            row.save(update_fields=['status', 'pastor_signed_by', 'pastor_signed_at'])

            # Notify Clerk and Administration to sign
            clerk_audience = User.objects.filter(
                Q(member_profile__role__in=['clerk', 'admin']) |
                Q(member_profile__roles__contains='clerk') |
                Q(member_profile__roles__contains='admin'),
                is_active=True,
            ).distinct()
            # The clerk's page in Clerkship (Letter Approvals) holds every
            # letter in the church, so this notice hands over the one place
            # that answers for them all rather than this desk's own view:
            # wherever the letter was written, the second pen is found here.
            desk_link = f'{settings.FRONTEND_URL}/administration?tab=clerk-letters'
            subject = f'Pastor Signed: Letter from {row.department.name} awaiting Clerk signature'
            pastor_name = giver_display_name('', member=request.user)
            body = (
                f"{pastor_name} has signed the letter \"{row.title}\" for {row.department.name}. "
                f"It is now ready for the Church Clerk's signature: {desk_link}"
            )
            sms_text = (
                f"SDA Loma Linda: Letter for {row.department.name} ({row.title[:30]}) "
                f"was signed by Pastor. Review & sign: {desk_link}"
            )
            _notify_withdrawal_audience(clerk_audience, subject, body, desk_link, sms_text)

            serializer = DepartmentLetterRequestSerializer(row)
            return Response(serializer.data)

        elif action == 'clerk_sign':
            if not is_clerk_or_admin(request.user):
                return Response({'detail': 'Only the church clerk or administrator can sign as clerk.'}, status=status.HTTP_403_FORBIDDEN)
            if row.status != 'pastor_signed':
                return Response({'detail': 'This letter must be signed by the pastor before the clerk can sign.'}, status=status.HTTP_400_BAD_REQUEST)

            row.status = 'completed'
            row.clerk_signed_by = request.user
            row.clerk_signed_at = timezone.now()
            row.save(update_fields=['status', 'clerk_signed_by', 'clerk_signed_at'])

            # Notify the requester that the letter is fully signed and ready to download
            requester = row.requested_by
            if requester:
                download_link = _letter_desk_link(row.department)
                subject = f'Letter Fully Signed: {row.title}'
                body = (
                    f"Your official letter \"{row.title}\" for {row.department.name} has been signed "
                    f"by both Pastor and Clerk! You can now download it from the Requests desk for stamping: {download_link}"
                )
                sms_text = (
                    f"SDA Loma Linda: Your letter for {row.department.name} ({row.title[:30]}) "
                    f"is fully signed! Download for stamping: {download_link}"
                )
                _notify_withdrawal_audience([requester], subject, body, download_link, sms_text)

            serializer = DepartmentLetterRequestSerializer(row)
            return Response(serializer.data)

        elif action == 'decline':
            if not is_pastor_or_admin(request.user) and not is_clerk_or_admin(request.user):
                return Response({'detail': 'Only pastors, clerks or admins can decline letters.'}, status=status.HTTP_403_FORBIDDEN)

            row.status = 'declined'
            row.declined_by = request.user
            row.reply = reply
            row.save(update_fields=['status', 'declined_by', 'reply'])

            requester = row.requested_by
            if requester:
                subject = f'Letter Declined: {row.title}'
                body = (
                    f"Your letter \"{row.title}\" for {row.department.name} was declined. "
                    f"Reason: {reply or 'Not specified'}"
                )
                _notify_withdrawal_audience([requester], subject, body, '', body)

            serializer = DepartmentLetterRequestSerializer(row)
            return Response(serializer.data)

        return Response({'detail': 'Invalid action. Choose pastor_sign, clerk_sign, or decline.'}, status=status.HTTP_400_BAD_REQUEST)


class DepartmentLetterPdfView(APIView):
    """Generate and download the official letterhead PDF for a department letter."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        row = DepartmentLetterRequest.objects.select_related(
            'department', 'requested_by', 'pastor_signed_by', 'clerk_signed_by', 'declined_by'
        ).filter(pk=pk).first()
        if not row:
            return Response({'detail': 'Letter request not found.'}, status=status.HTTP_404_NOT_FOUND)

        user = request.user
        can_view = (
            user.pk == row.requested_by_id or
            is_pastor_or_admin(user) or
            is_clerk_or_admin(user) or
            is_elder_or_admin(user) or
            DepartmentMembership.objects.filter(department=row.department, member=user).exists()
        )
        if not can_view:
            return Response({'detail': 'You do not have permission to view this letter.'}, status=status.HTTP_403_FORBIDDEN)

        from .signatures import user_signature_entry
        from .pdf_generator import generate_department_letter_pdf

        pastor_sig = user_signature_entry(row.pastor_signed_by, "Church Pastor") if row.pastor_signed_by else None
        clerk_sig = user_signature_entry(row.clerk_signed_by, "Church Clerk") if row.clerk_signed_by else None

        serializer = DepartmentLetterRequestSerializer(row)
        church_name = current_church_name()
        pdf_bytes = generate_department_letter_pdf(serializer.data, church_name, pastor_sig, clerk_sig)

        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        filename = f"Letter_{row.department.code}_{row.id}.pdf"
        response['Content-Disposition'] = f'inline; filename="{filename}"'
        return response



class DeaconateRequestView(APIView):
    """The deaconate's asks of the office, about the church's property.

    A buy or a repair arrives by name alone. A use, a stock addition or a
    removal pins itself to the register row it would act on (``item``), so
    the elders' answer can apply it: each carries what it is (quantity,
    purpose, and for a use whether the items come back), and only its
    approving changes the register. POST raises one — the deaconate's
    leadership only (the desk's own ``can_manage_department`` gate). GET
    reads this member's own asks; the review desk reads them all at
    DeaconateRequestReviewView.
    """

    REGISTER_ASK_KINDS = ('use', 'stock', 'remove')

    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = DeaconateRequest.objects.filter(requested_by=request.user)
        return Response({
            'requests': [
                {                    'id': row.id,
                    'kind': row.kind,
                    'item_name': row.item_name,
                    'quantity': row.quantity,
                    'purpose': row.purpose,
                    'details': row.details,
                    'note': row.note,
                    'status': row.status,
                    'reply': row.reply,
                    'created_at': row.created_at,
                    'reviewed_at': row.reviewed_at,
                }
                for row in rows
            ],
        })

    def post(self, request):
        if not can_manage_department(request.user, 'deaconate'):
            return Response(
                {'detail': 'Only the deaconate leadership or the office can raise a property request.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        kind = str(request.data.get('kind')) or 'buy'
        if kind in self.REGISTER_ASK_KINDS:
            item = InventoryItem.objects.filter(pk=request.data.get('item_id')).first()
            if item is None:
                return Response({'item_id': 'Point the request at a register row.'}, status=status.HTTP_400_BAD_REQUEST)
            row = self._raise_register_ask(request.user, kind, item, request.data)
        elif kind in ('buy', 'repair'):
            item_name = str(request.data.get('item_name') or '').strip()
            if len(item_name) < 2:
                return Response({'item_name': 'Name the item — at least two characters.'}, status=status.HTTP_400_BAD_REQUEST)
            row = DeaconateRequest.objects.create(
                requested_by=request.user,
                kind=kind,
                item_name=item_name[:200],
                note=str(request.data.get('note') or '').strip()[:1000],
            )
        else:
            return Response({'kind': 'Ask to buy an item, repair one, or raise an ask the register holds.'}, status=status.HTTP_400_BAD_REQUEST)
        # One save carries the whole ask: the row is built with its item,
        # quantity and details before it touches the ledger, so an invalid
        # ask never half-lands.
        row.save()
        # The ask lands with the church's offices — the people who answer
        # for the church's money. The clerk rides along: the register and
        # the correspondence are the clerk's hands.
        tell_elders_of_property_request(row, request.user)
        return Response({'id': row.id, 'status': row.status, 'detail': 'Your request has been sent.'}, status=status.HTTP_201_CREATED)

    def _raise_register_ask(self, raised_by, kind, item, data):
        """Pin an ask to its register row, reading its shape out of the form."""
        row = DeaconateRequest(requested_by=raised_by, kind=kind, item=item, item_name=item.name[:200])
        row.note = str(data.get('note') or data.get('reason') or '').strip()[:1000]
        row.details = {}
        if kind == 'use':
            shared = 'consumed' if str(data.get('shared') or 'reusable') == 'consumed' else 'reusable'
            row.details = {
                'shared': shared,
                'custodian': str(data.get('custodian') or '').strip()[:160] if shared == 'reusable' else '',
            }
            try:
                used = int(data.get('quantity'))
            except (TypeError, ValueError):
                used = 0
            if used < 1 or used > item.quantity:
                raise ValidationError({'quantity': f'The church holds {item.quantity} of "{item.name}" — ask up to that.'})
            row.quantity = used
            row.purpose = str(data.get('purpose') or '').strip()[:255]
            if len(row.purpose) < 2:
                raise ValidationError({'purpose': 'What are the items for?'})
        if kind == 'stock':
            try:
                added = int(data.get('quantity'))
            except (TypeError, ValueError):
                added = 0
            if added < 1:
                raise ValidationError({'quantity': 'How many items are being added?'})
            row.quantity = added
        return row


class DeaconateRequestReviewView(APIView):
    """The eldership's answer to the deaconate's property asks.

    GET reads the ledger for whoever answers requests today (the offices;
    the deaconate's leadership may read the state of their own asks).
    PATCH answers one — approve or decline, with a note the desk reads
    back. For the register asks the answer is the act: approving applies
    the use, the stock addition, the movement or the removal the moment it
    saves, and a declined new row keeps its place behind its Rejected
    badge; a buy or a repair stays paper, the purchase being the
    treasurer's ledger's business.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile = department_office_profile(request.user)
        if not profile and not can_manage_department(request.user, 'deaconate'):
            return Response({'requests': []})
        rows = DeaconateRequest.objects.select_related('requested_by', 'reviewed_by', 'item')
        return Response({
            'requests': [
                {
                    'id': row.id,
                    'kind': row.kind,
                    'item_name': row.item_name,
                    # What the ask act-on: its row, the count it moves and the
                    # shape it would change, so the review desk reads a use
                    # with its purpose and a movement with its direction.
                    'item_id': row.item_id,
                    'quantity': row.quantity,
                    'purpose': row.purpose,
                    'details': row.details,
                    'note': row.note,
                    'status': row.status,
                    'reply': row.reply,
                    'requested_by': row.requested_by_id,
                    'requested_by_name': (
                        f"{row.requested_by.first_name} {row.requested_by.last_name}".strip()
                        or row.requested_by.get_username()
                    ),
                    'created_at': row.created_at,
                    'reviewed_at': row.reviewed_at,
                }
                for row in rows
            ],
        })

    def patch(self, request, pk):
        if not department_office_profile(request.user):
            return Response(
                {'detail': 'Only the church offices can answer property requests.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        row = DeaconateRequest.objects.select_related('requested_by').filter(pk=pk).first()
        if row is None:
            return Response({'detail': 'Unknown request.'}, status=status.HTTP_404_NOT_FOUND)
        decision = str(request.data.get('status') or '')
        if decision not in ('approved', 'rejected'):
            return Response({'detail': 'Answer with approved or rejected.'}, status=status.HTTP_400_BAD_REQUEST)
        approved = decision == 'approved'
        # The answer stands on the row first, and the register moves after it,
        # in one transaction: the movement lines an approval writes carry the
        # officer who gave it (``recorded_by``), and a removal takes the item
        # this row points at, so the pointer is written once it is gone.
        had_item = row.item_id is not None
        row.status = decision
        row.reply = str(request.data.get('reply') or '').strip()[:500]
        row.reviewed_by = request.user
        row.reviewed_at = timezone.now()
        with transaction.atomic():
            row.save(update_fields=['status', 'reply', 'reviewed_by', 'reviewed_at'])
            applied = apply_property_decision(row, approved)
            if had_item and row.item_id is None:
                row.save(update_fields=['item'])
        verb = 'approved' if approved else 'declined'
        title = f'Your {row.get_kind_display().lower()} request for {row.item_name} was {verb}'
        if row.reply:
            message = row.reply
        elif applied:
            # The approval did the thing; the desk reads what it did, applied.
            message = applied
        elif approved:
            message = (
                'The eldership has approved it; the register takes it from here.'
                if row.kind in ('add', 'use', 'stock', 'movement', 'remove')
                else 'The office has approved it — take the next step with the treasurer.'
            )
        else:
            message = 'The office could not take it on this time.'
        ChurchNotification.objects.create(
            user=row.requested_by,
            title=title,
            message=message,
            link=f'{settings.FRONTEND_URL}/administration?tab=inventory',
        )
        return Response({'id': row.id, 'status': row.status, 'reply': row.reply})


class ChildrenGroupsView(generics.ListCreateAPIView):
    """List or create children groups and their age brackets (Beginners, Kindergarten, Primary, Junior, Teens, Pathfinders)."""
    queryset = ChildrenGroup.objects.filter(is_active=True)
    serializer_class = ChildrenGroupSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return ChildrenGroup.objects.filter(is_active=True).order_by('sort_order', 'min_age')


class ChildrenRecordsView(generics.ListCreateAPIView):
    """List and register children records under children ministries."""
    serializer_class = ChildRecordSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = ChildRecord.objects.filter(is_active=True).select_related('group', 'parent')
        unit = self.request.query_params.get('unit')
        group_code = self.request.query_params.get('group')
        search = self.request.query_params.get('search')
        if unit:
            qs = qs.filter(Q(unit__iexact=unit) | Q(group__name__iexact=unit))
        if group_code:
            qs = qs.filter(group__code=group_code)
        if search:
            q = search.strip().lower()
            qs = qs.filter(
                Q(first_name__icontains=q)
                | Q(last_name__icontains=q)
                | Q(guardian_name__icontains=q)
                | Q(guardian_phone__icontains=q)
            )
        return qs.order_by('first_name', 'last_name')

    def perform_create(self, serializer):
        parent = serializer.validated_data.get('parent') or self.request.user
        serializer.save(parent=parent)


class ChildRecordDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Retrieve, update, or remove a child record."""
    queryset = ChildRecord.objects.all()
    serializer_class = ChildRecordSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=['is_active'])


class ChildrenAutoProgressView(APIView):
    """Batch run age progression across all active children."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        progressed = []
        for child in ChildRecord.objects.filter(is_active=True).select_related('group'):
            old_group_name = child.group.name if child.group else None
            new_group = child.auto_progress()
            if new_group and (old_group_name != new_group.name):
                progressed.append({
                    'id': child.id,
                    'name': child.full_name,
                    'old_group': old_group_name,
                    'new_group': new_group.name,
                })
        return Response({
            'progressed_count': len(progressed),
            'progressed': progressed,
        })


class PathfinderClubView(generics.ListCreateAPIView):
    """List and enroll Pathfinder club members."""
    queryset = Pathfinder.objects.filter(is_active=True).select_related('child', 'member')
    serializer_class = PathfinderSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = Pathfinder.objects.filter(is_active=True).select_related('child', 'member')
        cls = self.request.query_params.get('class')
        search = self.request.query_params.get('search')
        if cls:
            qs = qs.filter(pathfinder_class=cls)
        if search:
            q = search.strip().lower()
            qs = qs.filter(
                Q(first_name__icontains=q)
                | Q(last_name__icontains=q)
                | Q(guardian_name__icontains=q)
            )
        return qs.order_by('first_name', 'last_name')


class PathfinderDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Retrieve, update, or unenroll a Pathfinder member."""
    queryset = Pathfinder.objects.all()
    serializer_class = PathfinderSerializer
    permission_classes = [permissions.IsAuthenticated]


# ── Prayer cells ─────────────────────────────────────────────────────────────
#
# The Personal Ministries desk keeps the church's prayer cells (see the
# PrayerCell register): members raise their asks on the fellowship's page,
# and the desk forms cells, seats members in them and answers the asks.
# Every cell's group chat is ensured here — ``chat.services.ensure_cell_room``
# creates it the moment a cell is written and keeps its participants in step
# with the cell's roll.

CELL_DESK = 'personal_ministries'


def cell_can_manage(user):
    """Who keeps the prayer cells: the Personal Ministries desk and the office."""
    return can_manage_department(user, CELL_DESK)


def cell_member_name(user):
    """How a cell member reads on a list: their name, or their username."""
    if user is None:
        return ''
    name = f"{user.first_name} {user.last_name}".strip()
    return name or user.get_username()


def cell_updates_room(cell):
    """Rewrite the cell's chat room to match the cell's roll."""
    from chat.services import ensure_cell_room

    ensure_cell_room(cell)


def cell_json(row):
    """One cell as the fellowship's page and the desk's panel read it."""
    from chat.models import Conversation

    memberships = row.memberships.select_related('member').order_by('created_at', 'id')
    room = Conversation.objects.filter(key=f'cell:{row.id}').only('id').first()
    return {
        'id': row.id,
        'name': row.name,
        'description': row.description,
        'leader': (
            {'id': row.leader_id, 'name': cell_member_name(row.leader)}
            if row.leader_id else None
        ),
        'members': [
            {
                'member_id': membership.member_id,
                'name': cell_member_name(membership.member),
                'created_at': membership.created_at,
            }
            for membership in memberships
        ],
        'is_active': row.is_active,
        'created_at': row.created_at,
        'room_id': room.id if room else None,
    }


class PrayerCellsView(APIView):
    """The church's prayer cells.

    GET reads the register — every active cell with its roll — together with
    the member's own open asks and whether this reader keeps the desk. POST
    forms a cell (the desk alone), and forming one forms its chat room too.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = PrayerCell.objects.filter(is_active=True).prefetch_related('memberships__member')
        my_cells = set(
            PrayerCellMember.objects.filter(member=request.user).values_list('cell_id', flat=True)
        )
        my_requests = PrayerCellJoinRequest.objects.filter(member=request.user).select_related('cell')
        return Response({
            'cells': [cell_json(row) for row in rows],
            'my_cells': sorted(my_cells),
            'my_requests': [
                {
                    'id': row.id,
                    'cell_id': row.cell_id,
                    'cell_name': row.cell.name,
                    'status': row.status,
                    'reply': row.reply,
                    'created_at': row.created_at,
                }
                for row in my_requests
            ],
            'can_manage': cell_can_manage(request.user),
        })

    def post(self, request):
        if not cell_can_manage(request.user):
            return Response({'detail': 'The Personal Ministries desk forms the cells.'}, status=status.HTTP_403_FORBIDDEN)
        name = str(request.data.get('name') or '').strip()
        if len(name) < 3:
            return Response({'name': 'Give the cell a name of at least three characters.'}, status=status.HTTP_400_BAD_REQUEST)
        if PrayerCell.objects.filter(name__iexact=name).exists():
            return Response({'name': 'A prayer cell by that name already exists.'}, status=status.HTTP_400_BAD_REQUEST)
        leader_id = request.data.get('leader_id')
        leader = None
        if leader_id is not None:
            leader = User.objects.filter(pk=leader_id).first()
            if leader is None:
                return Response({'leader_id': 'Unknown member.'}, status=status.HTTP_400_BAD_REQUEST)
        cell = PrayerCell.objects.create(
            name=name,
            description=str(request.data.get('description') or '').strip()[:240],
            leader=leader,
            created_by=request.user,
        )
        # The cell is formed: so is the room its members talk in.
        cell_updates_room(cell)
        return Response(cell_json(cell), status=status.HTTP_201_CREATED)


class PrayerCellDetailView(APIView):
    """One cell, kept by the desk: renamed, its leader set, its roll edited."""
    permission_classes = [IsAuthenticated]

    def _cell(self, pk):
        cell = PrayerCell.objects.filter(pk=pk, is_active=True).first()
        if cell is None:
            return None
        return cell

    def patch(self, request, pk):
        cell = self._cell(pk)
        if cell is None:
            return Response({'detail': 'Unknown prayer cell.'}, status=status.HTTP_404_NOT_FOUND)
        if not cell_can_manage(request.user):
            return Response({'detail': 'The Personal Ministries desk keeps the cells.'}, status=status.HTTP_403_FORBIDDEN)
        updates = []
        name = operation_name = request.data.get('name')
        if 'name' in request.data:
            name = str(name or '').strip()
            if len(name) < 3:
                return Response({'name': 'Give the cell a name of at least three characters.'}, status=status.HTTP_400_BAD_REQUEST)
            if PrayerCell.objects.filter(name__iexact=name).exclude(pk=cell.pk).exists():
                return Response({'name': 'A prayer cell by that name already exists.'}, status=status.HTTP_400_BAD_REQUEST)
            cell.name = name
            updates.append('name')
        if 'description' in request.data:
            cell.description = str(request.data.get('description') or '').strip()[:240]
            updates.append('description')
        if 'leader_id' in request.data:
            leader_id = request.data.get('leader_id')
            if leader_id in (None, ''):
                cell.leader = None
            else:
                leader = User.objects.filter(pk=leader_id).first()
                if leader is None:
                    return Response({'leader_id': 'Unknown member.'}, status=status.HTTP_400_BAD_REQUEST)
                cell.leader = leader
            updates.append('leader')
        if updates:
            cell.save(update_fields=updates)
        if 'leader_id' in request.data:
            # The leader's moderator flag rides the room sync.
            cell_updates_room(cell)
        return Response(cell_json(cell))

    def delete(self, request, pk):
        """Retire the cell from the register; its chat room stands as history."""
        cell = self._cell(pk)
        if cell is None:
            return Response({'detail': 'Unknown prayer cell.'}, status=status.HTTP_404_NOT_FOUND)
        if not cell_can_manage(request.user):
            return Response({'detail': 'The Personal Ministries desk keeps the cells.'}, status=status.HTTP_403_FORBIDDEN)
        cell.is_active = False
        cell.save(update_fields=['is_active'])
        return Response({'detail': 'The cell is retired from the register.'})


class PrayerCellMembersView(APIView):
    """The cell's roll, kept by the desk.

    POST seats a member (an added member lands in the cell's chat room on
    the way); DELETE unseats one, and the room follows.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        cell = PrayerCell.objects.filter(pk=pk, is_active=True).first()
        if cell is None:
            return Response({'detail': 'Unknown prayer cell.'}, status=status.HTTP_404_NOT_FOUND)
        if not cell_can_manage(request.user):
            return Response({'detail': 'The Personal Ministries desk keeps the cells.'}, status=status.HTTP_403_FORBIDDEN)
        member = User.objects.filter(pk=request.data.get('member_id')).first()
        if member is None:
            return Response({'member_id': 'Unknown member.'}, status=status.HTTP_400_BAD_REQUEST)
        _, created = PrayerCellMember.objects.get_or_create(
            cell=cell, member=member, defaults={'added_by': request.user},
        )
        if created:
            cell_updates_room(cell)
        return Response(cell_json(cell))

    def delete(self, request, pk, member_id):
        cell = PrayerCell.objects.filter(pk=pk, is_active=True).first()
        if cell is None:
            return Response({'detail': 'Unknown prayer cell.'}, status=status.HTTP_404_NOT_FOUND)
        if not cell_can_manage(request.user):
            return Response({'detail': 'The Personal Ministries desk keeps the cells.'}, status=status.HTTP_403_FORBIDDEN)
        removed, _ = PrayerCellMember.objects.filter(cell=cell, member_id=member_id).delete()
        if removed:
            cell_updates_room(cell)
        return Response(cell_json(cell))


class PrayerCellJoinRequestView(APIView):
    """A member's ask to join a prayer cell.

    GET reads the member's own asks; POST raises one against a cell. A
    member already in the cell has no ask to raise, and one open ask per
    cell stands at a time.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = PrayerCellJoinRequest.objects.filter(member=request.user).select_related('cell')
        return Response({
            'requests': [
                {
                    'id': row.id,
                    'cell_id': row.cell_id,
                    'cell_name': row.cell.name,
                    'cell_active': row.cell.is_active,
                    'status': row.status,
                    'reply': row.reply,
                    'created_at': row.created_at,
                    'reviewed_at': row.reviewed_at,
                }
                for row in rows
            ],
        })

    def post(self, request, pk):
        cell = PrayerCell.objects.filter(pk=pk, is_active=True).first()
        if cell is None:
            return Response({'detail': 'Unknown prayer cell.'}, status=status.HTTP_404_NOT_FOUND)
        if PrayerCellMember.objects.filter(cell=cell, member=request.user).exists():
            return Response({'detail': 'You are already in this cell.'}, status=status.HTTP_400_BAD_REQUEST)
        if PrayerCellJoinRequest.objects.filter(member=request.user, cell=cell, status='pending').exists():
            return Response({'detail': 'Your ask is already waiting with this cell.'}, status=status.HTTP_400_BAD_REQUEST)
        row = PrayerCellJoinRequest.objects.create(
            member=request.user,
            cell=cell,
            note=str(request.data.get('note') or '').strip()[:500],
        )
        # The ask lands with the Personal Ministries desk's leadership and the
        # office, who answer join asks from the same office rule.
        from .requests import request_audience

        audience_ids = {
            member_id for member_id in DepartmentAssignment.objects.filter(
                department__code=CELL_DESK, department__is_active=True, member__is_active=True,
            ).values_list('member_id', flat=True)
        }
        audience_ids.update(request_audience('join').values_list('id', flat=True))
        audience_ids.discard(request.user.id)
        audience = User.objects.filter(id__in=audience_ids, is_active=True)
        desk_link = f'{settings.FRONTEND_URL}/administration?tab=leaders&dept=personal_ministries&view=prayer_cells'
        subject = f'New prayer cell request for {cell.name}'
        body = (
            f"{request.user.get_full_name() or request.user.get_username()} has asked to join "
            f"the prayer cell \"{cell.name}\". Open the Personal Ministries desk to respond: {desk_link}"
        )
        ChurchNotification.objects.bulk_create([
            ChurchNotification(user=person, title=subject, message=body, link=desk_link)
            for person in audience
        ])
        try:
            from .push import push_to_user, vapid_keys_ready

            if vapid_keys_ready():
                for person in audience:
                    push_to_user(person, title=subject, body=body, link=desk_link)
        except Exception:
            pass
        return Response({'id': row.id, 'status': row.status, 'detail': 'Your request has been sent.'}, status=status.HTTP_201_CREATED)


class PrayerCellJoinRequestReviewView(APIView):
    """The desk's answer to a join-into-a-cell ask.

    Visible to the Personal Ministries desk and the office; approving seats
    the member in the cell — and, through the room sync, in its chat.
    """
    permission_classes = [IsAuthenticated]

    def _visible(self, user):
        if cell_can_manage(user):
            return PrayerCellJoinRequest.objects.filter().select_related('member', 'cell')
        return PrayerCellJoinRequest.objects.none()

    def get(self, request, cell_id=None):
        if cell_id is not None:
            cell = PrayerCell.objects.filter(pk=cell_id).first()
            if cell is None:
                return Response({'detail': 'Unknown prayer cell.'}, status=status.HTTP_404_NOT_FOUND)
        rows = self._visible(request.user)
        if cell_id is not None:
            rows = rows.filter(cell_id=cell_id)
        return Response({
            'can_review': cell_can_manage(request.user),
            'requests': [
                {
                    'id': row.id,
                    'cell_id': row.cell_id,
                    'cell_name': row.cell.name,
                    'member_id': row.member_id,
                    'member_name': cell_member_name(row.member),
                    'member_email': row.member.email or '',
                    'note': row.note,
                    'status': row.status,
                    'reply': row.reply,
                    'created_at': row.created_at,
                }
                for row in rows
            ],
        })

    def patch(self, request, pk):
        row = PrayerCellJoinRequest.objects.select_related('member', 'cell').filter(pk=pk).first()
        if row is None:
            return Response({'detail': 'Unknown request.'}, status=status.HTTP_404_NOT_FOUND)
        if not cell_can_manage(request.user):
            return Response({'detail': 'The Personal Ministries desk answers these.'}, status=status.HTTP_403_FORBIDDEN)
        if row.status != 'pending':
            return Response({'detail': 'This ask has already been answered.'}, status=status.HTTP_400_BAD_REQUEST)
        decision = str(request.data.get('status') or '')
        if decision not in ('approved', 'rejected'):
            return Response({'detail': 'Answer with approved or rejected.'}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            row.status = decision
            row.reply = str(request.data.get('reply') or '').strip()[:500]
            row.reviewed_by = request.user
            row.reviewed_at = timezone.now()
            row.save(update_fields=['status', 'reply', 'reviewed_by', 'reviewed_at'])
            if decision == 'approved':
                PrayerCellMember.objects.get_or_create(
                    cell=row.cell, member=row.member, defaults={'added_by': request.user},
                )
        if decision == 'approved':
            cell_updates_room(row.cell)
        approved = decision == 'approved'
        ChurchNotification.objects.create(
            user=row.member,
            title=f'Your request to join "{row.cell.name}" was {"approved" if approved else "declined"}',
            message=row.reply or (
                'Welcome to the cell — you are in it, and its chat is open.'
                if approved
                else 'Thank you for asking. The desk could not take you into this cell this time.'
            ),
            link=            f'{settings.FRONTEND_URL}/prayer-cells',
        )
        return Response({'id': row.id, 'status': row.status, 'reply': row.reply})
