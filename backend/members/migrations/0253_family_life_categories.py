"""Family Life files its people into the homes it serves.

The ministry is one roll but not one company: young couples, married couples
and single parents each sit on the same Family Life roll, told apart by the
desk's category chips the way Children's classes and the men's and women's
fellowships are (0142, 0161, 0162). The add-member modal is what fills them —
a new name is filed into the category chosen there.

Units are the comma-separated field on the department row; this appends only
the ones missing, so a desk that already names its own keeps them. Rollback
takes these three back out and touches no membership.
"""

from django.db import migrations

#: The categories the family ministry reads its roll in.
FAMILY_LIFE_UNITS = ("Young Couples", "Married Couples", "Single Parents")


def _units_of(department):
    return [name.strip() for name in (department.units or "").split(",") if name.strip()]


def seed_units(apps, schema_editor):
    Department = apps.get_model("members", "Department")
    family_life = Department.objects.filter(code="family_life").first()
    if family_life is None:
        return
    units = _units_of(family_life)
    added = [name for name in FAMILY_LIFE_UNITS if name not in units]
    if not added:
        return
    family_life.units = ", ".join(units + added)
    family_life.save(update_fields=["units"])


def unseed_units(apps, schema_editor):
    Department = apps.get_model("members", "Department")
    family_life = Department.objects.filter(code="family_life").first()
    if family_life is None:
        return
    units = [name for name in _units_of(family_life) if name not in FAMILY_LIFE_UNITS]
    family_life.units = ", ".join(units)
    family_life.save(update_fields=["units"])


class Migration(migrations.Migration):

    dependencies = [
        ("members", "0252_seed_family_life_ministry"),
    ]

    operations = [
        migrations.RunPython(seed_units, unseed_units),
    ]
