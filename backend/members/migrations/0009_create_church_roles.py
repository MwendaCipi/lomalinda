from django.db import migrations


def create_church_roles(apps, schema_editor):
    Group = apps.get_model('auth', 'Group')
    Permission = apps.get_model('auth', 'Permission')
    ContentType = apps.get_model('contenttypes', 'ContentType')

    model_names = {
        'sabbathevent', 'churchsettings', 'churchfinancialreport',
        'churchbudget', 'prayerrequest',
    }
    permissions = Permission.objects.filter(content_type__app_label='members', content_type__model__in=model_names)
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


def remove_church_roles(apps, schema_editor):
    Group = apps.get_model('auth', 'Group')
    Group.objects.filter(name__in=[
        'Administrators', 'Church Leaders', 'Finance Team', 'Choir Director',
        'Children Ministry', 'Adventist Men Ministries',
        'Adventist Women Ministries', 'Chaplaincy',
    ]).delete()


class Migration(migrations.Migration):
    dependencies = [('members', '0008_churchbudget_alter_memberprofile_role')]
    operations = [migrations.RunPython(create_church_roles, remove_church_roles)]
