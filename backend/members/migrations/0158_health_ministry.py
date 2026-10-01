"""Health joins the rail as a ministry.

The same roles table, roll, calendar and join-request flow as every other
department, filed under the Ministries heading. Its offices are the three
the area actually runs — a leader with an assistant appointed beside them
(the same `has_assistant` switch every other role uses), then a secretary.
"""

from django.db import migrations
from django.utils import timezone


HEALTH_ROLES = (
    ("Leader", True),
    ("Secretary", False),
)


def seed_health(apps, schema_editor):
    Department = apps.get_model("members", "Department")
    DepartmentRole = apps.get_model("members", "DepartmentRole")

    health, _created = Department.objects.get_or_create(
        code="health",
        defaults={
            "name": "Health Ministries",
            "group": "ministry",
            "sort_order": 19,
            "description": "The church's health ministry: wholeness of body, mind and spirit — health emphases, screenings, cooking schools and the visitation of the sick.",
            "created_at": timezone.now(),
        },
    )
    for index, (role_name, assistant) in enumerate(HEALTH_ROLES):
        DepartmentRole.objects.get_or_create(
            department=health, name=role_name,
            defaults={"has_assistant": assistant, "sort_order": index},
        )


def unseed(apps, schema_editor):
    Department = apps.get_model("members", "Department")
    Department.objects.filter(code="health").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("members", "0157_remove_departmentjoinrequest_uniq_open_join_request_per_department_and_more"),
    ]

    operations = [
        migrations.RunPython(seed_health, unseed),
    ]
