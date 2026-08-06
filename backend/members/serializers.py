from django.contrib.auth.models import User
from rest_framework import serializers

from .models import Announcement, ChildDedicationRequest, ChurchBudget, ChurchFinancialReport, ChurchSettings, Contribution, EnrollmentRequest, GivingPurpose, MemberProfile, PrayerRequest, SabbathEvent, Testimony


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
    class Meta:
        model = EnrollmentRequest
        fields = ('email', 'first_name', 'last_name', 'phone_number')


class EnrollmentCompleteSerializer(serializers.Serializer):
    token = serializers.UUIDField()
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True, min_length=8)


class AnnouncementSerializer(serializers.ModelSerializer):
    class Meta:
        model = Announcement
        fields = ('id', 'title', 'text', 'detail', 'href', 'visibility', 'published', 'expires_at', 'created_at')
        read_only_fields = ('id', 'created_at')


class ContributionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Contribution
        fields = ('id', 'amount', 'currency', 'purpose', 'phone_number', 'donor_name', 'status', 'mpesa_receipt_number', 'paid_at', 'created_at')
        read_only_fields = fields


class ContributionInitiateSerializer(serializers.Serializer):
    giving_type = serializers.ChoiceField(choices=['financial', 'in_kind'], default='financial')
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0, default=0)
    purpose = serializers.CharField(max_length=120, default='General giving')
    phone_number = serializers.CharField(max_length=20)
    donor_name = serializers.CharField(max_length=160, required=False, allow_blank=True)
    donor_email = serializers.EmailField(required=False, allow_blank=True)
    item_description = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        if attrs['giving_type'] == 'financial' and attrs['amount'] < 1:
            raise serializers.ValidationError({'amount': 'Financial giving must be at least KES 1.'})
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
        fields = ('request_text', 'name', 'email', 'anonymous')


class ChildDedicationRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChildDedicationRequest
        fields = ('id', 'parent_name', 'child_name', 'child_dob', 'phone_number', 'email', 'requested_date', 'notes', 'status', 'created_at')
        read_only_fields = ('id', 'status', 'created_at')


class TestimonySerializer(serializers.ModelSerializer):
    class Meta:
        model = Testimony
        fields = ('id', 'name', 'testimony_text', 'status', 'created_at')
        read_only_fields = ('id', 'status', 'created_at')


class ChurchFinancialReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChurchFinancialReport
        fields = ('id', 'title', 'period_start', 'period_end', 'total_tithes', 'total_offerings', 'total_expenses', 'notes')


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
