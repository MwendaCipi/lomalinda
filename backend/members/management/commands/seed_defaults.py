from django.contrib.auth.models import Group, Permission
from django.core.management.base import BaseCommand
from django_tenants.utils import schema_context, get_tenant_model


class Command(BaseCommand):
    help = "Seed production-safe defaults only: church role groups. Creates no demo members, contributions, or other sample data."

    ROLE_PERMISSION_MODELS = (
        'sabbathevent', 'churchsettings', 'churchfinancialreport',
        'churchbudget', 'prayerrequest',
    )

    def handle(self, *args, **options):
        TenantModel = get_tenant_model()

        # Role groups live in every schema, including the shared public schema.
        with schema_context('public'):
            self.seed_role_groups()

        for tenant in TenantModel.objects.exclude(schema_name='public'):
            with schema_context(tenant.schema_name):
                self.stdout.write(self.style.SUCCESS(f"--- Seeding defaults for schema: {tenant.schema_name} ({tenant.name}) ---"))
                self.seed_role_groups()

    def seed_role_groups(self):
        """Create the church role groups with their permission sets (idempotent).

        Administrator is a system role, so its group holds every permission in
        the church app; the rest are scoped to their ministry's models.
        """
        all_permissions = Permission.objects.filter(content_type__app_label='members')
        permissions = all_permissions.filter(content_type__model__in=self.ROLE_PERMISSION_MODELS)
        view_permissions = permissions.filter(codename__startswith='view_')

        role_permissions = {
            'Administrators': all_permissions,
            'Church Leaders': permissions,
            # The treasurer's permission bundle. It used to be called "Finance
            # Team", a role the church has retired.
            'Treasury': permissions.filter(content_type__model__in={'churchfinancialreport', 'churchbudget'}),
            'Choir Director': view_permissions.filter(content_type__model='sabbathevent'),
            'Children Ministry': view_permissions.filter(content_type__model='sabbathevent'),
            'Adventist Men Ministries': view_permissions.filter(content_type__model='sabbathevent'),
            'Adventist Women Ministries': view_permissions.filter(content_type__model='sabbathevent'),
            'Chaplaincy': view_permissions.filter(content_type__model='prayerrequest'),
        }

        for name, role_permissions_queryset in role_permissions.items():
            group, _ = Group.objects.get_or_create(name=name)
            group.permissions.set(role_permissions_queryset)

        self.stdout.write(self.style.SUCCESS(f"Verified {len(role_permissions)} church role groups."))
