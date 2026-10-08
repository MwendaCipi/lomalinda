import re
from decimal import Decimal
from django.conf import settings
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework import serializers

from .models import (
    Announcement, AnnouncementResponse, BoardMeeting, BoardMeetingAgenda, BusinessMeeting, BusinessMeetingAgenda, CampaignCardAssignment, ChildDedicationRequest, ChurchBudget,
    ChurchCorrespondence, ChurchEvent, ChurchEventMedia, ChurchFinancialReport, ChurchNotification,
    CashContribution, ChurchSettings, Contribution, ContributionReconciliation, Department, EnrollmentRequest, FundraisingCampaign, Invitation,
    InKindContribution, InventoryItem, InventoryMovement, MemberProfile, MpesaRefund, MembershipRemovalRequest, MembershipTransferRequest, PrayerRequest,
    ProfileChangeRequest, Profession,
    giver_display_name,
    SabbathEvent, SupportSubmission, Testimony, TreasuryAccount, TreasuryAccountTransaction, Expenditure, VisitationRequest,
    WeeklyMeeting,
    ChildrenGroup, ChildRecord, Pathfinder,
)
from .meetings import APPOINTMENT_PLACEHOLDERS, PLACEHOLDERS as MEETING_PLACEHOLDERS
from .requests import APPROVAL_PLACEHOLDERS, REQUEST_PLACEHOLDERS
from .password_policy import MIN_LENGTH as PASSWORD_MIN_LENGTH, REQUIREMENTS_TEXT as PASSWORD_REQUIREMENTS, validate_church_password
from .roles import ADMIN_ROLE, ROLE_CODES, parse_role_codes, unknown_audience_codes, unknown_role_codes
from .validators import (
    validate_future_or_today_date, validate_national_id,
    validate_past_or_today_date, validate_phone_number,
    validate_positive_amount, validate_text_min_length
)


class UserDetailSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()
    roles = serializers.SerializerMethodField()
    # The subset of ``roles`` this member shares as an assistant.
    assistant_roles = serializers.SerializerMethodField()
    phone_number = serializers.CharField(source='member_profile.phone_number', read_only=True, default='')
    current_church = serializers.CharField(source='member_profile.current_church', read_only=True, default='')
    baptismal_status = serializers.CharField(source='member_profile.baptismal_status', read_only=True, default='')
    account_type = serializers.CharField(source='member_profile.account_type', read_only=True, default='regular')
    profession = serializers.CharField(source='member_profile.profession', read_only=True, default='')
    residence = serializers.CharField(source='member_profile.residence', read_only=True, default='')

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

    def get_assistant_roles(self, obj):
        profile = getattr(obj, 'member_profile', None)
        return profile.get_assistant_roles() if profile else []
    gender = serializers.CharField(source='member_profile.gender', read_only=True)
    date_of_birth = serializers.DateField(source='member_profile.date_of_birth', read_only=True)
    gifts = serializers.CharField(source='member_profile.gifts', read_only=True)
    whatsapp_number = serializers.CharField(source='member_profile.whatsapp_number', read_only=True)
    ministry = serializers.CharField(source='member_profile.ministry', read_only=True)
    department = serializers.CharField(source='member_profile.department', read_only=True, default='')
    # The same ties as records: the one department the member belongs to and
    # the ministries they serve in, both by code.
    department_ref = serializers.SerializerMethodField()
    ministries = serializers.SerializerMethodField()
    disability = serializers.CharField(source='member_profile.disability', read_only=True)

    def get_department_ref(self, obj):
        profile = getattr(obj, 'member_profile', None)
        return profile.department_ref.code if profile and profile.department_ref else ''

    def get_ministries(self, obj):
        profile = getattr(obj, 'member_profile', None)
        return list(profile.ministries.values_list('code', flat=True)) if profile else []
    is_disfellowshipped = serializers.BooleanField(source='member_profile.is_disfellowshipped', read_only=True, default=False)
    # Friends and Sabbath School attendees join as inactive accounts; leadership
    # sees this on the roster so "Confirmed" never reads as "can sign in".
    is_active = serializers.BooleanField(read_only=True)
    # Set when an officer switched the account off, which tells the roster a
    # deactivated member from one merely waiting for approval — both are
    # inactive, and only one of them can be switched back on.
    deactivated_at = serializers.DateTimeField(
        source='member_profile.deactivated_at', read_only=True, default=None,
    )
    # True when a proposed profile edit is waiting for this member's approval;
    # the roster shows a badge so the office knows the ball is in their court.
    pending_profile_change = serializers.SerializerMethodField()

    def get_pending_profile_change(self, obj):
        return ProfileChangeRequest.objects.filter(member=obj, status='pending').exists()

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
            'assistant_roles',
            'phone_number',
            'whatsapp_number',
            'current_church',
            'baptismal_status',
            'account_type',
            'profession',
            'residence',
            'gender',
            'date_of_birth',
            'gifts',
            'ministry',
            'department',
            'department_ref',
            'ministries',
            'disability',
            'is_disfellowshipped',
            'is_active',
            'deactivated_at',
            'pending_profile_change',
            # The installation's owner account is not a member; the roster
            # endpoints filter it out and the clients use this to be sure.
            'is_superuser',
        )


class ProfileChangeRequestSerializer(serializers.ModelSerializer):
    """One proposed profile edit, shaped for the member's approval card."""

    proposed_by_name = serializers.SerializerMethodField()

    def get_proposed_by_name(self, obj):
        proposer = obj.proposed_by
        if not proposer:
            return 'The church office'
        return proposer.get_full_name().strip() or proposer.get_username()

    class Meta:
        model = ProfileChangeRequest
        fields = ('id', 'changes', 'proposed_by_name', 'proposed_at', 'status')
        read_only_fields = fields


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
        fields = ('email', 'first_name', 'last_name', 'phone_number', 'joining_mode', 'id_number', 'education_level', 'profession', 'residence', 'date_of_birth', 'county_of_birth', 'current_church', 'privacy_accepted', 'terms_accepted')

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
        # Two paths arrive from a named church: a friend, and a membership
        # transfer that is leaving one. A plain "a church member" request is
        # asking to be added to this roll and names no church.
        mode = attrs.get('joining_mode')
        if mode in ('friend', 'transfer_in') and not attrs.get('current_church', '').strip():
            message = (
                'Enter the church you are transferring from.'
                if mode == 'transfer_in'
                else 'Enter your current church.'
            )
            raise serializers.ValidationError({'current_church': message})
        return attrs


class EnrollmentCompleteSerializer(serializers.Serializer):
    # The account is completed with the emailed verification code, not a link:
    # both account-creation doors (sign-up and invitation) are typed-code forms,
    # so a code typed wrong once can simply be retyped. The lookup uses the
    # normalized uppercase form, matching how the code was hashed.
    code = serializers.CharField(max_length=20)
    username = serializers.CharField(max_length=150)
    phone_number = serializers.CharField(max_length=20, required=False, allow_blank=True)
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
    # An invitation is redeemed either by the link token or by the code the
    # email prints under it, so neither is required on its own; the view
    # refuses the request when they both come up empty.
    token = serializers.UUIDField(required=False)
    code = serializers.CharField(max_length=20, required=False, allow_blank=True)
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
        fields = ('id', 'announcement', 'user', 'username', 'action_type', 'pledge_amount', 'response_text', 'response_choice', 'respondent_name', 'respondent_phone', 'created_at')
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


IMAGE_SUFFIX_PATTERN = re.compile(r'\.(png|jpe?g|gif|webp|avif|bmp|heic|heif)$', re.IGNORECASE)
VIDEO_SUFFIX_PATTERN = re.compile(r'\.(mp4|mov|webm|avi|mkv|m4v|3gp|mpg|mpeg)$', re.IGNORECASE)


class ChurchEventMediaSerializer(serializers.ModelSerializer):
    """One picture or video of an event's album.

    The reader gets the file's URL, its original name (so a tile can label a
    download) and whether it plays as video — every moment the tiles need,
    and nothing that would leak the server's file layout.
    """
    file_name = serializers.SerializerMethodField()
    is_video = serializers.SerializerMethodField()

    class Meta:
        model = ChurchEventMedia
        fields = ('id', 'url', 'file_name', 'is_video', 'created_at')
        read_only_fields = fields

    def get_file_name(self, obj):
        return obj.file.name.rsplit('/', 1)[-1] if obj.file else None

    def get_is_video(self, obj):
        return not IMAGE_SUFFIX_PATTERN.search(obj.file.name or '')


class ChurchEventSerializer(serializers.ModelSerializer):
    """An event's album: its words, its day, and every picture and video.

    Creating carries the album's files in one request — ``media_files``, a
    list of uploads — so an officer picks the day's pictures once. Editing
    adds more files the same way, or takes one down with ``remove_media_ids``
    (which also deletes the file from storage). ``posted_by_name`` credits
    whoever posted it, the way a receipt greets its giver.
    """
    media = ChurchEventMediaSerializer(many=True, read_only=True)
    media_files = serializers.ListField(
        child=serializers.FileField(),
        write_only=True,
        required=False,
        help_text="New pictures or videos to add to the album",
    )
    remove_media_ids = serializers.ListField(
        child=serializers.IntegerField(),
        write_only=True,
        required=False,
        help_text="Ids of media to remove from the album (files are deleted)",
    )
    posted_by_name = serializers.SerializerMethodField()
    media_count = serializers.IntegerField(source='media.count', read_only=True)

    class Meta:
        model = ChurchEvent
        fields = (
            'id', 'title', 'description', 'happened_on', 'published',
            'posted_by_name', 'media_count', 'media',
            'media_files', 'remove_media_ids', 'created_at',
        )
        read_only_fields = ('created_at',)

    def get_posted_by_name(self, obj):
        if not obj.posted_by_id:
            return None
        return giver_display_name('', member=obj.posted_by) or 'Member'

    def validate_title(self, value):
        title = (value or '').strip()
        if not title:
            raise serializers.ValidationError('Give the event a title, e.g. Baptism 3rd October 2026.')
        return title

    def validate_media_files(self, files):
        if len(files) > 30:
            raise serializers.ValidationError('An album takes at most 30 files at once.')
        for file in files:
            name = getattr(file, 'name', '') or ''
            if not (IMAGE_SUFFIX_PATTERN.search(name) or VIDEO_SUFFIX_PATTERN.search(name)):
                raise serializers.ValidationError(f'"{name}" is neither a picture nor a video an album can hold.')
        return files

    def _save_uploaded_files(self, event, files, user):
        ChurchEventMedia.objects.bulk_create([
            ChurchEventMedia(event=event, file=file, uploaded_by=user)
            for file in files
        ])

    def _remove_media(self, event, media_ids):
        for media in event.media.filter(pk__in=media_ids):
            file = media.file
            media.delete()
            if file:
                file.delete(save=False)

    def create(self, validated_data):
        files = validated_data.pop('media_files', [])
        validated_data.pop('remove_media_ids', None)
        request = self.context.get('request')
        event = ChurchEvent.objects.create(**validated_data)
        self._save_uploaded_files(event, files, request.user if request else None)
        return event

    def update(self, instance, validated_data):
        files = validated_data.pop('media_files', [])
        media_ids = validated_data.pop('remove_media_ids', None)
        request = self.context.get('request')
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        if files:
            self._save_uploaded_files(instance, files, request.user if request else None)
        if media_ids:
            self._remove_media(instance, media_ids)
        return instance


class AnnouncementSerializer(serializers.ModelSerializer):
    responses = AnnouncementResponseSerializer(many=True, read_only=True)
    responses_count = serializers.IntegerField(source='responses.count', read_only=True)
    sharing_option = serializers.CharField(max_length=100, required=False, allow_blank=True)
    attachment_name = serializers.SerializerMethodField()
    attachment_size = serializers.SerializerMethodField()
    # Fund drives ride in the announcements feed with their numbers and the
    # Give now / Pledge affordances; None for ordinary announcements.
    kind = serializers.SerializerMethodField()
    # Writing the link takes a drive's id; reading returns the drive's numbers.
    campaign = serializers.PrimaryKeyRelatedField(
        queryset=FundraisingCampaign.objects.all(),
        required=False,
        allow_null=True,
        write_only=True,
    )
    campaign_id = serializers.IntegerField(read_only=True, allow_null=True)
    fund_drive = serializers.SerializerMethodField()
    # Promotion posts mint their own fund drive: this is the goal it opens
    # with (write-only; the drive's numbers read back through ``fund_drive``).
    promotion_target = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, allow_null=True, write_only=True,
    )

    FUND_DRIVE_FIELDS = ('id', 'name', 'title', 'description', 'target_amount', 'total_raised', 'percentage_raised', 'end_date', 'donor_count', 'attachment', 'attachment_name', 'attachment_size')

    def get_kind(self, obj):
        return 'fund_drive' if obj.campaign_id else 'announcement'

    def get_fund_drive(self, obj):
        if not obj.campaign_id:
            return None
        return FundraisingCampaignSerializer(obj.campaign, read_only=True, fields=self.FUND_DRIVE_FIELDS).data

    def get_attachment_name(self, obj):
        """Original file name, so the UI can label an attachment without guessing from the URL."""
        if not obj.attachment:
            return None
        return obj.attachment.name.rsplit('/', 1)[-1]

    support_account_display = serializers.SerializerMethodField()

    def get_support_account_display(self, obj):
        """The account label the feed's Give now button names.

        The stored value is the label the officer picked in the form (the
        description, falling back to the name); a treasury account may have
        been renamed since, so the current description is preferred when one
        matches by either spelling.
 """
        wanted = (obj.support_account or '').strip()
        if not wanted:
            return None
        match = (TreasuryAccount.objects.filter(description=wanted).first()
                 or TreasuryAccount.objects.filter(name=wanted).first())
        if match:
            return match.description or match.name
        return wanted

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
        normalized = (value or '').replace('\r\n', '\n')
        if len(normalized) > 500:
            raise serializers.ValidationError('Announcement text must be 500 characters or fewer.')
        return normalized

    def validate_audience(self, value):
        codes = value or []
        # ``dept_*`` codes are the department table's own — a department the
        # desk added announces like the originals — so they validate against
        # it, not the fixed vocabulary.
        fixed = [code for code in codes if not code.startswith('dept_')]
        unknown = unknown_audience_codes(fixed)
        if unknown:
            raise serializers.ValidationError(
                f'Unknown ministry: {unknown[0].replace("_", " ")}.'
            )
        dept_codes = {code.removeprefix('dept_') for code in codes if code.startswith('dept_')}
        if dept_codes:
            known = set(Department.objects.filter(code__in=dept_codes, is_active=True).values_list('code', flat=True))
            missing = dept_codes - known
            if missing:
                raise serializers.ValidationError(
                    f'Unknown department: {sorted(missing)[0].replace("_", " ")}.'
                )
        # Duplicates would double-count an addressing; a list of codes is a set.
        return list(dict.fromkeys(codes))

    def validate(self, attrs):
        instance = self.instance
        start = attrs.get('event_date_from', instance.event_date_from if instance else None)
        end = attrs.get('event_date_to', instance.event_date_to if instance else None)
        if start and end and end < start:
            raise serializers.ValidationError('The event cannot end before it starts.')

        # The type decides which special fields belong to the post. Fields a
        # type does not use are cleared, so the stored row always matches the
        # form the officer completed; the link is required where it is the
        # whole point (web conference), and the options where the question is
        # a closed one (opinion).
        announcement_type = attrs.get('announcement_type', instance.announcement_type if instance else 'awareness')
        if announcement_type == 'web_conference':
            href = attrs.get('href') if 'href' in attrs else (instance.href if instance else '')
            if not (href or '').strip():
                raise serializers.ValidationError('A web conference announcement needs a meeting link.')
            attrs['support_account'] = ''
            attrs['response_mode'] = ''
            attrs['response_options'] = ''
            attrs['action_type'] = 'none'
        elif announcement_type == 'promotion':
            attrs['href'] = ''
            support_account = attrs.get('support_account') if 'support_account' in attrs else (instance.support_account if instance else '')
            if not (support_account or '').strip():
                raise serializers.ValidationError('A promotion / contribution announcement needs a treasury account.')
            # A promotion is a drive: on create it must open with a goal. An
            # edit of a post that already carries its drive needs no target —
            # the drive's numbers are managed on the drive itself.
            if instance is None:
                target = attrs.get('promotion_target')
                if target is None or float(target) <= 0:
                    raise serializers.ValidationError('A promotion announcement needs a target amount for its fund drive.')
            attrs['response_mode'] = ''
            attrs['response_options'] = ''
            attrs['action_type'] = 'none'
        elif announcement_type == 'opinion':
            attrs['href'] = ''
            attrs['support_account'] = ''
            attrs['action_type'] = 'respond'
            mode = attrs.get('response_mode') or 'open'
            if mode not in ('open', 'closed'):
                raise serializers.ValidationError('An opinion post answers openly or among fixed options.')
            options_text = attrs.get('response_options') if 'response_options' in attrs else (instance.response_options if instance else '')
            if mode == 'closed':
                options = [line.strip() for line in (options_text or '').splitlines() if line.strip()]
                if len(options) < 2:
                    raise serializers.ValidationError('A closed-response opinion needs at least two options, one per line.')
                # The stored options are the cleaned lines, so the buttons a
                # member sees and the choice saved are always the same words.
                attrs['response_options'] = '\n'.join(options)
            else:
                attrs['response_options'] = ''
        else:  # awareness: a plain notice carries no link, no account, no question
            attrs['href'] = ''
            attrs['support_account'] = ''
            attrs['response_mode'] = ''
            attrs['response_options'] = ''
            attrs['action_type'] = 'none'
        return attrs

    class Meta:
        model = Announcement
        fields = ('id', 'title', 'text', 'detail', 'href', 'visibility', 'audience', 'announcement_type', 'action_type', 'support_account', 'support_account_display', 'response_mode', 'response_options', 'attachment', 'attachment_name', 'attachment_size', 'sharing_option', 'is_popup', 'action_prompt', 'campaign', 'campaign_id', 'promotion_target', 'kind', 'fund_drive', 'published', 'starts_at', 'expires_at', 'event_date_from', 'event_date_to', 'created_at', 'responses', 'responses_count')
        read_only_fields = ('id', 'created_at', 'campaign_id')


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


class CashContributionAllocationSerializer(serializers.Serializer):
    """One giving purpose and how much of a desk receipt goes to it."""
    purpose = serializers.CharField(max_length=120)
    amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal('0.01'),
        error_messages={'min_value': 'Each giving purpose needs at least KES 0.01.'},
    )


class CashContributionSerializer(serializers.ModelSerializer):
    received_by_name = serializers.CharField(source='received_by.get_full_name', read_only=True)
    # One receipt may cover several giving purposes — the same split, one
    # amount per account, that the give-money form posts as `allocations`.
    # Absent for an ordinary single-purpose receipt, which is unchanged.
    allocations = CashContributionAllocationSerializer(many=True, required=False, write_only=True)

    class Meta:
        model = CashContribution
        fields = (
            'id', 'received_on', 'amount', 'purpose', 'entry_type', 'payment_method',
            'item_description', 'donor_name', 'giver_phone', 'giver_email', 'receipt_number',
            'notes', 'received_by_name', 'created_at', 'receipt_sent_at', 'allocations'
        )
        read_only_fields = ('id', 'received_by_name', 'created_at')

    def validate(self, data):
        allocations = data.get('allocations')
        if allocations:
            purposes = [row['purpose'].strip() for row in allocations if row['purpose'].strip()]
            if len(purposes) != len(allocations):
                raise serializers.ValidationError({'allocations': 'Each giving purpose needs a name.'})
            if len(set(purposes)) != len(purposes):
                raise serializers.ValidationError({'allocations': 'Each giving purpose may appear only once.'})
            # The gift's total is the sum of its parts; the header amount and
            # purpose are derived from them so every reader sees one payment.
            data['amount'] = sum((row['amount'] for row in allocations), Decimal('0'))
            data['purpose'] = purposes[0]
            return data
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
    # The short account name Safaricom shows in the prompt (12 characters);
    # absent on older clients, where the purpose string doubles as the account.
    account = serializers.CharField(max_length=12, required=False, allow_blank=True)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=1,
                                      error_messages={'min_value': 'Each account needs at least KES 1.'})


class MemberEmailSerializer(serializers.Serializer):
    """The one profile field a member may set for themselves.

    Receipts are addressed from the account (see receipt_email_for), so a
    member with no address on file had no way to ever receive one. This is the
    narrow door that lets them fix it — nothing else about the account is
    writable from here. Now optional: a PATCH may carry only the notification
    switches (announce_email / announce_push) and leave the address untouched.
    """

    email = serializers.EmailField(required=False, allow_blank=True)

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
    # Anonymous givers stamp the request; the ledger records the gift under
    # the phone it was paid from, never under this person's name.
    anonymous = serializers.BooleanField(default=False)
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

        from .treasury import account_reference_for

        # Anonymous: the gift is not recorded against this person. The phone
        # it was paid from is the only thing that carries it, so its name and
        # email stay unbound from the row that the callback writes.
        if attrs.get('anonymous'):
            attrs['donor_name'] = ''
            attrs['donor_email'] = ''

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
            # The wording a giver read (the account's description) names the
            # account in the ledger, but Safaricom's prompt must show the short
            # reference the church uses for the account itself ('AYM'), not the
            # description run together ('ADVENTISTYOUTHMINISTRY'). Resolve it
            # against the treasury accounts; an account the list does not know
            # still prompts with whatever wording it was given.
            shown = (
                account_reference_for(row.get('account'))
                or account_reference_for(purpose)
                or (row.get('account') or purpose)
            )
            cleaned.append({
                'purpose': purpose,
                'account': shown[:12],
                'amount': row['amount'],
            })

        if cleaned:
            attrs['allocations'] = cleaned
            # amount/purpose stay filled in as the payment's total and its label:
            # the M-Pesa push is sent once, for the whole gift.
            attrs['amount'] = sum(row['amount'] for row in cleaned)
            attrs['purpose'] = cleaned[0]['purpose'] if len(cleaned) == 1 else f"{len(cleaned)} accounts"
        else:
            attrs['allocations'] = [{
                'purpose': attrs['purpose'],
                'account': (account_reference_for(attrs['purpose']) or attrs['purpose'])[:12],
                'amount': attrs['amount'],
            }]

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
        fields = ('id', 'request_text', 'name', 'email', 'phone_number', 'anonymous', 'audience', 'created_at')
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


class ChildrenGroupSerializer(serializers.ModelSerializer):
    children_count = serializers.IntegerField(source='children.count', read_only=True)

    class Meta:
        model = ChildrenGroup
        fields = ('id', 'name', 'code', 'min_age', 'max_age', 'description', 'sort_order', 'is_active', 'children_count')


class ChildRecordSerializer(serializers.ModelSerializer):
    group_name = serializers.CharField(source='group.name', read_only=True)
    computed_age = serializers.SerializerMethodField()

    class Meta:
        model = ChildRecord
        fields = (
            'id', 'first_name', 'last_name', 'gender', 'date_of_birth', 'age',
            'group', 'group_name', 'unit', 'parent', 'guardian_name',
            'guardian_phone', 'guardian_email', 'notes', 'is_active',
            'computed_age', 'created_at',
        )
        read_only_fields = ('id', 'created_at')

    def get_computed_age(self, obj):
        return obj.get_computed_age()

    def create(self, validated_data):
        group = validated_data.get('group')
        dob = validated_data.get('date_of_birth')
        age = validated_data.get('age')

        if not group:
            computed_age = None
            if dob:
                today = timezone.localdate()
                computed_age = today.year - dob.year - (
                    (today.month, today.day) < (dob.month, dob.day)
                )
            elif age is not None:
                computed_age = age

            if computed_age is not None:
                group = ChildrenGroup.get_group_for_age(computed_age)
                validated_data['group'] = group

        if group and not validated_data.get('unit'):
            validated_data['unit'] = group.name

        return super().create(validated_data)


class PathfinderSerializer(serializers.ModelSerializer):
    class_display = serializers.CharField(source='get_pathfinder_class_display', read_only=True)

    class Meta:
        model = Pathfinder
        fields = (
            'id', 'child', 'member', 'first_name', 'last_name', 'pathfinder_class',
            'class_display', 'rank', 'guardian_name', 'guardian_phone', 'enrolled_at',
            'is_active', 'created_at',
        )
        read_only_fields = ('id', 'created_at')


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
    """A statement in the field's own language: Trust Fund, Local Church
    Offerings, Expenditure and the Total in hand. The stored columns keep
    their long-standing names; what an API reader sees is the report the NEKF
    offering summary spells out, with the total — the local offerings less
    what was spent, the trust fund held apart — computed here so it can never
    disagree with the three figures it is drawn from."""

    trust_fund = serializers.DecimalField(
        max_digits=14, decimal_places=2, source='total_tithes', required=False,
    )
    local_church_offerings = serializers.DecimalField(
        max_digits=14, decimal_places=2, source='total_offerings', required=False,
    )
    expenditure = serializers.DecimalField(
        max_digits=14, decimal_places=2, source='total_expenses', required=False,
    )
    total = serializers.DecimalField(
        max_digits=14, decimal_places=2, read_only=True,
    )

    class Meta:
        model = ChurchFinancialReport
        fields = (
            'id', 'title', 'period_type', 'period_start', 'period_end',
            'trust_fund', 'local_church_offerings', 'expenditure', 'total', 'notes',
            # The desk decides who reads it: a draft is the treasurer's own
            # working copy and is hidden from the congregation until published.
            'published_to_members', 'created_at',
        )

    def validate_title(self, value):
        title = str(value or '').strip()
        if not title:
            raise serializers.ValidationError('Give the report a title.')
        return title

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
        fields = ('id', 'year', 'total_income', 'total_expenses', 'notes', 'published_to_public')

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
    # The same courtesy for the request notices: the tokens the settings screen
    # lists are the ones members/requests.py actually substitutes.
    request_placeholders = serializers.SerializerMethodField()
    approval_placeholders = serializers.SerializerMethodField()

    def get_invitation_placeholders(self, obj):
        return [{'token': f'{{{name}}}', 'description': help_text} for name, help_text in MEETING_PLACEHOLDERS]

    def get_request_placeholders(self, obj):
        return [{'token': f'{{{name}}}', 'description': help_text} for name, help_text in REQUEST_PLACEHOLDERS]

    def get_approval_placeholders(self, obj):
        return [{'token': f'{{{name}}}', 'description': help_text} for name, help_text in APPROVAL_PLACEHOLDERS]
    # The tokens the leadership letters fill, listed beside their templates on
    # the settings screen.
    appointment_placeholders = serializers.SerializerMethodField()

    def get_appointment_placeholders(self, obj):
        return [{'token': f'{{{name}}}', 'description': help_text} for name, help_text in APPOINTMENT_PLACEHOLDERS]

    role_rights = serializers.SerializerMethodField()

    def get_role_rights(self, obj):
        """The effective rights per role, defaults included, for the settings UI.

        ``rights`` is the whole vocabulary with its labels and descriptions so
        the settings screen never hard-codes a copy of it.
        """
        from .roles import role_rights_settings, ROLE_RIGHTS
        configured = role_rights_settings(obj)
        return {
            'rights': [
                {'code': code, 'label': label, 'description': description}
                for code, label, description in ROLE_RIGHTS
            ],
            'by_role': configured,
        }

    def validate_role_rights(self, value):
        """Keep only known role codes and right codes; shape stays {role: [rights]}."""
        from .roles import ROLE_RIGHT_CODES
        if not isinstance(value, dict):
            raise serializers.ValidationError('role_rights must be an object of role → rights list.')
        cleaned = {}
        for role_code, rights in value.items():
            if role_code not in ROLE_CODES:
                raise serializers.ValidationError(f"Unknown role code: {role_code}")
            if not isinstance(rights, (list, tuple)):
                raise serializers.ValidationError(f'Rights for {role_code} must be a list.')
            unknown = [r for r in rights if r not in ROLE_RIGHT_CODES]
            if unknown:
                raise serializers.ValidationError(f"Unknown right code(s) for {role_code}: {', '.join(map(str, unknown))}")
            cleaned[role_code] = list(dict.fromkeys(rights))
        return cleaned

    class Meta:
        model = ChurchSettings
        fields = (
            'church_name', 'district', 'field', 'conference', 'address', 'latitude', 'longitude',
            'clarion_call_heading',
            'clarion_call_subtext', 'default_receipt_message', 'split_receipt_message', 'receipt_delivery_method',
            'default_business_meeting_invitation_message',
            'default_board_meeting_invitation_message',
            'default_request_notification_message',
            'default_membership_approval_message',
            'default_appointment_message',
            'default_release_thank_you_message',
            'request_placeholders',
            'approval_placeholders',
            'appointment_placeholders',
            'privacy_policy',
            'terms_of_use',
            'invitation_placeholders',
            'role_rights',
            'invitation_link_lifetime_days',
            'bank_name', 'bank_account_name', 'bank_account_number',
            'bank_branch', 'bank_swift_code', 'bank_paybill_number',
            # One M-Pesa detail: the number members pay into. What a giver types
            # as the account number is the account they are giving for, so the
            # church has nothing else to configure here.
            'mpesa_paybill_number',
        )


class MembershipTransferRequestSerializer(serializers.ModelSerializer):
    """A transfer request, in or out.

    The public transfer form used to carry a privacy checkbox, and the field
    was declared here and never listed in ``Meta.fields`` after the checkbox
    was removed — which made every request against this endpoint fail with a
    serializer assertion rather than save the transfer.
    """

    reason = serializers.CharField(required=False, allow_blank=True, default='')
    remain_friend = serializers.BooleanField(required=False, allow_null=True)

    class Meta:
        model = MembershipTransferRequest
        fields = ('id', 'member_name', 'transfer_type', 'other_church', 'reason', 'remain_friend', 'phone_number', 'email', 'status', 'created_at')
        read_only_fields = ('id', 'created_at')

    def to_internal_value(self, data):
        data = data.copy() if hasattr(data, 'copy') else dict(data)
        if 'name' in data and not data.get('member_name'):
            data['member_name'] = str(data['name']).strip()
        # A signed-in member's request carries no identity of its own: the
        # account they are logged in with *is* the name, the email and the
        # phone. Only what the session cannot know (the church they are going
        # to, why) comes from the form.
        user = getattr(self.context.get('request'), 'user', None)
        if user is not None and user.is_authenticated:
            if not data.get('member_name'):
                data['member_name'] = user.get_full_name() or user.get_username()
            if not data.get('email'):
                data['email'] = getattr(user, 'email', '') or ''
            profile = getattr(user, 'member_profile', None)
            if not data.get('phone_number') and profile:
                data['phone_number'] = profile.phone_number or ''
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


class WeeklyMeetingSerializer(serializers.ModelSerializer):
    """A meeting in the church's ordinary week.

    The two times leave as "20:00", not "20:00:00": every reader of this
    record — the gathering card, the calendar, the homepage week — is drawing
    a clock, and none of them wants the seconds.
    """

    weekday_label = serializers.SerializerMethodField()
    start_time = serializers.TimeField(format='%H:%M')
    end_time = serializers.TimeField(format='%H:%M')

    class Meta:
        model = WeeklyMeeting
        fields = (
            'id', 'title', 'weekday', 'weekday_label', 'start_time', 'end_time',
            'place', 'online', 'meeting_link', 'notes', 'is_active', 'sort_order',
        )
        read_only_fields = ('id',)

    def get_weekday_label(self, obj):
        return obj.get_weekday_display()

    def validate(self, attrs):
        """A meeting has to make sense as a window, and an online one needs
        the link members actually join by."""
        start = attrs.get('start_time', getattr(self.instance, 'start_time', None))
        end = attrs.get('end_time', getattr(self.instance, 'end_time', None))
        if start and end and end <= start:
            raise serializers.ValidationError({'end_time': 'A meeting has to end after it starts.'})

        online = attrs.get('online', getattr(self.instance, 'online', False))
        link = attrs.get('meeting_link', getattr(self.instance, 'meeting_link', ''))
        if online and not (link or '').strip():
            raise serializers.ValidationError({'meeting_link': 'An online meeting needs the link members join by.'})
        return attrs


class ChurchNotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChurchNotification
        fields = ('id', 'title', 'message', 'link', 'read', 'created_at')
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
    # fields=() narrows the payload when the drive rides inside an announcement.
    # brief=True (the list view) drops the per-viewer/report fields, which each
    # scan the drive's ledger — too costly to compute per row of a list.
    def __init__(self, *args, fields=None, **kwargs):
        super().__init__(*args, **kwargs)
        if fields is not None:
            allowed = set(fields)
            for field_name in set(self.fields) - allowed:
                self.fields.pop(field_name)
        elif self.context.get('brief'):
            for field_name in ('contribution_breakdown', 'ministry_breakdown', 'department_breakdown', 'donors', 'recent_gifts', 'deficit'):
                self.fields.pop(field_name, None)

    total_raised = serializers.SerializerMethodField()
    percentage_raised = serializers.SerializerMethodField()
    donor_count = serializers.SerializerMethodField()
    assigned_cards_count = serializers.SerializerMethodField()
    group_breakdown = serializers.SerializerMethodField()
    top_fundraisers = serializers.SerializerMethodField()
    # The drive's full money picture: my gifts, what my personal link brought
    # in, and everyone else's — the numbers the drive page's breakdown and
    # pie chart read. Empty for the detail-level fields=() calls.
    contribution_breakdown = serializers.SerializerMethodField()
    ministry_breakdown = serializers.SerializerMethodField()
    # The age-based department each giver belongs to — the church's own
    # reporting categories, separate from where a member serves.
    department_breakdown = serializers.SerializerMethodField()
    donors = serializers.SerializerMethodField()
    # A nameless pulse of the drive — amount, ministry, day — safe to show to
    # every viewer, members and signed-out visitors included.
    recent_gifts = serializers.SerializerMethodField()
    deficit = serializers.SerializerMethodField()

    attachment_name = serializers.SerializerMethodField()
    attachment_size = serializers.SerializerMethodField()
    source_account_name = serializers.CharField(source='source_account.name', read_only=True, default='')
    source_account_description = serializers.CharField(source='source_account.description', read_only=True, default='')

    def get_attachment_name(self, obj):
        if not obj.attachment:
            return None
        return obj.attachment.name.rsplit('/', 1)[-1]

    def get_attachment_size(self, obj):
        if not obj.attachment:
            return None
        try:
            return obj.attachment.size
        except (FileNotFoundError, OSError, ValueError):
            return None

    class Meta:
        model = FundraisingCampaign
        fields = (
            'id', 'name', 'title', 'account_name', 'description', 'target_amount', 'start_date',
            'end_date', 'is_active', 'is_temporary', 'generate_card', 'target_groups', 'allow_personal_invitations', 'custom_card_image',
            'attachment', 'attachment_name', 'attachment_size',
            'member_message', 'schedule_message', 'scheduled_at', 'message_frequency', 'message_sent',
            'last_message_sent_at', 'created_by', 'source_account', 'source_account_name', 'source_account_description',
            'approval_status', 'reviewed_by', 'reviewed_at', 'review_note', 'created_at', 'updated_at',
            'total_raised', 'percentage_raised', 'donor_count',
            'assigned_cards_count', 'group_breakdown', 'top_fundraisers',
            'contribution_breakdown', 'ministry_breakdown', 'department_breakdown', 'donors', 'recent_gifts', 'deficit'
        )
        read_only_fields = (
            'id', 'created_at', 'updated_at', 'created_by', 'message_sent', 'last_message_sent_at',
            'reviewed_by', 'reviewed_at',
        )

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

    def _linked_treasury_account(self, obj):
        """The treasury account the drive funnels into, or None.

        The drive's ``account_name`` is the short account reference the M-Pesa
        prompt shows, which is exactly the treasury account's name. Matched
        case-insensitively so 'Farewell' finds 'Farewell'.
        """
        from .models import TreasuryAccount
        from .treasury import account_for_purpose

        needle = (obj.account_name or obj.name or '').strip()
        if not needle:
            return None
        exact = TreasuryAccount.objects.filter(name__iexact=needle).first()
        if exact:
            return exact
        return account_for_purpose(needle)

    def _ledger_totals(self, obj):
        """The giving-ledger reading of the drive, kept as fallback.

        When no treasury account answers to the drive's reference — an older
        row, a misnamed reference — the headline still has a floor: the union
        of the drive's M-Pesa gifts and its purpose-named manual receipts, as
        before.
        """
        from django.db.models import Sum
        linked, extra = self._drive_mpesa(obj)
        mpesa_total = (
            linked.aggregate(Sum('amount'))['amount__sum'] or 0
        ) + (
            extra.aggregate(Sum('amount'))['amount__sum'] or 0
        )
        # The manual receipts: same purpose match, on the cash ledger. Cash
        # rows are completed money by definition — they are entered after the
        # money is in hand — and they live in their own table, so they can
        # never overlap the M-Pesa set.
        cash_total = self._drive_cash(obj).aggregate(Sum('amount'))['amount__sum'] or 0
        return float(mpesa_total + cash_total)

    def get_total_raised(self, obj):
        """Every shilling the drive has received since it opened.

        The drive is linked to a treasury account by its account reference;
        that account's credit rows from the drive's own beginning onward are
        the drive's money — manual desk receipts and M-Pesa prompt money were
        already credited through the same door, so reading the account makes
        the two indistinguishable in the figure. A transfer in counts (money
        moved into the fund); a debit does not (spending a fund does not
        un-raise what was given). Money the account already held when the
        drive was opened is NOT the drive's: a promoted account begins at
        zero and only what lands afterwards is raised. When the drive has no
        matching account, the giving ledgers are summed by purpose instead,
        as before.
        """
        from .treasury import account_inflows

        account = self._linked_treasury_account(obj)
        if account is not None:
            return float(account_inflows(account, since=obj.created_at))
        return self._ledger_totals(obj)

    def _drive_begins_at(self, obj):
        """The moment a drive's money starts to count, or None.

        An account-backed drive reads its headline from the linked account,
        which begins at zero against whatever the account already held. The
        ledger-based counters that ride beside the headline — the donor count,
        the ministry and department breakdowns, the gift pulse — share the
        drive's own beginning, so a purpose-named gift older than the drive
        (the account's opening money wearing a ledger row) is windowed out
        everywhere at once. A drive with no matching account reads the whole
        ledger union as before, so there is no window.
        """
        if self._linked_treasury_account(obj) is not None:
            return obj.created_at
        return None

    def get_percentage_raised(self, obj):
        total = self.get_total_raised(obj)
        target = float(obj.target_amount) if obj.target_amount else 0.0
        if target > 0:
            return round((total / target) * 100, 1)
        return 0.0

    def get_donor_count(self, obj):
        """Gifts across all channels: the M-Pesa union plus purpose-matched manual receipts.

        The headline amount reads from the linked account; the donor count
        stays a ledger count, which no opening-balance row can inflate.
        """
        linked, extra = self._drive_mpesa(obj)
        return linked.count() + extra.count() + self._drive_cash(obj).count()

    # -- Drive-page breakdown helpers -------------------------------------

    def _purpose_query(self, obj):
        """The Q filter naming this drive on a contribution's purpose line."""
        from django.db.models import Q
        query = Q(purpose=obj.name)
        if obj.account_name:
            query |= Q(purpose=obj.account_name)
        return query

    def _drive_mpesa(self, obj):
        """Every completed M-Pesa gift tied to the drive, deduplicated.

        Linked money and purpose-named money overlap, so the set is the union:
        linked contributions plus purpose-matched ones not already linked.
        """
        linked = obj.contributions.filter(status='completed')
        extra = Contribution.objects.filter(
            self._purpose_query(obj), status='completed'
        ).exclude(campaign=obj)
        since = self._drive_begins_at(obj)
        if since is not None:
            linked = linked.filter(created_at__gte=since)
            extra = extra.filter(created_at__gte=since)
        return linked, extra

    def _drive_cash(self, obj):
        """The manual receipts naming this drive, read on the drive's clock.

        Same purpose match as ``_purpose_query``, narrowed by the drive's own
        beginning when it is account-backed so a desk receipt entered before
        the drive cannot inflate a counter the headline ignores.
        """
        rows = CashContribution.objects.filter(self._purpose_query(obj))
        since = self._drive_begins_at(obj)
        if since is not None:
            rows = rows.filter(created_at__gte=since)
        return rows

    def get_contribution_breakdown(self, obj):
        """Who gave what: the signed-in viewer, their invitees, everyone else.

        ``request`` carries the viewer; an anonymous caller gets no "my"
        figures. Invitee money is the gifts attributed to card assignments
        held by the viewer; everything else is the remainder, never negative.
        """
        from django.db.models import Sum
        request = self.context.get('request')
        viewer = getattr(request, 'user', None)
        linked, extra = self._drive_mpesa(obj)
        all_gifts = list(linked) + list(extra)

        my_amount = 0
        my_gifts = 0
        invitee_amount = 0
        invitee_gifts = 0
        invitee_names = set()
        if viewer and viewer.is_authenticated:
            my_assignment_ids = set(obj.card_assignments.filter(member=viewer).values_list('id', flat=True))
            for gift in all_gifts:
                if gift.member_id == viewer.id:
                    my_amount += float(gift.amount or 0)
                    my_gifts += 1
                elif gift.card_assignment_id and gift.card_assignment_id in my_assignment_ids:
                    invitee_amount += float(gift.amount or 0)
                    invitee_gifts += 1
                    name = (gift.donor_name or '').strip()
                    if name:
                        invitee_names.add(name)

        total = self.get_total_raised(obj)
        others_amount = max(0.0, total - my_amount - invitee_amount)
        return {
            'my_amount': round(my_amount, 2),
            'my_gifts': my_gifts,
            'invitees_amount': round(invitee_amount, 2),
            'invitees_gifts': invitee_gifts,
            'invitee_names': sorted(invitee_names),
            'others_amount': round(others_amount, 2),
            'total_raised': round(float(total), 2),
        }

    def _ministry_label(self, user):
        """The ministry a giver serves on their profile, or 'General'.

        The offices the church reports by (Ambassadors, Adventist Youth,
        Adventist Men, Adventist Women) live on the member profile; a giver
        with none, or a manual receipt with no matching account, is 'General'.
        """
        if not user:
            return 'General'
        profile = getattr(user, 'member_profile', None)
        ministry = (getattr(profile, 'ministry', '') or '').strip() if profile else ''
        return ministry or 'General'

    def _cash_giver(self, email):
        """The user behind a manual receipt, matched on the email on its row."""
        from django.contrib.auth.models import User
        email = (email or '').strip().lower()
        if not email:
            return None
        return User.objects.filter(email__iexact=email).first()

    def get_ministry_breakdown(self, obj):
        """Drive money grouped by the ministry each giver serves.

        Everything with no ministry lands in 'General'. Reads only completed
        M-Pesa gifts and manual receipts.
        """
        totals = {}
        linked, extra = self._drive_mpesa(obj)
        for gift in list(linked) + list(extra):
            label = self._ministry_label(gift.member)
            totals[label] = totals.get(label, 0.0) + float(gift.amount or 0)
        for row in self._drive_cash(obj).values('donor_name', 'giver_email', 'amount'):
            label = self._ministry_label(self._cash_giver(row.get('giver_email')))
            totals[label] = totals.get(label, 0.0) + float(row['amount'] or 0)
        return [
            {'ministry': label, 'amount': round(amount, 2)}
            for label, amount in sorted(totals.items(), key=lambda kv: -kv[1])
        ]

    def _department_label(self, user):
        """The age-based department a giver belongs to, or 'Unassigned'.

        Departments are the church's reporting categories (Children, Youth,
        Young Adults, Adults, Seniors); a giver with none on file is grouped
        under 'Unassigned' rather than dropped.
        """
        profile = getattr(user, 'member_profile', None)
        if not profile:
            return 'Unassigned'
        return profile.get_department_display() or 'Unassigned'

    def get_department_breakdown(self, obj):
        """Drive money grouped by each giver's age-based department.

        Reads only completed M-Pesa gifts and manual receipts, the same union
        the totals use. A member belongs to exactly one department, so every
        gift lands in exactly one group.
        """
        totals = {}
        linked, extra = self._drive_mpesa(obj)
        for gift in list(linked) + list(extra):
            label = self._department_label(gift.member)
            totals[label] = totals.get(label, 0.0) + float(gift.amount or 0)
        for row in self._drive_cash(obj).values('giver_email', 'amount'):
            label = self._department_label(self._cash_giver(row.get('giver_email')))
            totals[label] = totals.get(label, 0.0) + float(row['amount'] or 0)
        return [
            {'department': label, 'amount': round(amount, 2)}
            for label, amount in sorted(totals.items(), key=lambda kv: -kv[1])
        ]

    def get_recent_gifts(self, obj):
        """A nameless pulse of the drive: what came in lately, newest first.

        Each entry carries only an amount, the giver's ministry and the day —
        never a name — so the drive page can show momentum to members and
        visitors alike without exposing who gave what. Reads the same
        completed gifts the totals do, from every channel.
        """

        def day_of(when):
            if not when:
                return None
            if timezone.is_naive(when):
                when = timezone.make_aware(when, timezone.get_current_timezone())
            return timezone.localtime(when).date().isoformat()

        entries = []
        linked, extra = self._drive_mpesa(obj)
        for gift in list(linked) + list(extra):
            entries.append({
                'amount': round(float(gift.amount or 0), 2),
                'ministry': self._ministry_label(gift.member),
                'date': day_of(gift.paid_at or gift.created_at),
            })
        for row in self._drive_cash(obj):
            entries.append({
                'amount': round(float(row.amount or 0), 2),
                'ministry': self._ministry_label(self._cash_giver(row.giver_email)),
                'date': row.received_on.isoformat() if row.received_on else None,
            })
        entries.sort(key=lambda e: e['date'] or '', reverse=True)
        return entries[:10]

    def _viewer_may_see_donors(self):
        """Only admins, elders and the treasurer may read donor names.

        The donor list ranks people by what they gave, so it is an
        office-holder view. Everyone else — members and signed-out visitors
        alike — still gets ``donor_count`` but never the names behind it.
        """
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return False
        if user.is_staff or user.is_superuser:
            return True
        profile = getattr(user, 'member_profile', None)
        return bool(profile and profile.has_role('admin', 'elder', 'treasurer'))

    def get_donors(self, obj):
        """The donor list behind the headline: name, amount, gift count.

        Clicking the donor count opens this. Manual receipts name their giver
        on the row; M-Pesa gifts carry the giver's account or the typed name.
        The names never leave the server for anyone outside the roles above.
        """
        if not self._viewer_may_see_donors():
            return []
        from django.db.models import Sum
        donors = {}

        def add(name, amount):
            name = (name or '').strip()
            if not name:
                name = 'Anonymous giver'
            entry = donors.setdefault(name, {'name': name, 'amount': 0.0, 'gifts': 0})
            entry['amount'] += float(amount or 0)
            entry['gifts'] += 1

        linked, extra = self._drive_mpesa(obj)
        for gift in list(linked) + list(extra):
            name = (gift.donor_name or '').strip()
            if not name and gift.member_id:
                name = f"{gift.member.first_name} {gift.member.last_name}".strip() or gift.member.username
            add(name, gift.amount)
        for row in CashContribution.objects.filter(self._purpose_query(obj)):
            add(row.donor_name, row.amount)
        ranked = sorted(donors.values(), key=lambda d: -d['amount'])
        for entry in ranked:
            entry['amount'] = round(entry['amount'], 2)
        return ranked

    def get_deficit(self, obj):
        target = float(obj.target_amount or 0)
        if target <= 0:
            return 0.0
        return round(max(0.0, target - self.get_total_raised(obj)), 2)


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
    # The department this fund belongs to, addressed by its code — the same
    # handle every department path and audience code already uses. A connected
    # account is the department's own money: its desk reads the balance and
    # the movements, and its leadership requests withdrawals of it. Empty is
    # the church's own money, which no department desk reads.
    department = serializers.SlugRelatedField(
        slug_field='code',
        queryset=Department.objects.filter(is_active=True),
        allow_null=True, required=False,
    )
    department_name = serializers.CharField(source='department.name', read_only=True, default='')

    class Meta:
        model = TreasuryAccount
        fields = ('id', 'name', 'account_number', 'account_type', 'account_type_display', 'balance', 'description', 'department', 'department_name', 'created_at', 'updated_at')
        read_only_fields = ('id', 'created_at', 'updated_at')

    def validate_department(self, value):
        # One fund per department: the desks read a single account (the first
        # by id), so a second connection would sit unseen beside the first.
        if value is None:
            return value
        taken = TreasuryAccount.objects.filter(department=value)
        if self.instance is not None:
            taken = taken.exclude(pk=self.instance.pk)
        if taken.exists():
            raise serializers.ValidationError(
                f'{value.name} already has an account connected to it.'
            )
        return value

    def validate_name(self, value):
        # Safaricom's AccountReference caps at 12 characters; the name IS what
        # the M-Pesa prompt shows, so the cap lives here, at the API.
        cleaned = (value or '').strip()
        if not cleaned:
            raise serializers.ValidationError('An account name is required.')
        if len(cleaned) > 12:
            raise serializers.ValidationError(
                'The account name is what M-Pesa shows in the prompt, so it must be 12 characters or fewer '
                f'(got {len(cleaned)}). Put the full wording in the description instead.'
            )
        return cleaned

    def validate(self, attrs):
        # The description is what members read in the giving form and the
        # reports; default it from the short name so an account is never a code.
        if not (attrs.get('description') or '').strip():
            name = attrs.get('name') or (self.instance.name if self.instance else '')
            attrs['description'] = (name or '').strip()
        return attrs


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
