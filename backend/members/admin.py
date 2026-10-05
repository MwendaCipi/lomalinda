import uuid
from datetime import timedelta

from django import forms
from django.conf import settings
from django.contrib import admin
from django.db.models import Q
from django.utils import timezone
from django.utils.html import escape, format_html, mark_safe

from .models import Announcement, BoardMeeting, ChildDedicationRequest, ChurchBudget, ChurchCorrespondence, ChurchEvent, ChurchFinancialReport, ChurchNotification, ChurchSettings, Contribution, EnrollmentRequest, ExternalResourceLink, Friend, Invitation, MemberProfile, MembershipRemovalRequest, MembershipTransferRequest, PendingTestimony, PrayerRequest, Profession, SabbathEvent, SupportSubmission, Testimony, VisitationRequest, WeeklyMeeting
from .roles import (
    ADMIN_ROLE,
    ROLE_CHOICES,
    ROLE_GROUP_MAP,
    is_system_role,
    normalize_roles,
    role_labels,
)
from .views import invitation_link_lifetime


class RoleListFilter(admin.SimpleListFilter):
    """Filter accounts by one of the hard-coded church roles."""

    title = 'church role'
    parameter_name = 'role'

    def lookups(self, request, model_admin):
        return ROLE_CHOICES

    def queryset(self, request, queryset):
        """Match a whole role code inside the comma-separated roles column."""
        value = self.value()
        if not value:
            return queryset
        return queryset.filter(
            Q(roles=value)
            | Q(roles__startswith=f'{value},')
            | Q(roles__endswith=f', {value}')
            | Q(roles__contains=f', {value},')
        )


class ChurchRolesFormMixin(forms.ModelForm):
    """Edit the church roles as a tick list of the fixed role codes.

    The stored column is still the comma-separated ``roles`` string, but nobody
    has to type role codes by hand - the Administrator system role cannot be
    dropped by a non-superuser.
    """

    roles = forms.MultipleChoiceField(
        choices=ROLE_CHOICES,
        required=False,
        widget=forms.CheckboxSelectMultiple,
        label='Church roles',
        help_text='Hard-coded roles; Administrator always carries every permission.',
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance and self.instance.pk:
            existing = self.instance.get_roles() if hasattr(self.instance, 'get_roles') else self.instance.role_codes()
            self.initial['roles'] = [code for code in existing if code in dict(ROLE_CHOICES)]

    def clean_roles(self):
        codes = normalize_roles(self.cleaned_data.get('roles'))
        if self.instance and self.instance.pk:
            existing = self.instance.get_roles() if hasattr(self.instance, 'get_roles') else self.instance.role_codes()
            actor = getattr(self, 'request_user', None)
            if ADMIN_ROLE in existing and ADMIN_ROLE not in codes and not getattr(actor, 'is_superuser', False):
                raise forms.ValidationError(
                    'Administrator is a system role: only a superuser can remove it.'
                )
        return codes

    def save(self, commit=True):
        instance = super().save(commit=False)
        codes = normalize_roles(self.cleaned_data.get('roles'))
        instance.roles = ', '.join(codes)
        if hasattr(instance, 'role'):
            instance.role = codes[0]
        if commit:
            instance.save()
            self.save_m2m()
        return instance


class MemberProfileRolesForm(ChurchRolesFormMixin):
    class Meta:
        model = MemberProfile
        exclude = ('role',)  # derived from the roles tick list


class InvitationRolesForm(ChurchRolesFormMixin):
    class Meta:
        model = Invitation
        fields = '__all__'


class ChurchRolesAdminMixin:
    """Show the roles an account holds, plus the full role list, in the admin."""

    readonly_fields = ('roles_legend',)

    @admin.display(description='Roles')
    def role_display(self, obj):
        codes = obj.get_roles() if hasattr(obj, 'get_roles') else obj.role_codes()
        return role_labels(codes)

    @admin.display(description='Church roles (hard-coded - edit members/roles.py)')
    def roles_legend(self, obj=None):
        rows = ''.join(
            '<tr><td style="padding:2px 14px 2px 0"><strong>{}</strong></td>'
            '<td style="padding:2px 14px 2px 0">{}</td><td>{}</td></tr>'.format(
                escape(label),
                escape(ROLE_GROUP_MAP.get(code) or '-'),
                'System role - all permissions' if is_system_role(code) else '',
            )
            for code, label in ROLE_CHOICES
        )
        return format_html('<table style="border-collapse:collapse">{}</table>', mark_safe(rows))


@admin.register(MemberProfile)
class MemberProfileAdmin(ChurchRolesAdminMixin, admin.ModelAdmin):
    """Church accounts: the roles list is ticked from the fixed role codes."""

    form = MemberProfileRolesForm
    list_display = ('user', 'role_display', 'account_type', 'is_disfellowshipped', 'updated_at')
    list_filter = ('account_type', 'is_disfellowshipped', RoleListFilter)
    list_select_related = ('user',)
    search_fields = ('user__username', 'user__email', 'user__first_name', 'user__last_name', 'phone_number')
    fields = (
        'user', 'account_type', 'roles', 'roles_legend', 'phone_number', 'whatsapp_number',
        'current_church', 'baptismal_status', 'profession', 'residence', 'gender',
        'date_of_birth', 'gifts', 'ministry', 'disability', 'is_disfellowshipped',
    )

    def get_form(self, request, obj=None, change=False, **kwargs):
        form_class = super().get_form(request, obj, change=change, **kwargs)
        # The form needs to know who is editing, to protect the system role.
        form_class.request_user = request.user
        return form_class


admin.site.register(Contribution)
admin.site.register(ChurchFinancialReport)
admin.site.register(ChurchBudget)
admin.site.register(PrayerRequest)
admin.site.register(SabbathEvent)
admin.site.register(Profession)
@admin.register(EnrollmentRequest)
class EnrollmentRequestAdmin(admin.ModelAdmin):
    list_display = ('email', 'first_name', 'last_name', 'joining_mode', 'status', 'created_at', 'expires_at')
    list_filter = ('joining_mode', 'status', 'created_at', 'expires_at')
    search_fields = ('email', 'first_name', 'last_name', 'phone_number')
    actions = ['approve_requests', 'reject_requests', 'cleanup_expired_requests']

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
                enrollment.set_code()
                enrollment.expires_at = timezone.now() + timedelta(hours=48)
                enrollment.save(update_fields=['token', 'code', 'expires_at'])
                from .views import send_enrollment_email
                send_enrollment_email(enrollment)
            approved += 1
        self.message_user(request, f'{approved} request(s) approved and emailed.')

    @admin.action(description='Reject selected requests')
    def reject_requests(self, request, queryset):
        queryset.filter(status='pending').update(status='rejected')

    @admin.action(description='Delete expired requests older than...')
    def cleanup_expired_requests(self, request, queryset):
        """Delete expired enrollment requests that are older than 30 days.
        
        This is a convenience action that calls the management command logic.
        Only expired requests in non-completed statuses are affected.
        """
        from datetime import timedelta
        cutoff = timezone.now() - timedelta(days=30)
        expired = queryset.filter(
            expires_at__lt=cutoff,
            status__in=('verification_pending', 'pending', 'approved', 'rejected', 'expired'),
        )
        count = expired.count()
        if count == 0:
            self.message_user(request, 'No expired enrollment requests found to clean up.')
            return
        deleted, _ = expired.delete()
        self.message_user(request, f'Deleted {deleted} expired enrollment request(s) older than 30 days.')

    @admin.display(description='Days until expiry')
    def days_until_expiry(self, obj):
        if obj.expires_at:
            delta = obj.expires_at - timezone.now()
            if delta.days < 0:
                return format_html('<span style="color:red">Expired {} days ago</span>', abs(delta.days))
            elif delta.days == 0:
                return format_html('<span style="color:orange">Expires today</span>')
            else:
                return f'{delta.days} days'
        return '-'

    def get_actions(self, request):
        actions = super().get_actions(request)
        # Add a custom action that processes all expired requests, not just selected
        actions['cleanup_all_expired'] = (
            self._cleanup_all_expired,
            'cleanup_all_expired',
            'Delete ALL expired enrollment requests older than 30 days'
        )
        return actions

    def _cleanup_all_expired(self, request, queryset):
        """Delete ALL expired enrollment requests in the database older than 30 days."""
        from datetime import timedelta
        cutoff = timezone.now() - timedelta(days=30)
        expired = EnrollmentRequest.objects.filter(
            expires_at__lt=cutoff,
            status__in=('verification_pending', 'pending', 'approved', 'rejected', 'expired'),
        )
        count = expired.count()
        if count == 0:
            self.message_user(request, 'No expired enrollment requests found to clean up.')
            return
        deleted, _ = expired.delete()
        self.message_user(request, f'Deleted {deleted} expired enrollment request(s) older than 30 days from the entire database.')

    @admin.action(description='Delete expired requests (last 7 days)')
    def cleanup_expired_requests_7days(self, request, queryset):
        """Delete expired enrollment requests older than 7 days."""
        from datetime import timedelta
        cutoff = timezone.now() - timedelta(days=7)
        expired = queryset.filter(
            expires_at__lt=cutoff,
            status__in=('verification_pending', 'pending', 'approved', 'rejected', 'expired'),
        )
        count = expired.count()
        if count == 0:
            self.message_user(request, 'No expired enrollment requests found to clean up.')
            return
        deleted, _ = expired.delete()
        self.message_user(request, f'Deleted {deleted} expired enrollment request(s) older than 7 days.')

    @admin.action(description='Delete expired requests (last 14 days)')
    def cleanup_expired_requests_14days(self, request, queryset):
        """Delete expired enrollment requests older than 14 days."""
        from datetime import timedelta
        cutoff = timezone.now() - timedelta(days=14)
        expired = queryset.filter(
            expires_at__lt=cutoff,
            status__in=('verification_pending', 'pending', 'approved', 'rejected', 'expired'),
        )
        count = expired.count()
        if count == 0:
            self.message_user(request, 'No expired enrollment requests found to clean up.')
            return
        deleted, _ = expired.delete()
        self.message_user(request, f'Deleted {deleted} expired enrollment request(s) older than 14 days.')

    def changelist_view(self, request, extra_context=None):
        extra_context = extra_context or {}
        from datetime import timedelta
        cutoff_7 = timezone.now() - timedelta(days=7)
        cutoff_30 = timezone.now() - timedelta(days=30)
        extra_context['expired_7_days'] = EnrollmentRequest.objects.filter(
            expires_at__lt=cutoff_7,
            status__in=('verification_pending', 'pending', 'approved', 'rejected', 'expired'),
        ).count()
        extra_context['expired_30_days'] = EnrollmentRequest.objects.filter(
            expires_at__lt=cutoff_30,
            status__in=('verification_pending', 'pending', 'approved', 'rejected', 'expired'),
        ).count()
        return super().changelist_view(request, extra_context=extra_context)
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


@admin.register(ChurchEvent)
class ChurchEventAdmin(admin.ModelAdmin):
    list_display = ('title', 'happened_on', 'published', 'created_at')
    list_filter = ('published', 'happened_on')
    search_fields = ('title', 'description')


@admin.register(Invitation)
class InvitationAdmin(ChurchRolesAdminMixin, admin.ModelAdmin):
    """Platform console: invite a church administrator without a shell.

    Saving a new invitation emails the invitation link, so the superuser can
    onboard the first church administrator straight from this page.
    """

    form = InvitationRolesForm
    list_display = ('email', 'first_name', 'last_name', 'account_type', 'role_display', 'status', 'sent_at', 'expires_at')
    list_filter = ('status', 'account_type', 'created_at', RoleListFilter)
    search_fields = ('email', 'first_name', 'last_name')
    readonly_fields = ('invitation_link', 'status', 'sent_at', 'accepted_at', 'expires_at', 'invited_by', 'user', 'created_at', 'roles_legend')
    actions = ['resend_invitations', 'revoke_invitations']

    @admin.display(description='Invitation link and code (copy and share if the email is unavailable)')
    def invitation_link(self, obj):
        if not obj.pk:
            return 'The link appears here once the invitation is saved.'
        # Tokens and codes are stored hashed, so a saved invitation's raw link
        # is gone for good; resend the invitation (action below) to issue a
        # fresh link and code.
        return 'Tokens and codes are stored hashed, so the raw link and code are shown only right after the invitation is created. Use "Resend invitation emails" to issue a fresh pair.'

    def save_model(self, request, obj, form, change):
        is_new = obj.pk is None
        if not obj.roles:
            obj.roles = 'member'
        if not obj.expires_at:
            obj.expires_at = timezone.now() + invitation_link_lifetime()
        if not obj.invited_by_id:
            obj.invited_by = request.user
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
            invitation.set_token()
            invitation.set_code()
            invitation.status = 'pending'
            invitation.expires_at = timezone.now() + invitation_link_lifetime()
            invitation.save(update_fields=['token', 'code', 'status', 'expires_at'])
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


@admin.register(WeeklyMeeting)
class WeeklyMeetingAdmin(admin.ModelAdmin):
    """The church's ordinary week — the records behind the meeting panel,
    which the personal ministries leader keeps from the hub."""

    list_display = ('title', 'weekday', 'start_time', 'end_time', 'online', 'place', 'is_active', 'sort_order')
    list_filter = ('online', 'is_active', 'weekday')
    ordering = ('weekday', 'start_time')


@admin.register(ChurchSettings)
class ChurchSettingsAdmin(admin.ModelAdmin):
    fieldsets = (
        ('Church location', {'fields': ('church_name', 'district', 'field', 'conference', 'address', 'latitude', 'longitude')}),
        ('M-Pesa payment details', {'fields': ('mpesa_paybill_number', 'mpesa_account_number', 'mpesa_account_name', 'mpesa_phone_number')}),
    )

    def has_add_permission(self, request):
        return not ChurchSettings.objects.exists()
