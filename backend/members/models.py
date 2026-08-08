from django.conf import settings
from django.db import models
from django.utils import timezone
import uuid


class MemberProfile(models.Model):
    ACCOUNT_TYPE_CHOICES = [('member', 'Member'), ('friend', 'Friend of Loma Linda')]
    ROLE_CHOICES = [
        ('member', 'Member'),
        ('clerk', 'Church Clerk'),
        ('elder', 'Elder / First Elder'),
        ('youth_leader', 'Youth Ministries Leader'),
        ('choir_director', 'Choir Director'),
        ('children_ministry', 'Children Ministry'),
        ('men_ministry', 'Adventist Men Ministries'),
        ('women_ministry', 'Adventist Women Ministries'),
        ('chaplaincy', 'Chaplaincy'),
        ('finance', 'Finance Team'),
        ('treasurer', 'Treasurer'),
        ('leader', 'Church Leader'),
        ('admin', 'Administrator'),
    ]
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='member_profile')
    phone_number = models.CharField(max_length=20, blank=True)
    account_type = models.CharField(max_length=20, choices=ACCOUNT_TYPE_CHOICES, default='member')
    role = models.CharField(max_length=30, default='member', choices=ROLE_CHOICES)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.get_username()} ({self.get_role_display()})"


class EnrollmentRequest(models.Model):
    STATUS_CHOICES = [('verification_pending', 'Verification pending'), ('pending', 'Pending approval'), ('approved', 'Approved'), ('rejected', 'Rejected'), ('completed', 'Completed'), ('expired', 'Expired')]
    JOINING_MODE_CHOICES = [('baptism', 'Baptism'), ('membership_transfer', 'Membership transfer'), ('friend', 'Friend of Loma Linda')]
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
    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.email


class Announcement(models.Model):
    VISIBILITY_CHOICES = [('public', 'Public'), ('members', 'Members only')]
    title = models.CharField(max_length=160)
    text = models.TextField()
    detail = models.TextField(blank=True)
    href = models.CharField(max_length=255, blank=True)
    visibility = models.CharField(max_length=20, choices=VISIBILITY_CHOICES, default='public')
    published = models.BooleanField(default=True)
    expires_at = models.DateField(null=True, blank=True, help_text="Date up to which the announcement will be displayed")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.title


class Contribution(models.Model):
    GIVING_TYPE_CHOICES = [('financial', 'Financial'), ('in_kind', 'In-kind')]
    PAYMENT_METHOD_CHOICES = [('mpesa', 'M-Pesa'), ('card', 'Card')]
    STATUS_CHOICES = [('pending', 'Pending'), ('completed', 'Completed'), ('failed', 'Failed'), ('cancelled', 'Cancelled')]
    member = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='contributions', null=True, blank=True)
    donor_name = models.CharField(max_length=160, blank=True)
    donor_email = models.EmailField(blank=True)
    giving_type = models.CharField(max_length=20, choices=GIVING_TYPE_CHOICES, default='financial')
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    currency = models.CharField(max_length=3, default='KES')
    purpose = models.CharField(max_length=120, default='General giving')
    campaign = models.ForeignKey('FundraisingCampaign', on_delete=models.SET_NULL, null=True, blank=True, related_name='contributions')
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


class SupportSubmission(models.Model):
    TYPE_CHOICES = [('idea', 'Idea'), ('moral_support', 'Prayer and moral support')]
    member = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='support_submissions')
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
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class FundraisingCampaign(models.Model):
    name = models.CharField(max_length=120, unique=True, help_text="Campaign name, also used as M-Pesa account reference name and giving purpose")
    title = models.CharField(max_length=160, blank=True, help_text="Public display title")
    description = models.TextField(blank=True)
    target_amount = models.DecimalField(max_digits=12, decimal_places=2)
    start_date = models.DateField(default=timezone.now)
    end_date = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    generate_card = models.BooleanField(default=True)
    custom_card_image = models.ImageField(upload_to='campaign_cards/', null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_campaigns')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.name


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
    church_name = models.CharField(max_length=160, default='Loma Linda SDA Church, Meru')
    address = models.CharField(max_length=255, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    midweek_vespers_link = models.URLField(blank=True)
    live_service_link = models.URLField(blank=True)
    live_service_active = models.BooleanField(default=False)
    midweek_vespers_time = models.CharField(max_length=120, default='Wednesday · 8:00 PM – 9:00 PM')
    friday_vespers_time = models.CharField(max_length=120, default='Friday · 5:30 PM – 6:30 PM')
    sabbath_time = models.CharField(max_length=120, default='Saturday · 8:00 AM – 4:00 PM')
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
    agenda = models.TextField(help_text="Meeting agenda items")
    minutes = models.TextField(blank=True, help_text="Recorded board meeting minutes")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='upcoming')
    reference_file = models.FileField(upload_to='board-materials/', blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-meeting_date']

    def __str__(self):
        return f"Board Meeting: {self.title} ({self.meeting_date})"


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
