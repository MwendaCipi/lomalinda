from django.contrib.auth.models import Group, Permission
from django.core.management.base import BaseCommand
from django_tenants.utils import schema_context, get_tenant_model

from members.models import GivingPurpose


class Command(BaseCommand):
    help = (
        "Seed production-safe defaults only: church role groups and the default "
        "giving purposes. Creates no demo members, contributions, or other sample data."
    )

    ROLE_PERMISSION_MODELS = (
        'sabbathevent', 'churchsettings', 'churchfinancialreport',
        'churchbudget', 'prayerrequest',
    )

    DEFAULT_PURPOSES = [
        ('Tithe', 'tithe'),
        ('Combined Offering', 'combined_offering'),
        ('13th Sabbath', '13th_sabbath'),
        ('Camp Expenses', 'camp_expenses'),
        ('Camp Goal', 'camp_goal'),
        ('Local Church Budget', 'local_church_budget'),
    ]

    def handle(self, *args, **options):
        TenantModel = get_tenant_model()

        # Role groups live in every schema, including the shared public schema.
        with schema_context('public'):
            self.seed_role_groups()

        for tenant in TenantModel.objects.exclude(schema_name='public'):
            with schema_context(tenant.schema_name):
                self.stdout.write(self.style.SUCCESS(f"--- Seeding defaults for schema: {tenant.schema_name} ({tenant.name}) ---"))
                self.seed_role_groups()
                self.seed_giving_purposes()

    def seed_role_groups(self):
        """Create the church role groups with their permission sets (idempotent)."""
        permissions = Permission.objects.filter(
            content_type__app_label='members',
            content_type__model__in=self.ROLE_PERMISSION_MODELS,
        )
        view_permissions = permissions.filter(codename__startswith='view_')

        role_permissions = {
            'Administrators': permissions,
            'Church Leaders': permissions,
            'Finance Team': permissions.filter(content_type__model__in={'churchfinancialreport', 'churchbudget'}),
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

    def seed_giving_purposes(self):
        """Ensure the default giving purposes exist and everything else is inactive."""
        for name, account_name in self.DEFAULT_PURPOSES:
            purpose, created = GivingPurpose.objects.get_or_create(
                name=name,
                defaults={'account_name': account_name, 'active': True},
            )
            if not created:
                update_fields = []
                if not purpose.active:
                    purpose.active = True
                    update_fields.append('active')
                if not purpose.account_name and account_name:
                    purpose.account_name = account_name
                    update_fields.append('account_name')
                if update_fields:
                    purpose.save(update_fields=update_fields)

        default_names = [name for name, _ in self.DEFAULT_PURPOSES]
        deactivated = (
            GivingPurpose.objects.exclude(name__in=default_names).filter(active=True).update(active=False)
        )

        self.stdout.write(self.style.SUCCESS(
            f"Verified {len(default_names)} default giving purposes "
            f"({deactivated} other purpose(s) deactivated)."
        ))
