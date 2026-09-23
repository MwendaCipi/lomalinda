import re
from decimal import Decimal
from django.conf import settings
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework import serializers

from .models import (
    Announcement, AnnouncementResponse, BoardMeeting, BoardMeetingAgenda, BusinessMeeting, BusinessMeetingAgenda, CampaignCardAssignment, ChildDedicationRequest, ChurchBudget,
    ChurchCorrespondence, ChurchFinancialReport, ChurchNotification,
    CashContribution, ChurchSettings, Contribution, ContributionReconciliation, EnrollmentRequest, FundraisingCampaign, Invitation,
    GivingPurpose, InKindContribution, InventoryItem, InventoryMovement, MemberProfile, MpesaRefund, MembershipRemovalRequest, MembershipTransferRequest, Profession, PrayerRequest,
    giver_display_name,
    SabbathEvent, SupportSubmission, Testimony, TreasuryAccount, TreasuryAccountTransaction, Expenditure, VisitationRequest
)
from .meetings import PLACEHOLDERS as MEETING_PLACEHOLDERS
from .password_policy import MIN_LENGTH as PASSWORD_MIN_LENGTH, REQUIREMENTS_TEXT as PASSWORD_REQUIREMENTS, validate_church_password
from .roles import ADMIN_ROLE, ROLE_CODES, parse_role_codes, unknown_role_codes
from .validators import (
    validate_future_or_today_date, validate_national_id,
    validate_past_or_today_date, validate_phone_number,
    validate_positive_amount, validate_text_min_length
)


class UserDetailSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()
    roles = serializers.SerializerMethodField()
    phone_number = serializers.CharField(source='member_profile.phone_number', read_only=True, default='')
    current_church = serializers.CharField(source='member_profile.current_church', read_only=True, default='')
    baptismal_status = serializers.CharField(source='member_profile.baptismal_status', read_only=True, default='')
    account_type = serializers.CharField(source='member_profile.account_type', read_only=True, default='regular')
    employment_status = serializers.CharField(source='member_profile.employment_status', read_only=True, default='')
    profession = serializers.CharField(source='member_profile.profession', read_only=True, default='')

    def get_role(self, obj):
        profile = getattr(obj, 'member_profile', None)
        if profile and profile.role:
            return profile.role
        if obj.is_superuser or obj.is_staff:
            return 'admin'
        return 'member'

    def get_roles(self, obj):
        profile = getattr(obj, 'member_profile', None)
        if profile:
            return profile.get_roles()
        if obj.is_superuser or obj.is_staff:
            return ['admin']
        return ['member']
    gender = serializers.CharField(source='member_profile.gender', read_only=True)
    date_of_birth = serializers.DateField(source='member_profile.date_of_birth', read_only=True)
    gifts = serializers.CharField(source='member_profile.gifts', read_only=True)
    whatsapp_number = serializers.CharField(source='member_profile.whatsapp_number', read_only=True)
    disability = serializers.CharField(source='member_profile.disability', read_only=True)
    is_disfellowshipped = serializers.BooleanField(source='member_profile.is_disfellowshipped', read_only=True, default=False)

    class Meta:
        model = User
        fields = (
            'id',
            'username',
            'email',
            'first_name',
            'last_name',
            'role',
            'roles',
            'phone_number',
            'whatsapp_number',
            'current_church',
            'baptismal_status',
            'account_type',
            'employment_status',
            'profession',
            'gender',
            'date_of_birth',
            'gifts',
            'disability',
            'is_disfellowshipped',
            # The installation's owner account is not a member; the roster
            # endpoints filter it out and the clients use this to be sure.
            'is_superuser',
        )


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(
        write_only=True, min_length=PASSWORD_MIN_LENGTH, help_text=PASSWORD_REQUIREMENTS
    )
    phone_number = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = ('username', 'email', 'first_name', 'last_name', 'password', 'phone_number')

    def validate_phone_number(self, value):
        return validate_phone_number(value)

    def validate_first_name(self, value):
        return validate_text_min_length(value, 2, 'First name')

    def validate_last_name(self, value):
        return validate_text_min_length(value, 2, 'Last name')

    def validate_password(self, value):
        validate_church_password(value)
        return value

    def create(self, validated_data):
        phone_number = validated_data.pop('phone_number', '')
        user = User.objects.create_user(**validated_data)
        MemberProfile.objects.create(user=user, phone_number=phone_number)
        return user


class EnrollmentRequestSerializer(serializers.ModelSerializer):
    privacy_accepted = serializers.BooleanField(write_only=True, required=False, default=True)
    terms_accepted = serializers.BooleanField(write_only=True, required=False, default=False)

    class Meta:
        model = EnrollmentRequest
        fields = ('email', 'first_name', 'last_name', 'phone_number', 'joining_mode', 'id_number', 'education_level', 'profession', 'date_of_birth', 'county_of_birth', 'current_church', 'privacy_accepted', 'terms_accepted')

    def to_internal_value(self, data):
        data = data.copy() if hasattr(data, 'copy') else dict(data)
        raw_name = str(data.get('name') or data.get('full_name') or '').strip()
        if raw_name and not data.get('first_name'):
            parts = raw_name.split()
            if len(parts) == 1:
                data['first_name'] = parts[0]
                data['last_name'] = parts[0]
            elif len(parts) == 2:
                data['first_name'] = parts[0]
                data['last_name'] = parts[1]
            else:
                data['first_name'] = " ".join(parts[:-1])
                data['last_name'] = parts[-1]
        return super().to_internal_value(data)

    def validate_phone_number(self, value):
        return validate_phone_number(value)

    def validate_id_number(self, value):
        return validate_national_id(value)

    def validate_date_of_birth(self, value):
        return validate_past_or_today_date(value)

    def validate_first_name(self, value):
        return validate_text_min_length(value, 2, 'First name')

    def validate_last_name(self, value):
        return validate_text_min_length(value, 2, 'Last name')

    def validate_privacy_accepted(self, value):
        if not value:
            raise serializers.ValidationError('You must agree to the Privacy Policy.')
        return value

    def validate(self, attrs):
        if attrs.get('joining_mode') == 'friend' and not attrs.get('current_church', '').strip():
            raise serializers.ValidationError({'current_church': 'Enter your current church.'})
        return attrs


class EnrollmentCompleteSerializer(serializers.Serializer):
    token = serializers.UUIDField()
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(
        write_only=True, min_length=PASSWORD_MIN_LENGTH, help_text=PASSWORD_REQUIREMENTS
    )
    privacy_accepted = serializers.BooleanField(write_only=True)
    terms_accepted = serializers.BooleanField(write_only=True)

    def validate_password(self, value):
        validate_church_password(value)
        return value

    def validate_privacy_accepted(self, value):
        if not value:
            raise serializers.ValidationError('You must agree to the Privacy Policy.')
        return value

    def validate_terms_accepted(self, value):
        if not value:
            raise serializers.ValidationError('You must agree to the Terms of Use.')
        return value


class InvitationSerializer(serializers.ModelSerializer):
    """Read/summary form of an invitation, used by the church admin console."""

    invited_by_name = serializers.SerializerMethodField()
    role_codes = serializers.SerializerMethodField()
    account_type_display = serializers.CharField(source='get_account_type_display', read_only=True)
    invite_url = serializers.SerializerMethodField()

    class Meta:
        model = Invitation
        fields = (
            'id', 'email', 'first_name', 'last_name', 'phone_number',
            'account_type', 'account_type_display', 'roles', 'role_codes',
            'status', 'invited_by_name', 'sent_at', 'accepted_at',
            'expires_at', 'created_at', 'invite_url',
        )
        read_only_fields = fields

    def get_invite_url(self, obj):
        # The stored token is only a hash, so an invitation read back from the
        # database cannot be turned into a link; the console gets the real link
        # in the create/resend responses, while the token is still in memory.
        return None

    def get_invited_by_name(self, obj):
        inviter = obj.invited_by
        if not inviter:
            return ''
        return f"{inviter.first_name} {inviter.last_name}".strip() or inviter.username

    def get_role_codes(self, obj):
        return obj.role_codes()


class InvitationAcceptSerializer(serializers.Serializer):
    token = serializers.UUIDField()
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    phone_number = serializers.CharField(max_length=20, required=False, allow_blank=True)
    privacy_accepted = serializers.BooleanField(write_only=True)
    terms_accepted = serializers.BooleanField(write_only=True)
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    def validate_username(self, value):
        username = value.strip()
        if not re.match(r'^[\w.@+-]+$', username):
            raise serializers.ValidationError('Use letters, numbers and the characters . @ + - _ only.')
        return username

    def validate_privacy_accepted(self, value):
        if not value:
            raise serializers.ValidationError('You must agree to the Privacy Policy.')
        return value

    def validate_terms_accepted(self, value):
        if not value:
            raise serializers.ValidationError('You must agree to the Terms of Use.')
        return value

    def validate(self, attrs):
        confirm = attrs.get('confirm_password')
        if confirm and confirm != attrs['password']:
            raise serializers.ValidationError({'confirm_password': 'The two passwords do not match.'})
        return attrs


class AnnouncementResponseSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True, default='')

    class Meta:
        model = AnnouncementResponse
        fields = ('id', 'announcement', 'user', 'username', 'action_type', 'pledge_amount', 'response_text', 'respondent_name', 'respondent_phone', 'created_at')
        read_only_fields = ('id', 'user', 'created_at')


class EnrollmentAdminSerializer(serializers.ModelSerializer):
    """Read-only view of a join request for the leadership Requests queue."""
    full_name = serializers.SerializerMethodField()
    has_account = serializers.SerializerMethodField()

    class Meta:
        model = EnrollmentRequest
        fields = ('id', 'first_name', 'last_name', 'full_name', 'email', 'phone_number', 'joining_mode', 'current_church', 'status', 'has_account', 'created_at', 'expires_at')

    def get_full_name(self, obj):
        return f"{obj.first_name} {obj.last_name}".strip() or obj.email

    def get_has_account(self, obj):
        return obj.user_id is not None


class AnnouncementSerializer(serializers.ModelSerializer):
    responses = AnnouncementResponseSerializer(many=True, read_only=True)
    responses_count = serializers.IntegerField(source='responses.count', read_only=True)
    sharing_option = serializers.CharField(max_length=100, required=False, allow_blank=True)
    attachment_name = serializers.SerializerMethodField()
    attachment_size = serializers.SerializerMethodField()

    def get_attachment_name(self, obj):
        """Original file name, so the UI can label an attachment without guessing from the URL."""
        if not obj.attachment:
            return None
        return obj.attachment.name.rsplit('/', 1)[-1]

    def get_attachment_size(self, obj):
        """File size in bytes for display (e.g. 'PDF \u00b7 1.4 MB'); None when the file is missing on disk."""
        if not obj.attachment:
            return None
        try:
            return obj.attachment.size
        except (FileNotFoundError, OSError, ValueError):
            return None

    def validate_text(self, value):
        # Keep in sync with ANNOUNCEMENT_TEXT_LIMIT in announcement-manager.tsx
        # so long posts are rejected at the API even if a client skips the check.
        if len(value) > 500:
            raise serializers.ValidationError('Announcement text must be 500 characters or fewer.')
        return value

    def validate(self, attrs):
        instance = self.instance
        start = attrs.get('event_date_from', instance.event_date_from if instance else None)
        end = attrs.get('event_date_to', instance.event_date_to if instance else None)
        if start and end and end < start:
            raise serializers.ValidationError('The event cannot end before it starts.')
        return attrs

    class Meta:
        model = Announcement
        fields = ('id', 'title', 'text', 'detail', 'href', 'visibility', 'action_type', 'attachment', 'attachment_name', 'attachment_size', 'sharing_option', 'is_popup', 'action_prompt', 'published', 'expires_at', 'event_date_from', 'event_date_to', 'created_at', 'responses', 'responses_count')
        read_only_fields = ('id', 'created_at')


class ContributionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Contribution
        fields = ('id', 'amount', 'currency', 'purpose', 'phone_number', 'donor_name', 'payment_method', 'status', 'mpesa_receipt_number', 'paid_at', 'created_at')
        read_only_fields = fields


class MpesaRefundSerializer(serializers.ModelSerializer):
    initiated_by_name = serializers.CharField(source='initiated_by.get_full_name', read_only=True)
    contribution_purpose = serializers.CharField(source='contribution.purpose', read_only=True)
    donor_name = serializers.CharField(source='contribution.donor_name', read_only=True)
    contribution_receipt = serializers.CharField(source='contribution.mpesa_receipt_number', read_only=True)
    # The URL identifies the contribution; the view injects it on save().
    contribution = serializers.PrimaryKeyRelatedField(queryset=Contribution.objects.all(), required=False)

    class Meta:
        model = MpesaRefund
        fields = (
            'id', 'contribution', 'amount', 'phone_number', 'reason', 'status',
            'outcome_description', 'transaction_id', 'initiated_by_name',
            'contribution_purpose', 'donor_name', 'contribution_receipt', 'completed_at', 'created_at',
        )
        read_only_fields = ('id', 'amount', 'status', 'outcome_description', 'transaction_id', 'originator_conversation_id', 'initiated_by_name', 'contribution_purpose', 'completed_at', 'created_at')

    def validate_phone_number(self, value):
        return validate_phone_number(value)

    def validate(self, data):
        contribution = data.get('contribution') or getattr(self.instance, 'contribution', None)
        if contribution and MpesaRefund.objects.filter(contribution=contribution).exists():
            raise serializers.ValidationError({'contribution': 'This contribution has already been refunded.'})
        return data


class CashContributionSerializer(serializers.ModelSerializer):
    received_by_name = serializers.CharField(source='received_by.get_full_name', read_only=True)

    class Meta:
        model = CashContribution
        fields = (
            'id', 'received_on', 'amount', 'purpose', 'entry_type', 'payment_method',
            'item_description', 'donor_name', 'giver_phone', 'giver_email', 'receipt_number',
            'notes', 'received_by_name', 'created_at', 'receipt_sent_at'
        )
        read_only_fields = ('id', 'received_by_name', 'created_at')

    def validate(self, data):
        amount = data.get('amount', getattr(self.instance, 'amount', Decimal('0')))
        if amount <= 0:
            raise serializers.ValidationError({'amount': 'Amount must be greater than zero for monetary givings.'})
        return data


class ContributionReconciliationSerializer(serializers.ModelSerializer):
    reconciled_by_name = serializers.CharField(source='reconciled_by.get_full_name', read_only=True)

    class Meta:
        model = ContributionReconciliation
        fields = ('reconciliation_date', 'digital_amount_confirmed', 'cash_amount_counted', 'notes', 'reconciled_by_name', 'reconciled_at')
        read_only_fields = ('reconciliation_date', 'reconciled_by_name', 'reconciled_at')

    def validate_digital_amount_confirmed(self, value):
        if value < 0:
            raise serializers.ValidationError('Confirmed amount cannot be negative.')
        return value

    def validate_cash_amount_counted(self, value):
        if value < 0:
            raise serializers.ValidationError('Counted amount cannot be negative.')
        return value


class SupportSubmissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = SupportSubmission
        fields = ('id', 'submission_type', 'category', 'content', 'name', 'phone_number', 'email', 'anonymous', 'created_at')
        read_only_fields = ('id', 'created_at')

    def validate_phone_number(self, value):
        return validate_phone_number(value)

    def validate_content(self, value):
        return validate_text_min_length(value, 5, 'Content')


class ContributionAllocationSerializer(serializers.Serializer):
    """One account and how much of the gift goes to it."""
    purpose = serializers.CharField(max_length=120)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=1,
                                      error_messages={'min_value': 'Each account needs at least KES 1.'})


class MemberEmailSerializer(serializers.Serializer):
    """The one profile field a member may set for themselves.

    Receipts are addressed from the account (see receipt_email_for), so a
    member with no address on file had no way to ever receive one. This is the
    narrow door that lets them fix it — nothing else about the account is
    writable from here.
    """

    email = serializers.EmailField(allow_blank=True)

    def validate_email(self, value):
        return value.strip()


def receipt_email_for(user):
    """The only address a gift receipt may be sent to: the giver's own account email.

    The Give form hides the email field from signed-out givers, but relying on
    the form alone was not enough — the endpoint accepted whatever address a
    request named, so a crafted call could ask the church to email a receipt into
    anyone's inbox. Receipts are addressed from the account instead of the
    payload: a member is emailed at the address on their account (which they can
    set from the same form, via MemberEmailSerializer), and a signed-out giver
    has no verifiable address, so nothing is emailed to them. An SMS receipt,
    which goes to the phone they gave, is unaffected.
    """
    if user is None or not getattr(user, 'is_authenticated', False):
        return ''
    return (getattr(user, 'email', '') or '').strip()


class ContributionInitiateSerializer(serializers.Serializer):
    giving_type = serializers.ChoiceField(choices=['financial'], default='financial')
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0, default=0)
    purpose = serializers.CharField(max_length=120, default='Tithe')
    # A giver may support several accounts in one payment. Older clients still
    # send a single amount+purpose, so an absent allocations list is read as one
    # allocation — the two shapes end up identical further down.
    allocations = ContributionAllocationSerializer(many=True, required=False)
    phone_number = serializers.CharField(max_length=20, required=False, allow_blank=True)
    donor_name = serializers.CharField(max_length=160, required=False, allow_blank=True)
    donor_email = serializers.EmailField(required=False, allow_blank=True)
    item_description = serializers.CharField(required=False, allow_blank=True, default='')
    payment_method = serializers.ChoiceField(
        choices=['cash', 'mpesa', 'bank_transfer', 'cheque'],
        default='mpesa'
    )

    def validate_phone_number(self, value):
        if value:
            return validate_phone_number(value)
        return value

    def validate(self, attrs):
        # The receipt address comes from the account, never from the request
        # body — see receipt_email_for(). Applied before anything is written or
        # packed into an M-Pesa push, so the callback and the ledger agree.
        attrs['donor_email'] = receipt_email_for(getattr(self.context.get('request'), 'user', None))

        submitted = attrs.get('allocations') or []
        cleaned = []
        seen = set()
        for row in submitted:
            purpose = (row.get('purpose') or '').strip()
            if not purpose:
                raise serializers.ValidationError({'allocations': 'Each amount needs an account.'})
            key = purpose.lower()
            if key in seen:
                raise serializers.ValidationError(
                    {'allocations': f'"{purpose}" was chosen twice — each account appears once.'}
                )
            seen.add(key)
            cleaned.append({'purpose': purpose, 'amount': row['amount']})

        if cleaned:
            attrs['allocations'] = cleaned
            # amount/purpose stay filled in as the payment's total and its label:
            # the M-Pesa push is sent once, for the whole gift.
            attrs['amount'] = sum(row['amount'] for row in cleaned)
            attrs['purpose'] = cleaned[0]['purpose'] if len(cleaned) == 1 else f"{len(cleaned)} accounts"
        else:
            attrs['allocations'] = [{'purpose': attrs['purpose'], 'amount': attrs['amount']}]

        if attrs['giving_type'] == 'financial':
            if attrs['amount'] < 1:
                raise serializers.ValidationError({'amount': 'Financial giving must be at least KES 1.'})
            if attrs.get('payment_method') == 'mpesa' and not attrs.get('phone_number'):
                raise serializers.ValidationError({'phone_number': 'Phone number is required for M-Pesa giving.'})
        return attrs


class InKindContributionSerializer(serializers.ModelSerializer):
    donor_display = serializers.SerializerMethodField()
    items_list = serializers.SerializerMethodField()

    class Meta:
        model = InKindContribution
        fields = ('id', 'donor_name', 'donor_email', 'phone_number', 'items', 'items_list', 'donor_display', 'purpose', 'notes', 'received_on', 'created_at')
        read_only_fields = ('id', 'created_at')

    def get_donor_display(self, obj):
        return giver_display_name(
            obj.donor_name, member=obj.member,
            email=obj.donor_email, phone=obj.phone_number,
        ) or 'Anonymous'

    def get_items_list(self, obj):
        return [line.strip() for line in (obj.items or '').splitlines() if line.strip()]

    def validate_items(self, value):
        items = [line.strip() for line in (value or '').splitlines() if line.strip()]
        if not items:
            raise serializers.ValidationError('Add at least one item — one item per row.')
        return '\n'.join(items)


class GivingPurposeSerializer(serializers.ModelSerializer):
    class Meta:
        model = GivingPurpose
        fields = ('id', 'name', 'account_name', 'active')
        read_only_fields = ('id',)

    def validate_name(self, value):
        name = validate_text_min_length(value, 2, 'Giving account name').strip()
        words = name.split()
        if len(words) > 2:
            raise serializers.ValidationError('Giving account name must be at most 2 words.')
        if len(name) > 20:
            raise serializers.ValidationError('Giving account name must be at most 20 characters.')
        return name


class ProfessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Profession
        fields = ('id', 'name', 'is_default')
        read_only_fields = ('id',)

    def validate_name(self, value):
        return validate_text_min_length(value, 2, 'Profession name')


class PrayerRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = PrayerRequest
        fields = ('id', 'request_text', 'name', 'email', 'phone_number', 'anonymous', 'created_at')
        read_only_fields = ('id', 'created_at')

    def validate_phone_number(self, value):
        return validate_phone_number(value)

    def validate_request_text(self, value):
        return validate_text_min_length(value, 10, 'Prayer request text')


class ChildDedicationRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChildDedicationRequest
        fields = ('id', 'child_name', 'child_dob', 'father_name', 'mother_name', 'phone_number', 'notes', 'status', 'created_at')
        read_only_fields = ('id', 'status', 'created_at')

    def validate_phone_number(self, value):
        return validate_phone_number(value)

    def validate_child_dob(self, value):
        return validate_past_or_today_date(value)

    def validate_child_name(self, value):
        return validate_text_min_length(value, 2, 'Child name')


class TestimonySerializer(serializers.ModelSerializer):
    class Meta:
        model = Testimony
        fields = ('id', 'name', 'phone_number', 'testimony_text', 'requested_date', 'requested_time', 'status', 'created_at')
        read_only_fields = ('id', 'status', 'created_at')

    def validate_phone_number(self, value):
        return validate_phone_number(value)

    def validate_testimony_text(self, value):
        return validate_text_min_length(value, 10, 'Testimony text')

    def validate_requested_date(self, value):
        return validate_future_or_today_date(value)


class ChurchFinancialReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChurchFinancialReport
        fields = ('id', 'title', 'period_type', 'period_start', 'period_end', 'total_tithes', 'total_offerings', 'total_expenses', 'notes')

    def validate(self, attrs):
        if attrs.get('period_end') and attrs.get('period_start') and attrs['period_end'] < attrs['period_start']:
            raise serializers.ValidationError({'period_end': 'End date cannot be before start date.'})
        for field in ('total_tithes', 'total_offerings', 'total_expenses'):
            if attrs.get(field) is not None and attrs[field] < 0:
                raise serializers.ValidationError({field: 'Amount cannot be negative.'})
        return attrs


class ChurchBudgetSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChurchBudget
        fields = ('id', 'year', 'total_income', 'total_expenses', 'notes')

    def validate(self, attrs):
        if attrs.get('year') and (attrs['year'] < 2000 or attrs['year'] > 2100):
            raise serializers.ValidationError({'year': 'Year must be between 2000 and 2100.'})
        for field in ('total_income', 'total_expenses'):
            if attrs.get(field) is not None and attrs[field] < 0:
                raise serializers.ValidationError({field: 'Amount cannot be negative.'})
        return attrs


class SabbathEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = SabbathEvent
        fields = ('id', 'date', 'name', 'department', 'leader', 'program_text', 'program_file')


class ChurchSettingsSerializer(serializers.ModelSerializer):
    # Read-only: the settings screen prints this list beside the templates so the
    # wording offered to the church can never drift from what rendering supports.
    invitation_placeholders = serializers.SerializerMethodField()

    def get_invitation_placeholders(self, obj):
        return [{'token': f'{{{name}}}', 'description': help_text} for name, help_text in MEETING_PLACEHOLDERS]

    def validate_board_roles(self, value):
        """Board roles are chosen from the hard-coded role codes.

        Administrator is a system role, so it is always on the board.
        """
        unknown = unknown_role_codes(parse_role_codes(value))
        if unknown:
            raise serializers.ValidationError(f"Unknown role code(s): {', '.join(unknown)}")
        selected = set(parse_role_codes(value)) | {ADMIN_ROLE}
        return [code for code in ROLE_CODES if code in selected]

    class Meta:
        model = ChurchSettings
        fields = (
            'church_name', 'district', 'field', 'conference', 'address', 'latitude', 'longitude', 'midweek_vespers_link',
            'live_service_link', 'live_service_active', 'midweek_vespers_time',
            'friday_vespers_time', 'sabbath_time', 'clarion_call_heading',
            'clarion_call_subtext', 'default_receipt_message', 'receipt_delivery_method',
            'default_business_meeting_invitation_message',
            'default_board_meeting_invitation_message',
            'dashboard_encouragement_line',
            'privacy_policy',
            'terms_of_use',
            'invitation_placeholders',
            'board_roles',
            'invitation_link_lifetime_days',
            'bank_name', 'bank_account_name', 'bank_account_number',
            'bank_branch', 'bank_swift_code', 'bank_paybill_number'
        )


class MembershipTransferRequestSerializer(serializers.ModelSerializer):
    reason = serializers.CharField(required=False, allow_blank=True, default='')
    privacy_accepted = serializers.BooleanField(write_only=True, required=False)
    remain_friend = serializers.BooleanField(required=False, allow_null=True)

    class Meta:
        model = MembershipTransferRequest
        fields = ('id', 'member_name', 'transfer_type', 'other_church', 'reason', 'remain_friend', 'phone_number', 'email', 'status', 'created_at')
        read_only_fields = ('id', 'created_at')

    def to_internal_value(self, data):
        data = data.copy() if hasattr(data, 'copy') else dict(data)
        if 'name' in data and not data.get('member_name'):
            data['member_name'] = str(data['name']).strip()
        return super().to_internal_value(data)

    def validate_phone_number(self, value):
        if value:
            return validate_phone_number(value)
        return value

    def validate_reason(self, value):
        if value and value.strip():
            return validate_text_min_length(value, 3, 'Reason for transfer')
        return value or ''

    def validate_other_church(self, value):
        return validate_text_min_length(value, 2, 'Church name')

    def validate_privacy_accepted(self, value):
        if value is False:
            raise serializers.ValidationError('You must agree to the Privacy Policy.')
        return value


class MembershipRemovalRequestSerializer(serializers.ModelSerializer):
    member_name = serializers.SerializerMethodField()
    member_email = serializers.EmailField(source='member.email', read_only=True)
    requested_by_name = serializers.SerializerMethodField()

    class Meta:
        model = MembershipRemovalRequest
        fields = (
            'id', 'member', 'member_name', 'member_email', 'reason', 'notes',
            'status', 'requested_by', 'requested_by_name', 'reviewed_by',
            'created_at', 'reviewed_at'
        )
        read_only_fields = ('id', 'status', 'requested_by', 'requested_by_name', 'reviewed_by', 'created_at', 'reviewed_at')

    def get_member_name(self, obj):
        return obj.member.get_full_name() or obj.member.username

    def get_requested_by_name(self, obj):
        if not obj.requested_by_id:
            return ''
        return obj.requested_by.get_full_name() or obj.requested_by.username

    def create(self, validated_data):
        privacy_accepted = validated_data.pop('privacy_accepted', None)
        if privacy_accepted:
            validated_data['privacy_accepted_at'] = timezone.now()
        return super().create(validated_data)


class ChurchCorrespondenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChurchCorrespondence
        fields = ('id', 'title', 'sender_or_recipient', 'category', 'body', 'date', 'created_at')
        read_only_fields = ('id', 'created_at')


class BoardMeetingAgendaSerializer(serializers.ModelSerializer):
    document_url = serializers.SerializerMethodField()

    class Meta:
        model = BoardMeetingAgenda
        fields = ('id', 'meeting', 'title', 'description', 'order', 'document', 'document_url', 'document_name', 'created_at')
        read_only_fields = ('id', 'created_at')

    def get_document_url(self, obj):
        if obj.document:
            return obj.document.url
        return None


class BoardMeetingSerializer(serializers.ModelSerializer):
    agendas = BoardMeetingAgendaSerializer(many=True, read_only=True)
    time_range = serializers.SerializerMethodField()

    class Meta:
        model = BoardMeeting
        fields = (
            'id', 'title', 'meeting_date', 'start_time', 'end_time', 'time_range',
            'location', 'agenda', 'minutes', 'status',
            'notify_sms', 'notify_email', 'agendas', 'created_at'
        )
        read_only_fields = ('id', 'created_at')

    def get_time_range(self, obj):
        return obj.time_range_display()


class ChurchNotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChurchNotification
        fields = ('id', 'title', 'message', 'read', 'created_at')
        read_only_fields = ('id', 'created_at')


class VisitationRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = VisitationRequest
        fields = ('id', 'requester_name', 'phone_number', 'email', 'visitation_type', 'preferred_date', 'preferred_time', 'latitude', 'longitude', 'notes', 'status', 'created_at')
        read_only_fields = ('id', 'status', 'created_at')

    def validate_phone_number(self, value):
        return validate_phone_number(value)

    def validate_preferred_date(self, value):
        return validate_future_or_today_date(value)

    def validate_requester_name(self, value):
        return validate_text_min_length(value, 2, 'Requester name')


class CampaignCardAssignmentSerializer(serializers.ModelSerializer):
    member_name = serializers.SerializerMethodField()
    member_email = serializers.SerializerMethodField()
    campaign_name = serializers.CharField(source='campaign.name', read_only=True)
    campaign_title = serializers.CharField(source='campaign.title', read_only=True)
    total_raised = serializers.SerializerMethodField()

    class Meta:
        model = CampaignCardAssignment
        fields = ('id', 'campaign', 'campaign_name', 'campaign_title', 'member', 'member_name', 'member_email', 'group_name', 'referral_token', 'created_at', 'total_raised')
        read_only_fields = ('id', 'referral_token', 'created_at')

    def get_member_name(self, obj):
        name = f"{obj.member.first_name} {obj.member.last_name}".strip()
        return name or obj.member.username

    def get_member_email(self, obj):
        return obj.member.email

    def get_total_raised(self, obj):
        from django.db.models import Sum
        total = obj.contributions.filter(status='completed').aggregate(Sum('amount'))['amount__sum'] or 0
        return float(total)


class FundraisingCampaignSerializer(serializers.ModelSerializer):
    total_raised = serializers.SerializerMethodField()
    percentage_raised = serializers.SerializerMethodField()
    donor_count = serializers.SerializerMethodField()
    assigned_cards_count = serializers.SerializerMethodField()
    group_breakdown = serializers.SerializerMethodField()
    top_fundraisers = serializers.SerializerMethodField()

    class Meta:
        model = FundraisingCampaign
        fields = (
            'id', 'name', 'title', 'account_name', 'description', 'target_amount', 'start_date',
            'end_date', 'is_active', 'is_temporary', 'generate_card', 'target_groups', 'custom_card_image',
            'member_message', 'schedule_message', 'scheduled_at', 'message_frequency', 'message_sent',
            'last_message_sent_at', 'created_by', 'created_at', 'updated_at',
            'total_raised', 'percentage_raised', 'donor_count',
            'assigned_cards_count', 'group_breakdown', 'top_fundraisers'
        )
        read_only_fields = ('id', 'created_at', 'updated_at', 'created_by', 'message_sent', 'last_message_sent_at')

    def validate_target_amount(self, value):
        if value is None or value <= 0:
            raise serializers.ValidationError('Target amount must be a positive number greater than zero.')
        return value

    def validate_name(self, value):
        return validate_text_min_length(value, 3, 'Campaign name')

    def validate(self, attrs):
        if attrs.get('end_date') and attrs.get('start_date') and attrs['end_date'] < attrs['start_date']:
            raise serializers.ValidationError({'end_date': 'End date cannot be before start date.'})
        return attrs

    def get_assigned_cards_count(self, obj):
        return obj.card_assignments.count()

    def get_group_breakdown(self, obj):
        from django.db.models import Sum
        assignments = obj.card_assignments.all()
        breakdown = {}
        for a in assignments:
            grp = a.group_name or 'General'
            raised = a.contributions.filter(status='completed').aggregate(Sum('amount'))['amount__sum'] or 0
            breakdown[grp] = float(breakdown.get(grp, 0) + raised)
        return breakdown

    def get_top_fundraisers(self, obj):
        from django.db.models import Sum
        top = []
        for a in obj.card_assignments.all():
            raised = a.contributions.filter(status='completed').aggregate(Sum('amount'))['amount__sum'] or 0
            if raised > 0:
                name = f"{a.member.first_name} {a.member.last_name}".strip() or a.member.username
                top.append({'name': name, 'group': a.group_name, 'amount': float(raised)})
        top.sort(key=lambda x: x['amount'], reverse=True)
        return top[:10]

    def get_total_raised(self, obj):
        from django.db.models import Sum, Q
        contributions = obj.contributions.filter(status='completed')
        total = contributions.aggregate(Sum('amount'))['amount__sum'] or 0
        if total == 0:
            query = Q(purpose=obj.name)
            if obj.account_name:
                query |= Q(purpose=obj.account_name)
            purpose_total = Contribution.objects.filter(query, status='completed').aggregate(Sum('amount'))['amount__sum'] or 0
            total += purpose_total
        return float(total)

    def get_percentage_raised(self, obj):
        total = self.get_total_raised(obj)
        target = float(obj.target_amount) if obj.target_amount else 0.0
        if target > 0:
            return round((total / target) * 100, 1)
        return 0.0

    def get_donor_count(self, obj):
        from django.db.models import Q
        count1 = obj.contributions.filter(status='completed').count()
        query = Q(purpose=obj.name)
        if obj.account_name:
            query |= Q(purpose=obj.account_name)
        count2 = Contribution.objects.filter(query, status='completed').count()
        return max(count1, count2)


class BusinessMeetingAgendaSerializer(serializers.ModelSerializer):
    document_url = serializers.SerializerMethodField()

    class Meta:
        model = BusinessMeetingAgenda
        fields = ('id', 'meeting', 'title', 'description', 'order', 'document', 'document_url', 'document_name', 'created_at')
        read_only_fields = ('id', 'created_at')

    def get_document_url(self, obj):
        if obj.document:
            return obj.document.url
        return None


class BusinessMeetingSerializer(serializers.ModelSerializer):
    agendas = BusinessMeetingAgendaSerializer(many=True, read_only=True)

    class Meta:
        model = BusinessMeeting
        fields = ('id', 'title', 'meeting_date', 'location', 'status', 'minutes', 'agendas', 'created_at')
        read_only_fields = ('id', 'created_at')


class TreasuryAccountSerializer(serializers.ModelSerializer):
    account_type_display = serializers.CharField(source='get_account_type_display', read_only=True)

    class Meta:
        model = TreasuryAccount
        fields = ('id', 'name', 'account_number', 'account_type', 'account_type_display', 'balance', 'description', 'created_at', 'updated_at')
        read_only_fields = ('id', 'created_at', 'updated_at')


class TreasuryAccountTransactionSerializer(serializers.ModelSerializer):
    account_name = serializers.CharField(source='account.name', read_only=True)
    transaction_type_display = serializers.CharField(source='get_transaction_type_display', read_only=True)
    related_account_name = serializers.CharField(source='related_account.name', read_only=True, default='')

    class Meta:
        model = TreasuryAccountTransaction
        fields = ('id', 'account', 'account_name', 'transaction_type', 'transaction_type_display', 'amount', 'description', 'reference', 'related_account', 'related_account_name', 'created_by', 'created_at')
        read_only_fields = ('id', 'created_at')


class ExpenditureSerializer(serializers.ModelSerializer):
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    account_name = serializers.CharField(source='account.name', read_only=True, default='')
    recorded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Expenditure
        fields = (
            'id', 'title', 'amount', 'category', 'category_display', 'account', 'account_name',
            'payment_method', 'vendor_payee', 'receipt_number', 'expenditure_date', 'notes',
            'recorded_by', 'recorded_by_name', 'created_at'
        )
        read_only_fields = ('id', 'created_at')

    def get_recorded_by_name(self, obj):
        if obj.recorded_by:
            return f"{obj.recorded_by.first_name} {obj.recorded_by.last_name}".strip() or obj.recorded_by.username
        return ''


class InventoryMovementSerializer(serializers.ModelSerializer):
    action_display = serializers.CharField(source='get_action_display', read_only=True)
    state_after_display = serializers.CharField(source='get_state_after_display', read_only=True)

    class Meta:
        model = InventoryMovement
        # The item comes from the URL, so it is never written through this serializer.
        fields = (
            'id', 'item', 'action', 'action_display', 'moved_by', 'destination', 'notes',
            'state_after', 'state_after_display', 'created_at',
        )
        read_only_fields = ('id', 'item', 'created_at')

    def validate_moved_by(self, value):
        if not (value or '').strip():
            raise serializers.ValidationError('Name the officer or department responsible.')
        return value.strip()

    def validate(self, attrs):
        if attrs.get('action') == 'state_change' and not attrs.get('state_after'):
            raise serializers.ValidationError(
                {'state_after': 'Choose the new condition for a state change.'}
            )
        return attrs


class InventoryItemSerializer(serializers.ModelSerializer):
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    state_display = serializers.CharField(source='get_state_display', read_only=True)
    # Annotated by the list view; falls back to 0 when it was not annotated.
    movement_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = InventoryItem
        fields = (
            'id', 'name', 'tag_number', 'category', 'category_display', 'location', 'quantity',
            'state', 'state_display', 'assigned_to', 'checked_out_at', 'notes',
            'last_inspected_on', 'movement_count', 'created_at',
        )
        read_only_fields = ('id', 'created_at')

    def validate_name(self, value):
        name = (value or '').strip()
        if not name:
            raise serializers.ValidationError('Give the item a name.')
        return name

    def validate_quantity(self, value):
        if value is None or value < 1:
            raise serializers.ValidationError('Quantity must be at least 1.')
        return value

    def validate_tag_number(self, value):
        """A tag identifies one item, so two items cannot share one."""
        tag = (value or '').strip()
        if not tag:
            return ''
        existing = InventoryItem.objects.filter(tag_number__iexact=tag)
        if self.instance:
            existing = existing.exclude(pk=self.instance.pk)
        if existing.exists():
            raise serializers.ValidationError(f'Tag "{tag}" is already used by another item.')
        return tag
