from django.contrib import admin

from .models import Announcement, ChurchBudget, ChurchFinancialReport, ChurchSettings, Contribution, EnrollmentRequest, GivingPurpose, MemberProfile, PrayerRequest, SabbathEvent

admin.site.register(MemberProfile)
admin.site.register(Contribution)
admin.site.register(ChurchFinancialReport)
admin.site.register(ChurchBudget)
admin.site.register(PrayerRequest)
admin.site.register(SabbathEvent)
admin.site.register(GivingPurpose)
admin.site.register(EnrollmentRequest)
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
