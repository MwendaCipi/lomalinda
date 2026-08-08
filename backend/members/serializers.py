from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework import serializers

from .models import Announcement, BoardMeeting, ChildDedicationRequest, ChurchBudget, ChurchCorrespondence, ChurchFinancialReport, ChurchNotification, ChurchSettings, Contribution, EnrollmentRequest, GivingPurpose, MemberProfile, MembershipTransferRequest, PrayerRequest, SabbathEvent, Testimony, VisitationRequest


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

    def create(self, validated_data):
        phone_number = validated_data.pop('phone_number', '')
        user = User.objects.create_user(**validated_data)
        MemberProfile.objects.create(user=user, phone_number=phone_number)
        return user


class EnrollmentRequestSerializer(serializers.ModelSerializer):
    privacy_accepted = serializers.BooleanField(write_only=True)

    class Meta:
        model = EnrollmentRequest
        fields = ('email', 'first_name', 'last_name', 'phone_number', 'joining_mode', 'id_number', 'education_level', 'profession', 'date_of_birth', 'county_of_birth', 'privacy_accepted')

    def validate_privacy_accepted(self, value):
        if not value:
            raise serializers.ValidationError('You must agree to the Privacy Policy.')
        return value


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


class ContributionInitiateSerializer(serializers.Serializer):
    giving_type = serializers.ChoiceField(choices=['financial', 'in_kind'], default='financial')
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0, default=0)
    purpose = serializers.CharField(max_length=120, default='General giving')
    phone_number = serializers.CharField(max_length=20)
    donor_name = serializers.CharField(max_length=160, required=False, allow_blank=True)
    donor_email = serializers.EmailField(required=False, allow_blank=True)
    item_description = serializers.CharField(required=False, allow_blank=True)
    payment_method = serializers.ChoiceField(choices=['mpesa', 'card'], default='mpesa')

    def validate(self, attrs):
        if attrs['giving_type'] == 'financial' and attrs['amount'] < 1:
            raise serializers.ValidationError({'amount': 'Financial giving must be at least KES 1.'})
        if attrs['giving_type'] == 'financial' and attrs.get('payment_method') == 'card' and not attrs.get('donor_email'):
            raise serializers.ValidationError({'donor_email': 'Email is required for card checkout.'})
        if attrs['giving_type'] == 'in_kind' and not attrs.get('item_description'):
            raise serializers.ValidationError({'item_description': 'Describe the item you would like to give.'})
        return attrs


class GivingPurposeSerializer(serializers.ModelSerializer):
    class Meta:
        model = GivingPurpose
        fields = ('id', 'name', 'active')
        read_only_fields = ('id',)


class PrayerRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = PrayerRequest
        fields = ('request_text', 'name', 'phone_number', 'anonymous')


class ChildDedicationRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChildDedicationRequest
        fields = ('id', 'child_name', 'child_dob', 'father_name', 'mother_name', 'phone_number', 'notes', 'status', 'created_at')
        read_only_fields = ('id', 'status', 'created_at')


class TestimonySerializer(serializers.ModelSerializer):
    class Meta:
        model = Testimony
        fields = ('id', 'name', 'phone_number', 'testimony_text', 'status', 'created_at')
        read_only_fields = ('id', 'status', 'created_at')


class ChurchFinancialReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChurchFinancialReport
        fields = ('id', 'title', 'period_type', 'period_start', 'period_end', 'total_tithes', 'total_offerings', 'total_expenses', 'notes')


class ChurchBudgetSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChurchBudget
        fields = ('id', 'year', 'total_income', 'total_expenses', 'notes')


class SabbathEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = SabbathEvent
        fields = ('id', 'date', 'name', 'department', 'leader', 'program_text', 'program_file')


class ChurchSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChurchSettings
        fields = ('church_name', 'address', 'latitude', 'longitude', 'midweek_vespers_link', 'midweek_vespers_time', 'friday_vespers_time', 'sabbath_time')


class MembershipTransferRequestSerializer(serializers.ModelSerializer):
    privacy_accepted = serializers.BooleanField(write_only=True)

    class Meta:
        model = MembershipTransferRequest
        fields = ('id', 'member_name', 'transfer_type', 'other_church', 'phone_number', 'email', 'status', 'clerk_notes', 'created_at')
        read_only_fields = ('id', 'created_at')

    def validate_privacy_accepted(self, value):
        if not value:
            raise serializers.ValidationError('You must agree to the Privacy Policy.')
        return value

    def create(self, validated_data):
        validated_data.pop('privacy_accepted', None)
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

    def validate(self, attrs):
        if attrs.get('latitude') is None or attrs.get('longitude') is None:
            raise serializers.ValidationError({'location': 'Please pin your location on the map before submitting.'})
        return attrs
