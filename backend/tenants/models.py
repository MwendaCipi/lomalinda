from django.conf import settings
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


class GoogleIdentity(models.Model):
    """A member's Google account, linked to the church account it signs in to.

    This lives in the shared app rather than in ``members`` because
    ``django.contrib.auth`` is a SHARED_APP: one user row serves every tenant,
    so the link pointing at that row has to be shared too.

    The link is keyed on Google's ``sub`` (subject) claim, which is stable for
    the life of the Google account, rather than on the email address. A member
    who renames their Gmail address therefore keeps signing in as themselves.
    The address Google last reported is kept alongside purely so the office can
    answer "which Google account is this?" — it is never the lookup key.
    """

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='google_identity')
    sub = models.CharField(max_length=255, unique=True, help_text="Google's stable subject id for the account")
    email = models.EmailField(help_text='The Google address when it was linked; for support, not for lookup')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.email} → {self.user.username}'
