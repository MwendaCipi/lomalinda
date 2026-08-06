from django.conf import settings
from django.db import models
import uuid


class MemberProfile(models.Model):
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
    role = models.CharField(max_length=30, default='member', choices=ROLE_CHOICES)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.get_username()} ({self.get_role_display()})"


class EnrollmentRequest(models.Model):
    STATUS_CHOICES = [('pending', 'Pending'), ('completed', 'Completed'), ('expired', 'Expired')]
    email = models.EmailField(unique=True)
    first_name = models.CharField(max_length=150, blank=True)
    last_name = models.CharField(max_length=150, blank=True)
    phone_number = models.CharField(max_length=20, blank=True)
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
    STATUS_CHOICES = [('pending', 'Pending'), ('completed', 'Completed'), ('failed', 'Failed'), ('cancelled', 'Cancelled')]
    member = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='contributions', null=True, blank=True)
    donor_name = models.CharField(max_length=160, blank=True)
    donor_email = models.EmailField(blank=True)
    giving_type = models.CharField(max_length=20, choices=GIVING_TYPE_CHOICES, default='financial')
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    currency = models.CharField(max_length=3, default='KES')
    purpose = models.CharField(max_length=120, default='General giving')
    item_description = models.TextField(blank=True)
    phone_number = models.CharField(max_length=20, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    mpesa_receipt_number = models.CharField(max_length=64, unique=True, null=True, blank=True)
    checkout_request_id = models.CharField(max_length=128, unique=True, null=True, blank=True)
    merchant_request_id = models.CharField(max_length=128, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']


class GivingPurpose(models.Model):
    name = models.CharField(max_length=120, unique=True)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class ChurchFinancialReport(models.Model):
    title = models.CharField(max_length=160)
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
    anonymous = models.BooleanField(default=True)
    status = models.CharField(max_length=20, choices=[('new', 'New'), ('prayed', 'Prayed'), ('closed', 'Closed')], default='new')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']


class Testimony(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    name = models.CharField(max_length=160, blank=True)
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
    phone_number = models.CharField(max_length=40, blank=True)
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
