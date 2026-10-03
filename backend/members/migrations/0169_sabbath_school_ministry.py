"""Sabbath School joins the rail as a ministry.

The same roles table, roll, calendar and join-request flow as every other
department, filed under the Ministry heading beside Health, Music and the
rest. Its offices are the ones the school actually runs — a superintendent
(kept as the area's Leader, so the desk's appoint-a-leader flow works the same
as everywhere else) with an assistant appointed beside them, then a secretary
and a treasurer.
"""

from django.db import migrations
from django.utils import timezone


SABBATH_SCHOOL_ROLES = (
    ("Leader", True),
    ("Secretary", False),
    ("Treasurer", False),
)


def seed_sabbath_school(apps, schema_editor):
    Department = apps.get_model("members", "Department")
    DepartmentRole = apps.get_model("members", "DepartmentRole")

    school, _created = Department.objects.get_or_create(
        code="sabbath_school",
        defaults={
            "name": "Sabbath School",
            "group": "ministry",
            "sort_order": 21,
            "description": (
                "The church's Sabbath School: the classes, the teachers and "
                "the lesson study that opens the Sabbath."
            ),
            "created_at": timezone.now(),
        },
    )
    for index, (role_name, assistant) in enumerate(SABBATH_SCHOOL_ROLES):
        DepartmentRole.objects.get_or_create(
            department=school, name=role_name,
            defaults={"has_assistant": assistant, "sort_order": index},
        )


def unseed(apps, schema_editor):
    Department = apps.get_model("members", "Department")
    Department.objects.filter(code="sabbath_school").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("members", "0168_children_groups_pathfinders_and_age_brackets"),
    ]

    operations = [
        migrations.RunPython(seed_sabbath_school, unseed),
    ]
