# Generated manually on 2026-09-21

from django.db import migrations

OLD_NAME = 'Loma Linda SDA Church, Meru'
NEW_NAME = 'SDA Loma Linda, Meru'


def rename_the_church_tenant(apps, schema_editor):
    """The church tenant's display name followed the old word order.

    Only tenants still sitting on the previous default are renamed — a tenant
    someone named themselves keeps its own name.
    """
    ChurchTenant = apps.get_model('tenants', 'ChurchTenant')
    ChurchTenant.objects.filter(name=OLD_NAME).update(name=NEW_NAME)


def restore_the_old_tenant_name(apps, schema_editor):
    ChurchTenant = apps.get_model('tenants', 'ChurchTenant')
    ChurchTenant.objects.filter(name=NEW_NAME).update(name=OLD_NAME)


class Migration(migrations.Migration):

    dependencies = [
        ('tenants', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(rename_the_church_tenant, restore_the_old_tenant_name),
    ]
