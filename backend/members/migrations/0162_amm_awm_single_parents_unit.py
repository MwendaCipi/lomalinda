"""Single Parents join the men's and women's desks as a sub-unit of each.

Rides with 0161's Young Couples: the same comma-separated `units` field on
the departments, appended once (idempotent for a desk that already names
the fellowship). Unseeding takes only Single Parents back out.
"""

from django.db import migrations


def add_single_parents(apps, schema_editor):
    Department = apps.get_model("members", "Department")
    for code in ("amm", "awm"):
        department = Department.objects.filter(code=code, is_active=True).first()
        if department is None:
            continue
        units = [name.strip() for name in (department.units or "").split(",") if name.strip()]
        if "Single Parents" not in units:
            units.append("Single Parents")
        department.units = ", ".join(units)
        department.save(update_fields=["units"])


def remove_single_parents(apps, schema_editor):
    Department = apps.get_model("members", "Department")
    for code in ("amm", "awm"):
        department = Department.objects.filter(code=code, is_active=True).first()
        if department is None:
            continue
        units = [name.strip() for name in (department.units or "").split(",") if name.strip()]
        units = [name for name in units if name != "Single Parents"]
        department.units = ", ".join(units)
        department.save(update_fields=["units"])


class Migration(migrations.Migration):

    dependencies = [
        ("members", "0161_young_couples_units"),
    ]

    operations = [
        migrations.RunPython(add_single_parents, remove_single_parents),
    ]
