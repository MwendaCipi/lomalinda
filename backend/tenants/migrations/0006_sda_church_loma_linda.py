"""The church tenant carries the church's name, and the church signs itself
SDA Church Loma Linda now — the same rename members/0228 makes of the
settings text. Only tenants still on the old word order are renamed; a
tenant someone named themselves keeps its wording.
"""

from django.db import migrations

OLD = 'SDA Loma Linda'
NEW = 'SDA Church Loma Linda'


def rename_the_tenant(apps, schema_editor):
    ChurchTenant = apps.get_model('tenants', 'ChurchTenant')
    for row in ChurchTenant.objects.filter(name__contains=OLD):
        row.name = row.name.replace(OLD, NEW)
        row.save(update_fields=['name'])


def restore_the_old_tenant_name(apps, schema_editor):
    ChurchTenant = apps.get_model('tenants', 'ChurchTenant')
    for row in ChurchTenant.objects.filter(name__contains=NEW):
        row.name = row.name.replace(NEW, OLD)
        row.save(update_fields=['name'])


class Migration(migrations.Migration):
    dependencies = [
        ('tenants', '0005_blank_invented_friend_emails'),
    ]

    operations = [
        migrations.RunPython(rename_the_tenant, restore_the_old_tenant_name),
    ]
