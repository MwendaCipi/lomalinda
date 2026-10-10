"""Give Development and Dorcas the two seats every area carries.

0181 created both departments but no DepartmentRole rows, so the leadership
modal had no Leader or Assistant seat to render — the Set leader / Set
assistant buttons never appeared for either ministry. Any active department
found with no roles at all gets the default pair; Development is also read
by its short name from here on.
"""

from django.db import migrations

# The pair every department is seeded with (members.models.DEFAULT_DEPARTMENT_ROLES).
DEFAULT_DEPARTMENT_ROLES = (('Leader', True), ('Assistant', True))


def seed_missing_roles_and_rename_development(apps, schema_editor):
    Department = apps.get_model('members', 'Department')
    DepartmentRole = apps.get_model('members', 'DepartmentRole')

    # Only a Development row still carrying the long seed name — an office
    # that renamed the area to something else entirely keeps its word.
    Department.objects.filter(code='development', name__icontains='development') \
        .exclude(name='Development') \
        .update(name='Development')

    # The areas the desk created straight from a migration (or by hand in
    # the admin) without roles: give them the Leader/Assistant pair the
    # leadership modal reads, exactly as the create endpoint would.
    bare = Department.objects.filter(is_active=True, roles__isnull=True).distinct()
    for department in bare:
        for index, (role_name, has_assistant) in enumerate(DEFAULT_DEPARTMENT_ROLES):
            DepartmentRole.objects.create(
                department=department,
                name=role_name,
                has_assistant=has_assistant,
                sort_order=index,
                is_custom=False,
            )


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0188_contribution_needs_review'),
    ]

    operations = [
        migrations.RunPython(seed_missing_roles_and_rename_development, migrations.RunPython.noop),
    ]
