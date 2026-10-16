"""Welfare joins the rail as a ministry.

The navigation config has carried Welfare's label, icon and desk blurb for a
while, and the public site lists it among the ministries — but the rail does
not read that config for areas: it expands the church's own Department
records, and no Welfare row had ever been created. That is why asking for it
changed nothing on screen. The row is created here the way Health (0158) and
Dorcas/Development (0181) were, filed under Ministries, and given the
Leader/Assistant pair every area's leadership modal reads (0189's rule: an
active department with no seats at all gets the default pair).

A Welfare row an office created by hand keeps its name and its rolls — only
its heading (ministry) and its missing seats are settled here. Rollback
therefore deletes nothing.
"""

from django.db import migrations
from django.utils import timezone

# The pair every department is seeded with (members.models.DEFAULT_DEPARTMENT_ROLES).
DEFAULT_DEPARTMENT_ROLES = (('Leader', True), ('Assistant', True))

WELFARE_DESCRIPTION = (
    "Practical support and compassion for church members and neighbours in need."
)


def seed_welfare(apps, schema_editor):
    Department = apps.get_model('members', 'Department')
    DepartmentRole = apps.get_model('members', 'DepartmentRole')

    welfare, created = Department.objects.get_or_create(
        code='welfare',
        defaults={
            'name': 'Welfare Ministry',
            'group': 'ministry',
            'sort_order': 19,
            'is_active': True,
            'description': WELFARE_DESCRIPTION,
            'created_at': timezone.now(),
        },
    )
    if not created and welfare.group != 'ministry':
        # The church asked for Welfare as a ministry of the record, so a row
        # that arrived some other way files itself under the same heading.
        welfare.group = 'ministry'
        welfare.save(update_fields=['group'])

    # The seats the leadership modal renders: without them the desk could
    # never show Set leader / Set assistant for the area.
    if not welfare.roles.exists():
        for index, (role_name, has_assistant) in enumerate(DEFAULT_DEPARTMENT_ROLES):
            DepartmentRole.objects.create(
                department=welfare,
                name=role_name,
                has_assistant=has_assistant,
                sort_order=index,
                is_custom=False,
            )


def unseed(apps, schema_editor):
    # The row may pre-exist this migration (an office's own creation), so a
    # rollback never deletes data.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0207_announcement_event_time_from_and_more'),
    ]

    operations = [
        migrations.RunPython(seed_welfare, unseed),
    ]
