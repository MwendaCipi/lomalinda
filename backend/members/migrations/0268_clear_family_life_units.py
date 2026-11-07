"""Clear category units from Family Life.

Family Life operates as a unified roll without category unit toggles
(Young Couples, Married Couples, Single Parents).
"""

from django.db import migrations

FAMILY_LIFE_UNITS = ("Young Couples", "Married Couples", "Single Parents")


def clear_family_life_units(apps, schema_editor):
    Department = apps.get_model("members", "Department")
    DepartmentMembership = apps.get_model("members", "DepartmentMembership")
    DepartmentAssignment = apps.get_model("members", "DepartmentAssignment")

    family_life = Department.objects.filter(code="family_life").first()
    if family_life is not None:
        remaining_units = [
            name.strip()
            for name in (family_life.units or "").split(",")
            if name.strip() and name.strip() not in FAMILY_LIFE_UNITS
        ]
        family_life.units = ", ".join(remaining_units)
        family_life.save(update_fields=["units"])

        DepartmentMembership.objects.filter(
            department="family_life", unit__in=FAMILY_LIFE_UNITS
        ).update(unit="")
        DepartmentAssignment.objects.filter(
            department=family_life, unit__in=FAMILY_LIFE_UNITS
        ).update(unit="")


def restore_family_life_units(apps, schema_editor):
    Department = apps.get_model("members", "Department")
    family_life = Department.objects.filter(code="family_life").first()
    if family_life is not None:
        units = [name.strip() for name in (family_life.units or "").split(",") if name.strip()]
        added = [name for name in FAMILY_LIFE_UNITS if name not in units]
        if added:
            family_life.units = ", ".join(units + added)
            family_life.save(update_fields=["units"])


class Migration(migrations.Migration):

    dependencies = [
        ("members", "0267_seed_treasury_leadership_roles"),
    ]

    operations = [
        migrations.RunPython(clear_family_life_units, restore_family_life_units),
    ]
