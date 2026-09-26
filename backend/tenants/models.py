from django.db import models
from django_tenants.models import DomainMixin, TenantMixin


class ChurchTenant(TenantMixin):
    name = models.CharField(max_length=160)
    created_on = models.DateField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    # Automatically create schema on save
    auto_create_schema = True

    def __str__(self):
        return self.name


class Domain(DomainMixin):
    pass

