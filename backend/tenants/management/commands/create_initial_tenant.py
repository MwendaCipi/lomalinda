from django.core.management.base import BaseCommand
from tenants.models import ChurchTenant, Domain


class Command(BaseCommand):
    help = "Creates the public schema tenant and the default church tenant."

    def add_arguments(self, parser):
        parser.add_argument('--public-domain', type=str, default='lomalindachurch.org', help='Primary public domain')
        parser.add_argument('--tenant-domain', type=str, default='church.lomalindachurch.org', help='First church tenant domain')
        parser.add_argument('--tenant-name', type=str, default='Loma Linda SDA Church, Meru', help='First church tenant name')

    def handle(self, *args, **options):
        public_domain_name = options['public_domain']
        tenant_domain_name = options['tenant_domain']
        tenant_name = options['tenant_name']

        # 1. Create public tenant
        public_tenant, created = ChurchTenant.objects.get_or_create(
            schema_name='public',
            defaults={'name': 'Public System Schema', 'is_active': True}
        )
        if created:
            self.stdout.write(self.style.SUCCESS("Created 'public' schema tenant."))
        else:
            self.stdout.write("Public schema tenant already exists.")

        domain, created = Domain.objects.get_or_create(
            domain=public_domain_name,
            defaults={'tenant': public_tenant, 'is_primary': True}
        )
        if created:
            self.stdout.write(self.style.SUCCESS(f"Created domain '{public_domain_name}' for public tenant."))

        # Also add localhost to public schema if not present
        Domain.objects.get_or_create(
            domain='localhost',
            defaults={'tenant': public_tenant, 'is_primary': False}
        )
        Domain.objects.get_or_create(
            domain='127.0.0.1',
            defaults={'tenant': public_tenant, 'is_primary': False}
        )

        # 2. Create default church tenant schema
        church_tenant, created = ChurchTenant.objects.get_or_create(
            schema_name='loma_linda',
            defaults={'name': tenant_name, 'is_active': True}
        )
        if created:
            self.stdout.write(self.style.SUCCESS(f"Created church tenant '{tenant_name}' with schema 'loma_linda'."))
        else:
            self.stdout.write(f"Church tenant '{tenant_name}' already exists.")

        domain, created = Domain.objects.get_or_create(
            domain=tenant_domain_name,
            defaults={'tenant': church_tenant, 'is_primary': True}
        )
        if created:
            self.stdout.write(self.style.SUCCESS(f"Created domain '{tenant_domain_name}' for tenant '{tenant_name}'."))
