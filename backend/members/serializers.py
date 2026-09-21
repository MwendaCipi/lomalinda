from decimal import Decimal
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework import serializers

from .models import (
    Announcement, AnnouncementResponse, BoardMeeting, BoardMeetingAgenda, BusinessMeeting, BusinessMeetingAgenda, CampaignCardAssignment, ChildDedicationRequest, ChurchBudget,
    ChurchCorrespondence, ChurchFinancialReport, ChurchNotification,
    CashContribution, ChurchSettings, Contribution, ContributionReconciliation, EnrollmentRequest, FundraisingCampaign,
    GivingPurpose, InKindContribution, MemberProfile, MembershipRemovalRequest, MembershipTransferRequest, Profession, PrayerRequest,
    SabbathEvent, SupportSubmission, Testimony, TreasuryAccount, TreasuryAccountTransaction, Expenditure, VisitationRequest
)
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
        )


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
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

    def create(self, validated_data):
        phone_number = validated_data.pop('phone_number', '')
        user = User.objects.create_user(**validated_data)
        MemberProfile.objects.create(user=user, phone_number=phone_number)
        return user


class EnrollmentRequestSerializer(serializers.ModelSerializer):
    privacy_accepted = serializers.BooleanField(write_only=True, required=False, default=True)

    class Meta:
        model = EnrollmentRequest
        fields = ('email', 'first_name', 'last_name', 'phone_number', 'joining_mode', 'id_number', 'education_level', 'profession', 'date_of_birth', 'county_of_birth', 'current_church', 'privacy_accepted')

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
    password = serializers.CharField(write_only=True, min_length=8)
    privacy_accepted = serializers.BooleanField(write_only=True)

    def validate_privacy_accepted(self, value):
        if not value:
            raise serializers.ValidationError('You must agree to the Privacy Policy.')
        return value


class AnnouncementResponseSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True, default='')

    class Meta:
        model = AnnouncementResponse
        fields = ('id', 'announcement', 'user', 'username', 'action_type', 'pledge_amount', 'response_text', 'respondent_name', 'respondent_phone', 'created_at')
        read_only_fields = ('id', 'user', 'created_at')


class AnnouncementSerializer(serializers.ModelSerializer):
    responses = AnnouncementResponseSerializer(many=True, read_only=True)
    responses_count = serializers.IntegerField(source='responses.count', read_only=True)
    sharing_option = serializers.CharField(max_length=100, required=False, allow_blank=True)

    class Meta:
        model = Announcement
        fields = ('id', 'title', 'text', 'detail', 'href', 'visibility', 'action_type', 'sharing_option', 'is_popup', 'action_prompt', 'published', 'expires_at', 'created_at', 'responses', 'responses_count')
        read_only_fields = ('id', 'created_at')


class ContributionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Contribution
        fields = ('id', 'amount', 'currency', 'purpose', 'phone_number', 'donor_name', 'payment_method', 'status', 'mpesa_receipt_number', 'paid_at', 'created_at')
        read_only_fields = fields


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


class ContributionInitiateSerializer(serializers.Serializer):
    giving_type = serializers.ChoiceField(choices=['financial'], default='financial')
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0, default=0)
    purpose = serializers.CharField(max_length=120, default='Tithe')
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
        if obj.member:
            full = f"{obj.member.first_name} {obj.member.last_name}".strip()
            return full or obj.member.get_username()
        return obj.donor_name or 'Anonymous'

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
        name = validate_text_min_length(value, 2, 'Giving purpose name').strip()
        words = name.split()
        if len(words) > 2:
            raise serializers.ValidationError('Giving purpose name must be at most 2 words.')
        if len(name) > 20:
            raise serializers.ValidationError('Giving purpose name must be at most 20 characters.')
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
    class Meta:
        model = ChurchSettings
        fields = (
            'church_name', 'district', 'field', 'conference', 'address', 'latitude', 'longitude', 'midweek_vespers_link',
            'live_service_link', 'live_service_active', 'midweek_vespers_time',
            'friday_vespers_time', 'sabbath_time', 'clarion_call_heading',
            'clarion_call_subtext', 'default_receipt_message',
            'default_business_meeting_invitation_message',
            'default_board_meeting_invitation_message',
            'board_roles',
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
    reference_file_url = serializers.SerializerMethodField()

    class Meta:
        model = BoardMeeting
        fields = (
            'id', 'title', 'meeting_date', 'meeting_time', 'location', 'agenda',
            'minutes', 'status', 'reference_file', 'reference_file_url',
            'notify_sms', 'notify_email', 'agendas', 'created_at'
        )
        read_only_fields = ('id', 'created_at')

    def get_reference_file_url(self, obj):
        if obj.reference_file:
            return obj.reference_file.url
        return None


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
