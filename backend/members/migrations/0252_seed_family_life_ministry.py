"""Family Life joins the rail as a ministry.

The rail's Ministries heading is not written in the frontend — it expands the
church's own Department records — so asking for a Family Life row is answered
only when the row exists, filed under Ministries and carrying the offices its
leadership modal renders. Health (0158), Welfare (0208) and Education (0212)
were seeded the same way.

A Family Life row an office created by hand keeps its name, its rolls and its
seats: only its heading (ministry) is settled here. Rollback deletes nothing.
"""

from django.db import migrations
from django.utils import timezone

# The pair every department is seeded with (members.models.DEFAULT_DEPARTMENT_ROLES).
DEFAULT_DEPARTMENT_ROLES = (('Leader', True), ('Assistant', True))

FAMILY_LIFE_DESCRIPTION = (
    "Strengthening marriages, families and homes in Christ."
)


def seed_family_life(apps, schema_editor):
    Department = apps.get_model('members', 'Department')
    DepartmentRole = apps.get_model('members', 'DepartmentRole')

    family_life, created = Department.objects.get_or_create(
        code='family_life',
        defaults={
            'name': 'Family Life',
            'group': 'ministry',
            'sort_order': 18,
            'is_active': True,
            'description': FAMILY_LIFE_DESCRIPTION,
            'created_at': timezone.now(),
        },
    )
    if not created and family_life.group != 'ministry':
        # The church reads Family Life as a ministry of the record, so a row
        # that arrived some other way files itself under the same heading.
        family_life.group = 'ministry'
        family_life.save(update_fields=['group'])

    # The seats the leadership modal renders: without them the desk could
    # never show Set leader / Set assistant for the area.
    if not family_life.roles.exists():
        for index, (role_name, has_assistant) in enumerate(DEFAULT_DEPARTMENT_ROLES):
            DepartmentRole.objects.create(
                department=family_life,
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
        ('members', '0251_board_meeting_rsvp'),
    ]

    operations = [
        migrations.RunPython(seed_family_life, unseed),
    ]
