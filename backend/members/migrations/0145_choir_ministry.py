from django.db import migrations
from django.utils import timezone


# The choir joins the desk as a ministry: the same roles table, roll and
# calendar as every other department, filed under the Ministries heading.
# Its offices are the four the choir actually runs — a director, the assistant
# appointed beside them (the same `has_assistant` switch every other role
# uses), then the treasurer and the secretary.
CHOIR_ROLES = (
    ("Choir Director", True),
    ("Treasurer", False),
    ("Secretary", False),
)


def seed_choir(apps, schema_editor):
    Department = apps.get_model("members", "Department")
    DepartmentRole = apps.get_model("members", "DepartmentRole")

    choir, _created = Department.objects.get_or_create(
        code="choir",
        defaults={
            "name": "Choir",
            "group": "ministry",
            "sort_order": 19,
            "description": "The church choir: anthems, special music and support for congregational singing.",
            "created_at": timezone.now(),
        },
    )
    for index, (role_name, assistant) in enumerate(CHOIR_ROLES):
        DepartmentRole.objects.get_or_create(
            department=choir, name=role_name,
            defaults={"has_assistant": assistant, "sort_order": index},
        )


def unseed(apps, schema_editor):
    Department = apps.get_model("members", "Department")
    Department.objects.filter(code="choir").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("members", "0144_weekly_meetings"),
    ]

    operations = [
        migrations.RunPython(seed_choir, unseed),
    ]
