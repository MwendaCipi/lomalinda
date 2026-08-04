from django.conf import settings
from django.db import models


class MemberProfile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='member_profile')
    phone_number = models.CharField(max_length=20, blank=True)
    role = models.CharField(max_length=20, default='member', choices=[('member', 'Member'), ('leader', 'Leader'), ('admin', 'Admin')])
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.user.get_username()


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


class PrayerRequest(models.Model):
    request_text = models.TextField()
    name = models.CharField(max_length=160, blank=True)
    email = models.EmailField(blank=True)
    anonymous = models.BooleanField(default=True)
    status = models.CharField(max_length=20, choices=[('new', 'New'), ('prayed', 'Prayed'), ('closed', 'Closed')], default='new')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']


class SabbathEvent(models.Model):
    date = models.DateField(unique=True)
    name = models.CharField(max_length=160, default='Sabbath Worship')
    program_text = models.TextField(blank=True)
    program_file = models.FileField(upload_to='sabbath-programs/', blank=True, null=True)
    published = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['date']
