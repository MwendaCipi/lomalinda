from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework import serializers

from .models import (
    Announcement, BoardMeeting, ChildDedicationRequest, ChurchBudget,
    ChurchCorrespondence, ChurchFinancialReport, ChurchNotification,
    ChurchSettings, Contribution, EnrollmentRequest, FundraisingCampaign,
    GivingPurpose, MemberProfile, MembershipTransferRequest, PrayerRequest,
    SabbathEvent, SupportSubmission, Testimony, VisitationRequest
)
from .validators import (
    validate_future_or_today_date, validate_national_id,
    validate_past_or_today_date, validate_phone_number,
    validate_positive_amount, validate_text_min_length
)


class UserDetailSerializer(serializers.ModelSerializer):
    role = serializers.CharField(source='member_profile.role', read_only=True)
    phone_number = serializers.CharField(source='member_profile.phone_number', read_only=True)
    account_type = serializers.CharField(source='member_profile.account_type', read_only=True)

    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'first_name', 'last_name', 'role', 'phone_number', 'account_type')


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
    privacy_accepted = serializers.BooleanField(write_only=True)

    class Meta:
        model = EnrollmentRequest
        fields = ('email', 'first_name', 'last_name', 'phone_number', 'joining_mode', 'id_number', 'education_level', 'profession', 'date_of_birth', 'county_of_birth', 'current_church', 'privacy_accepted')

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


class AnnouncementSerializer(serializers.ModelSerializer):
    class Meta:
        model = Announcement
        fields = ('id', 'title', 'text', 'detail', 'href', 'visibility', 'published', 'expires_at', 'created_at')
        read_only_fields = ('id', 'created_at')


class ContributionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Contribution
        fields = ('id', 'amount', 'currency', 'purpose', 'phone_number', 'donor_name', 'payment_method', 'status', 'mpesa_receipt_number', 'paid_at', 'created_at')
        read_only_fields = fields


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
    giving_type = serializers.ChoiceField(choices=['financial', 'in_kind'], default='financial')
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0, default=0)
    purpose = serializers.CharField(max_length=120, default='General giving')
    phone_number = serializers.CharField(max_length=20, required=False, allow_blank=True)
    donor_name = serializers.CharField(max_length=160, required=False, allow_blank=True)
    donor_email = serializers.EmailField(required=False, allow_blank=True)
    item_description = serializers.CharField(required=False, allow_blank=True)
    payment_method = serializers.ChoiceField(choices=['mpesa', 'card'], default='mpesa')

    def validate_phone_number(self, value):
        if value:
            return validate_phone_number(value)
        return value

    def validate(self, attrs):
        if attrs['giving_type'] == 'financial':
            if attrs['amount'] < 1:
                raise serializers.ValidationError({'amount': 'Financial giving must be at least KES 1.'})
            if attrs.get('payment_method') == 'mpesa' and not attrs.get('phone_number'):
                raise serializers.ValidationError({'phone_number': 'Phone number is required for M-Pesa payments.'})
            if attrs.get('payment_method') == 'card' and not attrs.get('donor_email'):
                raise serializers.ValidationError({'donor_email': 'Email is required for card checkout.'})
        if attrs['giving_type'] == 'in_kind' and not attrs.get('item_description'):
            raise serializers.ValidationError({'item_description': 'Describe the item you would like to give.'})
        return attrs


class GivingPurposeSerializer(serializers.ModelSerializer):
    class Meta:
        model = GivingPurpose
        fields = ('id', 'name', 'active')
        read_only_fields = ('id',)

    def validate_name(self, value):
        return validate_text_min_length(value, 2, 'Giving purpose name')


class PrayerRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = PrayerRequest
        fields = ('request_text', 'name', 'phone_number', 'anonymous')

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
        fields = ('church_name', 'address', 'latitude', 'longitude', 'midweek_vespers_link', 'live_service_link', 'live_service_active', 'midweek_vespers_time', 'friday_vespers_time', 'sabbath_time')


class MembershipTransferRequestSerializer(serializers.ModelSerializer):
    reason = serializers.CharField(required=True, allow_blank=False)
    privacy_accepted = serializers.BooleanField(write_only=True, required=False)

    class Meta:
        model = MembershipTransferRequest
        fields = ('id', 'member_name', 'transfer_type', 'other_church', 'reason', 'phone_number', 'email', 'status', 'clerk_notes', 'created_at')
        read_only_fields = ('id', 'created_at')

    def validate_phone_number(self, value):
        return validate_phone_number(value)

    def validate_reason(self, value):
        return validate_text_min_length(value, 5, 'Reason for transfer')

    def validate_other_church(self, value):
        return validate_text_min_length(value, 3, 'Destination church name')

    def validate_privacy_accepted(self, value):
        if value is False:
            raise serializers.ValidationError('You must agree to the Privacy Policy.')
        return value

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


class BoardMeetingSerializer(serializers.ModelSerializer):
    class Meta:
        model = BoardMeeting
        fields = ('id', 'title', 'meeting_date', 'agenda', 'minutes', 'status', 'reference_file', 'created_at')
        read_only_fields = ('id', 'created_at')


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

    def validate(self, attrs):
        if attrs.get('latitude') is None or attrs.get('longitude') is None:
            raise serializers.ValidationError({'location': 'Please pin your location on the map before submitting.'})
        return attrs


class FundraisingCampaignSerializer(serializers.ModelSerializer):
    total_raised = serializers.SerializerMethodField()
    percentage_raised = serializers.SerializerMethodField()
    donor_count = serializers.SerializerMethodField()

    class Meta:
        model = FundraisingCampaign
        fields = (
            'id', 'name', 'title', 'description', 'target_amount', 'start_date',
            'end_date', 'is_active', 'generate_card', 'custom_card_image',
            'created_by', 'created_at', 'updated_at',
            'total_raised', 'percentage_raised', 'donor_count'
        )
        read_only_fields = ('id', 'created_at', 'updated_at', 'created_by')

    def validate_target_amount(self, value):
        if value < 100:
            raise serializers.ValidationError('Target amount must be at least KES 100.')
        return value

    def validate_name(self, value):
        return validate_text_min_length(value, 3, 'Campaign name')

    def validate(self, attrs):
        if attrs.get('end_date') and attrs.get('start_date') and attrs['end_date'] < attrs['start_date']:
            raise serializers.ValidationError({'end_date': 'End date cannot be before start date.'})
        return attrs

    def get_total_raised(self, obj):
        from django.db.models import Sum
        contributions = obj.contributions.filter(status='completed')
        total = contributions.aggregate(Sum('amount'))['amount__sum'] or 0
        if total == 0:
            purpose_total = Contribution.objects.filter(purpose=obj.name, status='completed').aggregate(Sum('amount'))['amount__sum'] or 0
            total += purpose_total
        return float(total)

    def get_percentage_raised(self, obj):
        total = self.get_total_raised(obj)
        target = float(obj.target_amount) if obj.target_amount else 0.0
        if target > 0:
            return round((total / target) * 100, 1)
        return 0.0

    def get_donor_count(self, obj):
        count1 = obj.contributions.filter(status='completed').count()
        count2 = Contribution.objects.filter(purpose=obj.name, status='completed').count()
        return max(count1, count2)
