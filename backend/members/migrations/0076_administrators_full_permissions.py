"""Give the Administrator role every permission in the church app.

Administrator is a system role: it always carries full access. Older installs
only granted it five models (migration 0009), so the group is topped up here
with every ``members`` permission that exists now.
"""

from django.db import migrations

ADMINISTRATORS = 'Administrators'
# What migration 0009 granted, so the change can be rolled back.
V0_MODELS = {'sabbathevent', 'churchsettings', 'churchfinancialreport', 'churchbudget', 'prayerrequest'}


def grant_all_permissions(apps, schema_editor):
    Group = apps.get_model('auth', 'Group')
    Permission = apps.get_model('auth', 'Permission')

    group, _ = Group.objects.get_or_create(name=ADMINISTRATORS)
    group.permissions.set(Permission.objects.filter(content_type__app_label='members'))


def restore_previous_permissions(apps, schema_editor):
    Group = apps.get_model('auth', 'Group')
    Permission = apps.get_model('auth', 'Permission')

    group = Group.objects.filter(name=ADMINISTRATORS).first()
    if group is None:
        return
    group.permissions.set(
        Permission.objects.filter(content_type__app_label='members', content_type__model__in=V0_MODELS)
    )


class Migration(migrations.Migration):

    dependencies = [('members', '0075_invitation')]

    operations = [migrations.RunPython(grant_all_permissions, restore_previous_permissions)]
