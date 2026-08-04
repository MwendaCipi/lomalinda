from django.contrib import admin

from .models import Contribution, MemberProfile

admin.site.register(MemberProfile)
admin.site.register(Contribution)
