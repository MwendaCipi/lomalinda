"""Eldership seats its three elders and nothing else.

The reshape (0146) created fresh Leader and Assistant rows wherever an area
lacked them — Eldership included, where the three elders are already the
whole board. A First Elder is the leader there, so the extra rows go: an
appointment made on the spurious Leader row moves to First Elder while that
seat stands empty, and anything else on the two rows is released.
"""

from django.db import migrations


def prune_eldership(apps, schema_editor):
    Department = apps.get_model("members", "Department")
    DepartmentRole = apps.get_model("members", "DepartmentRole")

    eldership = Department.objects.filter(code="eldership", is_active=True).first()
    if eldership is None:
        return
    first_elder = DepartmentRole.objects.filter(department=eldership, name="First Elder").first()

    for name in ("Leader", "Assistant"):
        role = DepartmentRole.objects.filter(department=eldership, name=name).first()
        if role is None:
            continue
        for assignment in role.assignments.all():
            if name == "Leader" and first_elder is not None and assignment.kind == "leader" \
                    and not first_elder.assignments.filter(kind="leader").exists():
                # Whoever the desk set as Eldership's "leader" becomes its
                # First Elder, the office the church reads.
                assignment.role = first_elder
                assignment.save(update_fields=["role"])
            else:
                assignment.delete()
        role.delete()


def restore_rows(apps, schema_editor):
    """Reverse recreates the two rows, empty — appointments stay moved."""
    Department = apps.get_model("members", "Department")
    DepartmentRole = apps.get_model("members", "DepartmentRole")
    eldership = Department.objects.filter(code="eldership", is_active=True).first()
    if eldership is None:
        return
    for index, name in enumerate(("Leader", "Assistant")):
        DepartmentRole.objects.get_or_create(
            department=eldership, name=name, defaults={"has_assistant": True, "sort_order": 4 + index},
        )


class Migration(migrations.Migration):

    dependencies = [
        ("members", "0147_appointment_email_templates"),
    ]

    operations = [
        migrations.RunPython(prune_eldership, restore_rows),
    ]
