from django.contrib import admin

from .models import ChurchFinancialReport, Contribution, MemberProfile, PrayerRequest, SabbathEvent

admin.site.register(MemberProfile)
admin.site.register(Contribution)
admin.site.register(ChurchFinancialReport)
admin.site.register(PrayerRequest)
admin.site.register(SabbathEvent)
