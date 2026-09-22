import hashlib
import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone

from .roles import ROLE_CHOICES, normalize_roles

CURRENT_PRIVACY_POLICY_VERSION = '2026-09-22'
CURRENT_TERMS_OF_USE_VERSION = '2026-09-22'


def invitation_token_hash(raw_token):
    """The salted SHA-256 hex digest a raw invitation token is stored as.

    The salt comes from the deployment's SECRET_KEY, so a stolen database dump
    alone cannot be turned back into working invitation links; an attacker
    would need the secret too. The digest keeps only the token out of the
    database — the raw value still travels in the emailed link, exactly as before.
    """
    return hashlib.sha256(f'{settings.SECRET_KEY}:invitation:{raw_token}'.encode()).hexdigest()


class MemberProfile(models.Model):
    ACCOUNT_TYPE_CHOICES = [('member', 'Member'), ('friend', 'Friend of SDA Loma Linda')]
    # Hard-coded church roles; see members/roles.py for the full definitions.
    ROLE_CHOICES = list(ROLE_CHOICES)
    BAPTISMAL_STATUS_CHOICES = [
        ('baptised', 'Baptised'),
        ('not_baptised', 'Not Baptised'),
        ('transfer_pending', 'Transfer In Progress'),
    ]
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='member_profile')
    phone_number = models.CharField(max_length=20, blank=True)
    whatsapp_number = models.CharField(max_length=20, blank=True, default='')
    account_type = models.CharField(max_length=20, choices=ACCOUNT_TYPE_CHOICES, default='member')
    role = models.CharField(max_length=30, default='member', choices=ROLE_CHOICES, help_text="Primary/legacy role kept in sync with 'roles'")
    roles = models.CharField(max_length=250, blank=True, default='member', help_text="Comma-separated role codes; a member can hold several roles")
    current_church = models.CharField(max_length=160, blank=True, help_text="Church the person currently attends (mainly for friends)")
    baptismal_status = models.CharField(max_length=30, choices=BAPTISMAL_STATUS_CHOICES, blank=True, help_text="Baptismal status (mainly for friends)")
    employment_status = models.CharField(max_length=80, blank=True)
    profession = models.CharField(max_length=120, blank=True)
    gender = models.CharField(max_length=20, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    gifts = models.TextField(blank=True, default='', help_text="Spiritual gifts and talents of the member")
    disability = models.TextField(blank=True, default='', help_text="Disability or special needs of the member")
    is_disfellowshipped = models.BooleanField(default=False, help_text="Whether the member has been disfellowshipped")
    must_change_password = models.BooleanField(default=False, help_text="Require a password change at the next login")
    privacy_accepted_at = models.DateTimeField(null=True, blank=True)
    privacy_policy_version = models.CharField(max_length=20, blank=True, default='')
    terms_accepted_at = models.DateTimeField(null=True, blank=True)
    terms_of_use_version = models.CharField(max_length=20, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def get_roles(self):
        """Return the list of role codes this member holds (roles + legacy role)."""
        codes = [c.strip() for c in (self.roles or '').split(',') if c.strip()]
        legacy = (self.role or '').strip()
        if legacy and legacy not in codes:
            codes.append(legacy)
        return codes or ['member']

    def set_roles(self, codes, save=True):
        """Store ``codes`` as this member's role set, keeping ``role`` in sync."""
        role_codes = normalize_roles(codes)
        self.roles = ', '.join(role_codes)
        self.role = role_codes[0]
        if save:
            self.save(update_fields=['roles', 'role'])
        return role_codes

    def has_role(self, *codes):
        """True if the member holds any of the given role codes."""
        member_roles = set(self.get_roles())
        return bool(member_roles.intersection(codes))

    def __str__(self):
        return f"{self.user.get_username()} ({self.get_role_display()})"


class EnrollmentRequest(models.Model):
    STATUS_CHOICES = [('verification_pending', 'Verification pending'), ('pending', 'Pending approval'), ('approved', 'Approved'), ('rejected', 'Rejected'), ('completed', 'Completed'), ('expired', 'Expired')]
    JOINING_MODE_CHOICES = [('baptism', 'Baptism'), ('membership_transfer', 'Membership transfer'), ('friend', 'Friend of SDA Loma Linda')]
    email = models.EmailField(unique=True)
    first_name = models.CharField(max_length=150, blank=True)
    last_name = models.CharField(max_length=150, blank=True)
    phone_number = models.CharField(max_length=20, blank=True)
    joining_mode = models.CharField(max_length=30, choices=JOINING_MODE_CHOICES, default='baptism')
    id_number = models.CharField(max_length=40, blank=True)
    education_level = models.CharField(max_length=120, blank=True)
    profession = models.CharField(max_length=120, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    county_of_birth = models.CharField(max_length=120, blank=True)
    current_church = models.CharField(max_length=160, blank=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='enrollment_requests')
    privacy_accepted_at = models.DateTimeField(null=True, blank=True)
    privacy_policy_version = models.CharField(max_length=20, blank=True, default='')
    terms_accepted_at = models.DateTimeField(null=True, blank=True)
    terms_of_use_version = models.CharField(max_length=20, blank=True, default='')
    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.email


class Invitation(models.Model):
    """An email invitation to create a church account.

    A church administrator invites someone by email; the invitee follows the
    emailed link to a page where they choose their own username and password,
    then signs in normally. Invitations carry the role(s) and account type the
    account should be created with, so the inviter decides accesses up front.

    The token the link carries is stored only as a salted SHA-256 hash, so a
    leaked database dump cannot revive a live invitation. Set the token with
    set_token(raw_token) and look one up with from_token(raw_token); the raw
    token is never persisted anywhere.
    """

    STATUS_CHOICES = [('pending', 'Pending'), ('accepted', 'Accepted'), ('revoked', 'Revoked')]
    email = models.EmailField()
    first_name = models.CharField(max_length=150, blank=True)
    last_name = models.CharField(max_length=150, blank=True)
    phone_number = models.CharField(max_length=20, blank=True)
    account_type = models.CharField(max_length=20, choices=MemberProfile.ACCOUNT_TYPE_CHOICES, default='member')
    roles = models.CharField(max_length=250, blank=True, default='member', help_text="Comma-separated role codes the invited account will hold")
    token = models.CharField(max_length=64, unique=True, editable=False, help_text="SHA-256 hash of the invitation link token")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    invited_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='sent_invitations')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='invitations')
    sent_at = models.DateTimeField(null=True, blank=True, help_text="When the invitation email was last sent")
    accepted_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    # The raw token only ever lives in memory: set_token() keeps it here so the
    # response that created or resent the invitation can hand the real link to
    # the inviter, while the database below stores only the hash.
    raw_token = None

    def save(self, *args, **kwargs):
        # Every invitation must carry a usable token, even one created in the
        # Django admin or the console before the form sets one explicitly.
        if not self.token:
            self.set_token()
        super().save(*args, **kwargs)

    def set_token(self, raw_token=None):
        """Hash a fresh invitation token (or a given one) and store it."""
        self.raw_token = str(raw_token or uuid.uuid4())
        self.token = invitation_token_hash(self.raw_token)

    @classmethod
    def from_token(cls, raw_token):
        """The invitation a raw link token belongs to, or None.

        The raw token is only ever compared against stored hashes, so neither
        the value nor a timing side channel reveals anything usable.
        """
        if not raw_token:
            return None
        return cls.objects.filter(token=invitation_token_hash(raw_token)).first()

    def role_codes(self):
        return [code.strip() for code in (self.roles or '').split(',') if code.strip()]

    def display_name(self):
        return f"{self.first_name} {self.last_name}".strip()

    def is_usable(self):
        return self.status == 'pending' and self.expires_at > timezone.now()

    def __str__(self):
        return f"{self.email} ({self.get_status_display()})"


class Announcement(models.Model):
    VISIBILITY_CHOICES = [('members', 'Members'), ('public', 'Public'), ('all', 'All')]
    ACTION_CHOICES = [
        ('none', 'None'),
        ('tithe', 'Tithe'),
        ('combined_offering', 'Combined Offering'),
        ('13th_sabbath', '13th Sabbath'),
        ('camp_expenses', 'Camp Expenses'),
        ('camp_goal', 'Camp Goal'),
        ('local_church_budget', 'Local Church Budget'),
        ('respond', 'Response'),
    ]
    SHARING_CHOICES = [('site', 'On the Site'), ('sms', 'Through SMS'), ('email', 'Through Email'), ('all', 'All')]
    title = models.CharField(max_length=160)
    text = models.TextField()
    detail = models.TextField(blank=True)
    href = models.CharField(max_length=255, blank=True)
    visibility = models.CharField(max_length=20, choices=VISIBILITY_CHOICES, default='public')
    action_type = models.CharField(max_length=40, choices=ACTION_CHOICES, default='none')
    attachment = models.FileField(upload_to='announcement-attachments/', blank=True, null=True)
    sharing_option = models.CharField(max_length=100, default='site', blank=True)
    is_popup = models.BooleanField(default=False, help_text="Pop up automatically to users requiring action")
    action_prompt = models.CharField(max_length=255, blank=True, help_text="Optional prompt for pledge or response")
    published = models.BooleanField(default=True)
    expires_at = models.DateField(null=True, blank=True, help_text="Date up to which the announcement will be displayed")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.title


class AnnouncementResponse(models.Model):
    ACTION_TYPE_CHOICES = Announcement.ACTION_CHOICES
    announcement = models.ForeignKey(Announcement, on_delete=models.CASCADE, related_name='responses')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='announcement_responses')
    action_type = models.CharField(max_length=40, choices=ACTION_TYPE_CHOICES)
    pledge_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    response_text = models.TextField(blank=True)
    respondent_name = models.CharField(max_length=120, blank=True)
    respondent_phone = models.CharField(max_length=30, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.action_type} for {self.announcement.title} by {self.respondent_name or self.user or 'Guest'}"


class Contribution(models.Model):
    GIVING_TYPE_CHOICES = [('financial', 'Financial')]
    STATUS_CHOICES = [('pending', 'Pending'), ('completed', 'Completed'), ('failed', 'Failed'), ('cancelled', 'Cancelled')]
    PAYMENT_METHOD_CHOICES = [('mpesa', 'M-Pesa'), ('bank_transfer', 'Bank-to-Bank'), ('cheque', 'Cheque'), ('cash', 'Cash')]
    member = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='contributions', null=True, blank=True)
    donor_name = models.CharField(max_length=160, blank=True)
    donor_email = models.EmailField(blank=True)
    giving_type = models.CharField(max_length=20, choices=GIVING_TYPE_CHOICES, default='financial')
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    currency = models.CharField(max_length=3, default='KES')
    purpose = models.CharField(max_length=120, default='Combined Offering')
    campaign = models.ForeignKey('FundraisingCampaign', on_delete=models.SET_NULL, null=True, blank=True, related_name='contributions')
    card_assignment = models.ForeignKey('CampaignCardAssignment', on_delete=models.SET_NULL, null=True, blank=True, related_name='contributions')
    item_description = models.TextField(blank=True)
    phone_number = models.CharField(max_length=20, blank=True)
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHOD_CHOICES, default='mpesa')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    mpesa_receipt_number = models.CharField(max_length=64, unique=True, null=True, blank=True)
    checkout_request_id = models.CharField(max_length=128, unique=True, null=True, blank=True)
    merchant_request_id = models.CharField(max_length=128, blank=True)
    paystack_reference = models.CharField(max_length=100, unique=True, null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    receipt_sent_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']


class MpesaRefund(models.Model):
    """A treasurer-initiated B2C payout returning part of a member's contribution.

    A contribution may be refunded in several partial payouts, but the sum of
    all non-failed refunds must never exceed the contribution amount.
    """
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('accepted', 'Accepted by M-Pesa'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]
    contribution = models.ForeignKey(Contribution, on_delete=models.PROTECT, related_name='refunds')
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    phone_number = models.CharField(max_length=20, blank=True)
    reason = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    outcome_description = models.CharField(max_length=255, blank=True)
    originator_conversation_id = models.CharField(max_length=64, unique=True)
    conversation_id = models.CharField(max_length=64, blank=True)
    transaction_id = models.CharField(max_length=64, blank=True)
    initiated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='mpesa_refunds_initiated')
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Refund {self.amount} to {self.phone_number} for contribution {self.contribution_id} ({self.status})"


class CashContribution(models.Model):
    """A receipt entered manually by an authorised member of the finance team."""
    ENTRY_TYPE_CHOICES = [
        ('individual', 'Individual Member'),
        ('anonymous', 'Anonymous Giver'),
        ('collection', 'General Collection'),
    ]
    PAYMENT_METHOD_CHOICES = [
        ('cash', 'Cash'),
        ('mpesa', 'M-Pesa'),
        ('bank_transfer', 'Bank-to-Bank'),
    ]

    received_on = models.DateField(default=timezone.localdate)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    purpose = models.CharField(max_length=120, default='Combined Offering')
    entry_type = models.CharField(max_length=20, choices=ENTRY_TYPE_CHOICES, default='individual')
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHOD_CHOICES, default='cash')
    item_description = models.TextField(blank=True, default='')
    donor_name = models.CharField(max_length=160, blank=True)
    giver_phone = models.CharField(max_length=30, blank=True)
    giver_email = models.EmailField(blank=True)
    receipt_number = models.CharField(max_length=64, blank=True)
    notes = models.TextField(blank=True)
    received_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='cash_contributions_entered')
    receipt_sent_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-received_on', '-created_at']


class InKindContribution(models.Model):
    """Non-monetary giving (goods, materials, produce). Items are recorded one per row."""
    member = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, related_name='in_kind_contributions', null=True, blank=True)
    donor_name = models.CharField(max_length=160, blank=True)
    donor_email = models.EmailField(blank=True)
    phone_number = models.CharField(max_length=20, blank=True)
    items = models.TextField(help_text="Donated items, one per row")
    purpose = models.CharField(max_length=120, default='In-Kind Offering')
    notes = models.TextField(blank=True)
    received_on = models.DateField(default=timezone.localdate)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name_plural = 'in-kind contributions'

    def __str__(self):
        first_item = (self.items or '').strip().splitlines()[0] if (self.items or '').strip() else 'In-kind gift'
        return f"{self.donor_name or 'Anonymous'} — {first_item[:40]}"


class ContributionReconciliation(models.Model):
    """The amounts independently confirmed against a day's digital and cash ledgers."""
    reconciliation_date = models.DateField(unique=True)
    digital_amount_confirmed = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    cash_amount_counted = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    notes = models.TextField(blank=True)
    reconciled_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='contribution_reconciliations')
    reconciled_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-reconciliation_date']


class SupportSubmission(models.Model):
    TYPE_CHOICES = [('idea', 'Idea'), ('moral_support', 'Prayer and moral support'), ('partnership', 'Partnership request')]
    member = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='support_submissions')
    submission_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    category = models.CharField(max_length=80, blank=True)
    content = models.TextField()
    name = models.CharField(max_length=160, blank=True)
    phone_number = models.CharField(max_length=40, blank=True)
    email = models.EmailField(blank=True)
    anonymous = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']


class Friend(models.Model):
    email = models.EmailField(unique=True)
    name = models.CharField(max_length=160, blank=True)
    phone_number = models.CharField(max_length=40, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name', 'email']

    def __str__(self):
        return self.name or self.email


class GivingPurpose(models.Model):
    name = models.CharField(max_length=120, unique=True)
    account_name = models.CharField(max_length=60, blank=True, help_text="M-Pesa / Giving account reference name (e.g. tithe, offering)")
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class Profession(models.Model):
    name = models.CharField(max_length=120, unique=True)
    is_default = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class FundraisingCampaign(models.Model):
    MESSAGE_FREQ_CHOICES = [
        ('once', 'One-time broadcast'),
        ('daily', 'Daily reminder'),
        ('weekly', 'Weekly (Every Sabbath)'),
        ('biweekly', 'Bi-weekly reminder'),
    ]

    name = models.CharField(max_length=120, unique=True, help_text="Campaign name, also used as default giving purpose")
    title = models.CharField(max_length=160, blank=True, help_text="Public display title")
    account_name = models.CharField(max_length=60, blank=True, help_text="M-Pesa / Giving account reference name (e.g. CAMP2026)")
    description = models.TextField(blank=True)
    target_amount = models.DecimalField(max_digits=12, decimal_places=2)
    start_date = models.DateField(default=timezone.now)
    end_date = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    is_temporary = models.BooleanField(default=True, help_text="Designates whether this is a temporary campaign with a specific timeline")
    generate_card = models.BooleanField(default=True)
    target_groups = models.JSONField(default=list, blank=True, help_text="List of assigned group/department keys")
    custom_card_image = models.ImageField(upload_to='campaign_cards/', null=True, blank=True)
    member_message = models.TextField(blank=True, help_text="Broadcast notification message sent to church members")
    schedule_message = models.BooleanField(default=False, help_text="Whether to schedule the member message for automatic dispatch")
    scheduled_at = models.DateTimeField(null=True, blank=True, help_text="Scheduled date and time to broadcast to members")
    message_frequency = models.CharField(max_length=20, choices=MESSAGE_FREQ_CHOICES, default='once')
    message_sent = models.BooleanField(default=False, help_text="Whether the campaign message has been broadcast")
    last_message_sent_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_campaigns')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.name


class CampaignCardAssignment(models.Model):
    campaign = models.ForeignKey(FundraisingCampaign, on_delete=models.CASCADE, related_name='card_assignments')
    member = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='campaign_cards')
    group_name = models.CharField(max_length=60, default='General Member')
    referral_token = models.CharField(max_length=64, unique=True, default=uuid.uuid4)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('campaign', 'member')
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.campaign.name} - {self.member.get_full_name() or self.member.username} ({self.group_name})"


class ChurchFinancialReport(models.Model):
    PERIOD_TYPE_CHOICES = [('monthly', 'Monthly'), ('quarterly', 'Quarterly'), ('annual', 'Annual')]
    title = models.CharField(max_length=160)
    period_type = models.CharField(max_length=20, choices=PERIOD_TYPE_CHOICES, default='monthly')
    period_start = models.DateField()
    period_end = models.DateField()
    total_tithes = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total_offerings = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total_expenses = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    notes = models.TextField(blank=True)
    published_to_members = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-period_end']


class ChurchBudget(models.Model):
    year = models.PositiveIntegerField(unique=True)
    total_income = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total_expenses = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    notes = models.TextField(blank=True)
    published_to_public = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-year']


class PrayerRequest(models.Model):
    request_text = models.TextField()
    name = models.CharField(max_length=160, blank=True)
    email = models.EmailField(blank=True)
    phone_number = models.CharField(max_length=40, blank=True)
    anonymous = models.BooleanField(default=True)
    status = models.CharField(max_length=20, choices=[('new', 'New'), ('prayed', 'Prayed'), ('closed', 'Closed')], default='new')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']


class Testimony(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    friend = models.ForeignKey('Friend', on_delete=models.SET_NULL, null=True, blank=True, related_name='testimonies')
    email = models.EmailField(blank=True)
    name = models.CharField(max_length=160, blank=True)
    phone_number = models.CharField(max_length=40, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    requested_date = models.DateField(null=True, blank=True)
    requested_time = models.CharField(max_length=80, blank=True)
    testimony_text = models.TextField(max_length=1000)
    status = models.CharField(
        max_length=20,
        choices=[('pending_review', 'Pending review'), ('approved', 'Approved'), ('rejected', 'Rejected')],
        default='pending_review'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Testimony by {self.name or self.user or 'Guest'} ({self.status})"


class PendingTestimony(models.Model):
    STATUS_CHOICES = [
        ('verification_sent', 'Verification sent'),
        ('pending_review', 'Pending review'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('expired', 'Expired'),
    ]
    email = models.EmailField()
    name = models.CharField(max_length=160, blank=True)
    phone_number = models.CharField(max_length=40, blank=True)
    testimony_text = models.TextField(max_length=1000, blank=True)
    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    status = models.CharField(max_length=24, choices=STATUS_CHOICES, default='verification_sent')
    verified_at = models.DateTimeField(null=True, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Pending testimony from {self.email} ({self.status})"


class ChildDedicationRequest(models.Model):
    child_name = models.CharField(max_length=160)
    child_dob = models.DateField()
    father_name = models.CharField(max_length=160, blank=True)
    mother_name = models.CharField(max_length=160, blank=True)
    phone_number = models.CharField(max_length=40)
    notes = models.TextField(blank=True)
    status = models.CharField(
        max_length=20,
        choices=[('pending', 'Pending'), ('approved', 'Approved'), ('completed', 'Completed'), ('cancelled', 'Cancelled')],
        default='pending'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        parents = ", ".join(filter(None, [self.father_name, self.mother_name])) or "Parents"
        return f"Child Dedication: {self.child_name} ({parents})"


class SabbathEvent(models.Model):
    date = models.DateField(unique=True)
    name = models.CharField(max_length=160, default='Sabbath Worship')
    department = models.CharField(max_length=160, blank=True)
    leader = models.CharField(max_length=160, blank=True)
    program_text = models.TextField(blank=True)
    program_file = models.FileField(upload_to='sabbath-programs/', blank=True, null=True)
    published = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['date']


class ChurchSettings(models.Model):
    church_name = models.CharField(max_length=160, default='SDA Loma Linda, Meru')
    district = models.CharField(max_length=160, blank=True, help_text='NEKF district name, e.g. "Meru Central"')
    field = models.CharField(max_length=160, blank=True, default='North East Kenya Field', help_text='SDA Field name, e.g. "North East Kenya Field"')
    conference = models.CharField(max_length=160, blank=True, default='East Africa Division', help_text='SDA Conference/Division name')
    address = models.CharField(max_length=255, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    midweek_vespers_link = models.URLField(blank=True)
    live_service_link = models.URLField(blank=True)
    live_service_active = models.BooleanField(default=False)
    midweek_vespers_time = models.CharField(max_length=120, default='Wednesday · 8:00 PM – 9:00 PM')
    friday_vespers_time = models.CharField(max_length=120, default='Friday · 5:30 PM – 6:30 PM')
    sabbath_time = models.CharField(max_length=120, default='Saturday · 8:00 AM – 4:00 PM')
    clarion_call_heading = models.TextField(default='A place to belong.\nA faith to share.\nA hope that transforms lives.')
    clarion_call_subtext = models.TextField(default="Join SDA Loma Linda as we study God's Word, support one another, and reach out to our community with faith and compassion.")
    RECEIPT_DELIVERY_CHOICES = [('email', 'Email'), ('sms', 'SMS')]
    default_receipt_message = models.TextField(default="your contribution of {amount} has been received. Thank you, and may God bless you abundantly", blank=True)
    receipt_delivery_method = models.CharField(max_length=10, choices=RECEIPT_DELIVERY_CHOICES, default='email')
    default_business_meeting_invitation_message = models.TextField(
        default="Dear member, you are warmly invited to our upcoming Church Business Meeting: '{title}' on {meeting_date} at {location}. Your presence and active participation are highly valued!",
        blank=True
    )
    default_board_meeting_invitation_message = models.TextField(
        default="Dear Church Board Member, you are hereby invited to attend the Church Board Meeting: '{title}' scheduled for {meeting_date} at {location}. Please review the agendas and attached documents.",
        blank=True
    )
    board_roles = models.JSONField(
        default=list,
        blank=True,
        help_text="List of role keys that belong to the church board"
    )
    bank_name = models.CharField(max_length=160, default='KCB Bank Kenya', blank=True)
    bank_account_name = models.CharField(max_length=160, default='SDA Church Main Account', blank=True)
    bank_account_number = models.CharField(max_length=80, default='1122334455', blank=True)
    bank_branch = models.CharField(max_length=120, default='Meru', blank=True)
    bank_swift_code = models.CharField(max_length=50, default='KCBKNEN', blank=True)
    bank_paybill_number = models.CharField(max_length=50, default='522522', blank=True)
    invitation_link_lifetime_days = models.PositiveIntegerField(default=7, help_text="How many days an emailed invitation link stays usable before it expires")
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.church_name


class MembershipTransferRequest(models.Model):
    TRANSFER_TYPE_CHOICES = [('incoming', 'Incoming Transfer'), ('outgoing', 'Outgoing Transfer')]
    STATUS_CHOICES = [('pending', 'Pending'), ('under_review', 'Under review'), ('approved', 'Approved'), ('completed', 'Completed'), ('cancelled', 'Cancelled')]
    member_name = models.CharField(max_length=160)
    transfer_type = models.CharField(max_length=20, choices=TRANSFER_TYPE_CHOICES, default='incoming')
    other_church = models.CharField(max_length=160, help_text="Previous or destination church name")
    reason = models.TextField(blank=True, help_text="Reason for the transfer")
    remain_friend = models.BooleanField(null=True, blank=True, help_text="Whether an outgoing member wants to remain a friend of the church")
    phone_number = models.CharField(max_length=40, blank=True)
    email = models.EmailField(blank=True)
    privacy_accepted_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    clerk_notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.get_transfer_type_display()}: {self.member_name} ({self.status})"


class MembershipRemovalRequest(models.Model):
    REASON_CHOICES = [
        ('disciplinary', 'Disciplinary'),
        ('death', 'Death'),
    ]
    STATUS_CHOICES = [
        ('pending', 'Pending elder approval'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]
    member = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='membership_removal_requests')
    reason = models.CharField(max_length=30, choices=REASON_CHOICES)
    notes = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='requested_membership_removals')
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewed_membership_removals')
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.member.get_username()} removal ({self.status})"


class ChurchCorrespondence(models.Model):
    CATEGORY_CHOICES = [('clerk_letter', 'Clerk Letter'), ('recommendation', 'Letter of Recommendation'), ('board_notice', 'Board Notice'), ('general', 'General Correspondence')]
    title = models.CharField(max_length=160)
    sender_or_recipient = models.CharField(max_length=160)
    category = models.CharField(max_length=30, choices=CATEGORY_CHOICES, default='general')
    body = models.TextField()
    date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date']

    def __str__(self):
        return f"{self.title} ({self.get_category_display()})"


class BoardMeeting(models.Model):
    STATUS_CHOICES = [('upcoming', 'Upcoming'), ('completed', 'Completed'), ('archived', 'Archived')]
    title = models.CharField(max_length=160)
    meeting_date = models.DateField()
    meeting_time = models.CharField(max_length=80, blank=True, default='5:00 PM')
    location = models.CharField(max_length=160, blank=True, default='Board Room / Main Sanctuary')
    agenda = models.TextField(blank=True, help_text="Meeting agenda summary")
    minutes = models.TextField(blank=True, help_text="Recorded board meeting minutes")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='upcoming')
    reference_file = models.FileField(upload_to='board-materials/', blank=True, null=True)
    notify_sms = models.BooleanField(default=True)
    notify_email = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-meeting_date']

    def __str__(self):
        return f"Board Meeting: {self.title} ({self.meeting_date})"


class BoardMeetingAgenda(models.Model):
    meeting = models.ForeignKey(BoardMeeting, on_delete=models.CASCADE, related_name='agendas')
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default='')
    order = models.PositiveIntegerField(default=1)
    document = models.FileField(upload_to='board-meeting-docs/', blank=True, null=True)
    document_name = models.CharField(max_length=160, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order', 'id']

    def __str__(self):
        return f"Board Agenda: {self.title} ({self.meeting.title})"


class ChurchNotification(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='notifications')
    title = models.CharField(max_length=160)
    message = models.TextField()
    read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Notification for {self.user.username}: {self.title}"


class VisitationRequest(models.Model):
    VISITATION_TYPE_CHOICES = [
        ('pastoral', 'Pastoral Care & Prayer'),
        ('sick', 'Sick / Hospital Visitation'),
        ('bereavement', 'Bereavement / Grief Support'),
        ('family', 'Home Blessing / Family Visit'),
        ('other', 'Other'),
    ]
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('scheduled', 'Scheduled'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]
    requester_name = models.CharField(max_length=160)
    phone_number = models.CharField(max_length=40)
    email = models.EmailField(blank=True)
    visitation_type = models.CharField(max_length=40, choices=VISITATION_TYPE_CHOICES, default='pastoral')
    preferred_date = models.DateField(null=True, blank=True)
    preferred_time = models.CharField(max_length=80, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    notes = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Visitation Request: {self.requester_name} ({self.get_visitation_type_display()})"


class ExternalResourceLink(models.Model):
    key = models.CharField(max_length=100, unique=True)
    url = models.URLField(max_length=500)
    resolved_at = models.DateTimeField()

    def __str__(self):
        return self.key


class BusinessMeeting(models.Model):
    STATUS_CHOICES = [('upcoming', 'Upcoming'), ('completed', 'Completed'), ('archived', 'Archived')]
    title = models.CharField(max_length=160)
    meeting_date = models.DateField()
    meeting_time = models.CharField(max_length=80, blank=True, default='2:00 PM')
    location = models.CharField(max_length=160, blank=True, default='Main Sanctuary')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='upcoming')
    minutes = models.TextField(blank=True, default='')
    notify_sms = models.BooleanField(default=True)
    notify_email = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-meeting_date']

    def __str__(self):
        return f"Business Meeting: {self.title} ({self.meeting_date})"


class BusinessMeetingAgenda(models.Model):
    meeting = models.ForeignKey(BusinessMeeting, on_delete=models.CASCADE, related_name='agendas')
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default='')
    order = models.PositiveIntegerField(default=1)
    document = models.FileField(upload_to='business-meeting-docs/', blank=True, null=True)
    document_name = models.CharField(max_length=160, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order', 'id']

    def __str__(self):
        return f"Agenda: {self.title} ({self.meeting.title})"


class TreasuryAccount(models.Model):
    ACCOUNT_TYPE_CHOICES = [
        ('bank', 'Bank Account'),
        ('mobile_money', 'Mobile Money / Paybill'),
        ('cash', 'Cash / Petty Cash'),
        ('other', 'Other Account'),
    ]
    name = models.CharField(max_length=160)
    account_number = models.CharField(max_length=80, blank=True, default='')
    account_type = models.CharField(max_length=30, choices=ACCOUNT_TYPE_CHOICES, default='bank')
    balance = models.DecimalField(max_digits=14, decimal_places=2, default=0.00)
    description = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.get_account_type_display()}) - KES {self.balance}"


class TreasuryAccountTransaction(models.Model):
    TRANSACTION_TYPE_CHOICES = [
        ('credit', 'Credit (Deposit / Inflow)'),
        ('debit', 'Debit (Expenditure / Outflow)'),
        ('transfer_in', 'Transfer In'),
        ('transfer_out', 'Transfer Out'),
    ]
    account = models.ForeignKey(TreasuryAccount, on_delete=models.CASCADE, related_name='transactions')
    transaction_type = models.CharField(max_length=20, choices=TRANSACTION_TYPE_CHOICES)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    description = models.CharField(max_length=255)
    reference = models.CharField(max_length=100, blank=True, default='')
    related_account = models.ForeignKey(TreasuryAccount, on_delete=models.SET_NULL, null=True, blank=True, related_name='related_transactions')
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.get_transaction_type_display()}: KES {self.amount} - {self.account.name}"


class Expenditure(models.Model):
    CATEGORY_CHOICES = [
        ('operations', 'Church Operations'),
        ('evangelism', 'Evangelism & Missions'),
        ('utilities', 'Utilities (Water, Power, Net)'),
        ('maintenance', 'Maintenance & Repairs'),
        ('welfare', 'Welfare & Assistance'),
        ('sabbath_school', 'Sabbath School Materials'),
        ('building', 'Building & Development'),
        ('other', 'Other Expenditure'),
    ]
    PAYMENT_METHOD_CHOICES = [
        ('cash', 'Cash'),
        ('mpesa', 'M-Pesa / Mobile'),
        ('bank_transfer', 'Bank Transfer'),
        ('cheque', 'Cheque'),
    ]
    title = models.CharField(max_length=200)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    category = models.CharField(max_length=40, choices=CATEGORY_CHOICES, default='operations')
    account = models.ForeignKey(TreasuryAccount, on_delete=models.SET_NULL, null=True, blank=True, related_name='expenditures')
    payment_method = models.CharField(max_length=30, choices=PAYMENT_METHOD_CHOICES, default='cash')
    vendor_payee = models.CharField(max_length=160, blank=True, default='')
    receipt_number = models.CharField(max_length=80, blank=True, default='')
    expenditure_date = models.DateField(default=timezone.localdate)
    notes = models.TextField(blank=True, default='')
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-expenditure_date', '-created_at']

    def __str__(self):
        return f"Expenditure: {self.title} (KES {self.amount})"
