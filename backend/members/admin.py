from django.contrib import admin

from .models import ChurchBudget, ChurchFinancialReport, ChurchSettings, Contribution, MemberProfile, PrayerRequest, SabbathEvent

admin.site.register(MemberProfile)
admin.site.register(Contribution)
admin.site.register(ChurchFinancialReport)
admin.site.register(ChurchBudget)
admin.site.register(PrayerRequest)
admin.site.register(SabbathEvent)


@admin.register(ChurchSettings)
class ChurchSettingsAdmin(admin.ModelAdmin):
    fieldsets = (
        ('Church location', {'fields': ('church_name', 'address', 'latitude', 'longitude')}),
        ('Regular gatherings', {'fields': ('midweek_vespers_time', 'midweek_vespers_link', 'friday_vespers_time', 'sabbath_time')}),
    )

    def has_add_permission(self, request):
        return not ChurchSettings.objects.exists()
