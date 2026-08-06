from django.contrib import admin

from .models import Announcement, BoardMeeting, ChildDedicationRequest, ChurchBudget, ChurchCorrespondence, ChurchFinancialReport, ChurchNotification, ChurchSettings, Contribution, EnrollmentRequest, GivingPurpose, MemberProfile, MembershipTransferRequest, PrayerRequest, SabbathEvent, Testimony, VisitationRequest

admin.site.register(MemberProfile)
admin.site.register(Contribution)
admin.site.register(ChurchFinancialReport)
admin.site.register(ChurchBudget)
admin.site.register(PrayerRequest)
admin.site.register(SabbathEvent)
admin.site.register(GivingPurpose)
admin.site.register(EnrollmentRequest)
admin.site.register(MembershipTransferRequest)
admin.site.register(ChurchCorrespondence)
admin.site.register(BoardMeeting)
admin.site.register(ChurchNotification)


@admin.register(VisitationRequest)
class VisitationRequestAdmin(admin.ModelAdmin):
    list_display = ('requester_name', 'visitation_type', 'phone_number', 'preferred_date', 'preferred_time', 'latitude', 'longitude', 'status', 'created_at')
    list_filter = ('status', 'visitation_type', 'created_at')
    search_fields = ('requester_name', 'phone_number', 'location_description', 'notes')


@admin.register(Testimony)
class TestimonyAdmin(admin.ModelAdmin):
    list_display = ('name', 'testimony_text', 'status', 'created_at')
    list_filter = ('status', 'created_at')
    search_fields = ('name', 'testimony_text')
    actions = ['approve_testimonies', 'reject_testimonies']

    @admin.action(description='Approve selected testimonies for public display')
    def approve_testimonies(self, request, queryset):
        queryset.update(status='approved')

    @admin.action(description='Reject selected testimonies')
    def reject_testimonies(self, request, queryset):
        queryset.update(status='rejected')


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


@admin.register(ChurchSettings)
class ChurchSettingsAdmin(admin.ModelAdmin):
    fieldsets = (
        ('Church location', {'fields': ('church_name', 'address', 'latitude', 'longitude')}),
        ('Regular gatherings', {'fields': ('midweek_vespers_time', 'midweek_vespers_link', 'friday_vespers_time', 'sabbath_time')}),
    )

    def has_add_permission(self, request):
        return not ChurchSettings.objects.exists()
