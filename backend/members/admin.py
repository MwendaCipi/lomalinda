import uuid
from datetime import timedelta

from django.contrib import admin
from django.utils import timezone

from .models import Announcement, BoardMeeting, ChildDedicationRequest, ChurchBudget, ChurchCorrespondence, ChurchFinancialReport, ChurchNotification, ChurchSettings, Contribution, EnrollmentRequest, ExternalResourceLink, Friend, GivingPurpose, Invitation, MemberProfile, MembershipRemovalRequest, MembershipTransferRequest, PendingTestimony, PrayerRequest, Profession, SabbathEvent, SupportSubmission, Testimony, VisitationRequest

admin.site.register(MemberProfile)
admin.site.register(Contribution)
admin.site.register(ChurchFinancialReport)
admin.site.register(ChurchBudget)
admin.site.register(PrayerRequest)
admin.site.register(SabbathEvent)
admin.site.register(GivingPurpose)
admin.site.register(Profession)
@admin.register(EnrollmentRequest)
class EnrollmentRequestAdmin(admin.ModelAdmin):
    list_display = ('email', 'first_name', 'last_name', 'joining_mode', 'status', 'created_at')
    list_filter = ('joining_mode', 'status', 'created_at')
    search_fields = ('email', 'first_name', 'last_name', 'phone_number')
    actions = ['approve_requests', 'reject_requests']

    @admin.action(description='Approve requests and send account emails')
    def approve_requests(self, request, queryset):
        approved = 0
        for enrollment in queryset.filter(status='pending'):
            enrollment.status = 'approved'
            enrollment.save(update_fields=['status'])
            if enrollment.user_id:
                enrollment.user.is_active = True
                enrollment.user.save(update_fields=['is_active'])
            else:
                enrollment.token = uuid.uuid4()
                enrollment.expires_at = timezone.now() + timedelta(hours=48)
                enrollment.save(update_fields=['token', 'expires_at'])
                from .views import send_enrollment_email
                send_enrollment_email(enrollment)
            approved += 1
        self.message_user(request, f'{approved} request(s) approved and emailed.')

    @admin.action(description='Reject selected requests')
    def reject_requests(self, request, queryset):
        queryset.filter(status='pending').update(status='rejected')
admin.site.register(ExternalResourceLink)
admin.site.register(Friend)
admin.site.register(MembershipTransferRequest)
admin.site.register(MembershipRemovalRequest)
admin.site.register(ChurchCorrespondence)
admin.site.register(BoardMeeting)
admin.site.register(ChurchNotification)


@admin.register(SupportSubmission)
class SupportSubmissionAdmin(admin.ModelAdmin):
    list_display = ('submission_type', 'category', 'member', 'anonymous', 'created_at')
    list_filter = ('submission_type', 'anonymous', 'created_at')
    search_fields = ('content', 'category', 'member__username', 'member__email')


@admin.register(VisitationRequest)
class VisitationRequestAdmin(admin.ModelAdmin):
    list_display = ('requester_name', 'visitation_type', 'phone_number', 'preferred_date', 'preferred_time', 'latitude', 'longitude', 'status', 'created_at')
    list_filter = ('status', 'visitation_type', 'created_at')
    search_fields = ('requester_name', 'phone_number', 'location_description', 'notes')


@admin.register(Testimony)
class TestimonyAdmin(admin.ModelAdmin):
    list_display = ('name', 'testimony_text', 'ip_address', 'status', 'created_at')
    list_filter = ('status', 'created_at')
    search_fields = ('name', 'testimony_text', 'ip_address')
    actions = ['approve_testimonies', 'reject_testimonies']

    @admin.action(description='Approve selected testimonies for public display')
    def approve_testimonies(self, request, queryset):
        queryset.update(status='approved')

    @admin.action(description='Reject selected testimonies')
    def reject_testimonies(self, request, queryset):
        queryset.update(status='rejected')


@admin.register(PendingTestimony)
class PendingTestimonyAdmin(admin.ModelAdmin):
    list_display = ('email', 'name', 'status', 'created_at', 'reviewed_at')
    list_filter = ('status', 'created_at', 'reviewed_at')
    search_fields = ('email', 'name', 'testimony_text')
    actions = ['approve_pending_testimonies', 'reject_pending_testimonies']

    @admin.action(description='Approve pending testimonies')
    def approve_pending_testimonies(self, request, queryset):
        from django.utils import timezone
        for pending in queryset.filter(status='pending_review'):
            friend, _ = Friend.objects.get_or_create(email=pending.email, defaults={'name': pending.name, 'phone_number': pending.phone_number})
            if pending.name and friend.name != pending.name:
                friend.name = pending.name
                friend.save(update_fields=['name', 'updated_at'])
            Testimony.objects.create(friend=friend, email=pending.email, name=pending.name, phone_number=pending.phone_number, testimony_text=pending.testimony_text, status='approved')
            pending.status = 'approved'
            pending.reviewed_at = timezone.now()
            pending.save(update_fields=['status', 'reviewed_at'])

    @admin.action(description='Reject pending testimonies')
    def reject_pending_testimonies(self, request, queryset):
        from django.utils import timezone
        queryset.filter(status='pending_review').update(status='rejected', reviewed_at=timezone.now())


@admin.register(ChildDedicationRequest)
class ChildDedicationRequestAdmin(admin.ModelAdmin):
    list_display = ('child_name', 'child_dob', 'father_name', 'mother_name', 'phone_number', 'status', 'created_at')
    list_filter = ('status', 'child_dob', 'created_at')
    search_fields = ('child_name', 'father_name', 'mother_name', 'phone_number')
@admin.register(Announcement)
class AnnouncementAdmin(admin.ModelAdmin):
    list_display = ('title', 'visibility', 'published', 'expires_at', 'created_at')
    list_filter = ('visibility', 'published', 'expires_at', 'created_at')
    search_fields = ('title', 'text')


@admin.register(Invitation)
class InvitationAdmin(admin.ModelAdmin):
    """Platform console: invite a church administrator without a shell.

    Saving a new invitation emails the invitation link, so the superuser can
    onboard the first church administrator straight from this page.
    """

    list_display = ('email', 'first_name', 'last_name', 'account_type', 'roles', 'status', 'sent_at', 'expires_at')
    list_filter = ('status', 'account_type', 'created_at')
    search_fields = ('email', 'first_name', 'last_name')
    readonly_fields = ('token', 'status', 'sent_at', 'accepted_at', 'expires_at', 'invited_by', 'user', 'created_at')
    actions = ['resend_invitations', 'revoke_invitations']

    def save_model(self, request, obj, form, change):
        is_new = obj.pk is None
        if not obj.roles:
            obj.roles = 'member'
        if not obj.expires_at:
            obj.expires_at = timezone.now() + timedelta(days=7)
        if not obj.invited_by_id:
            obj.invited_by = request.user
        if 'token' in form.initial or not obj.token:
            obj.token = uuid.uuid4()
        super().save_model(request, obj, form, change)
        if is_new:
            from .views import send_invitation_email
            try:
                send_invitation_email(obj)
                obj.sent_at = timezone.now()
                obj.save(update_fields=['sent_at'])
                self.message_user(request, f'Invitation emailed to {obj.email}.')
            except Exception:
                self.message_user(
                    request,
                    'Invitation saved, but the email could not be sent. Check the EMAIL_* settings, then use the resend action.',
                )

    @admin.action(description='Resend invitation emails')
    def resend_invitations(self, request, queryset):
        from .views import send_invitation_email
        sent = failed = 0
        for invitation in queryset.exclude(status='accepted'):
            invitation.token = uuid.uuid4()
            invitation.status = 'pending'
            invitation.expires_at = timezone.now() + timedelta(days=7)
            invitation.save(update_fields=['token', 'status', 'expires_at'])
            try:
                send_invitation_email(invitation)
                invitation.sent_at = timezone.now()
                invitation.save(update_fields=['sent_at'])
                sent += 1
            except Exception:
                failed += 1
        self.message_user(request, f'{sent} invitation email(s) sent, {failed} failed.')

    @admin.action(description='Revoke selected invitations')
    def revoke_invitations(self, request, queryset):
        updated = queryset.exclude(status='accepted').update(status='revoked')
        self.message_user(request, f'{updated} invitation(s) revoked.')


@admin.register(ChurchSettings)
class ChurchSettingsAdmin(admin.ModelAdmin):
    fieldsets = (
        ('Church location', {'fields': ('church_name', 'district', 'field', 'conference', 'address', 'latitude', 'longitude')}),
        ('Regular gatherings', {'fields': ('midweek_vespers_time', 'midweek_vespers_link', 'friday_vespers_time', 'sabbath_time')}),
        ('Live service', {'fields': ('live_service_link', 'live_service_active')}),
    )

    def has_add_permission(self, request):
        return not ChurchSettings.objects.exists()
