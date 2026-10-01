"""Young Couples join the men's and women's desks as a sub-unit of each.

AMM and AWM are the gender-based groups the church files its adults by, and
within each the young couples meet as their own fellowship — one leadership
per group, its roll, calendar and fund shared, the desk toggling between the
whole group and its young couples the way Children's desk does between
Kindergarten and Pathfinders (0142).
"""

from django.db import migrations

#: The gender-based groups that keep a young couples' fellowship inside them.
YOUNG_COUPLES_GROUPS = ("amm", "awm")


def seed_young_couples(apps, schema_editor):
    Department = apps.get_model("members", "Department")

    for code in YOUNG_COUPLES_GROUPS:
        department = Department.objects.filter(code=code, is_active=True).first()
        if department is None:
            continue
        units = [name.strip() for name in (department.units or "").split(",") if name.strip()]
        if "Young Couples" not in units:
            units.append("Young Couples")
            department.units = ", ".join(units)
            department.save(update_fields=["units"])


def unseed_young_couples(apps, schema_editor):
    Department = apps.get_model("members", "Department")
    for code in YOUNG_COUPLES_GROUPS:
        department = Department.objects.filter(code=code).first()
        if department is None:
            continue
        units = [name.strip() for name in (department.units or "").split(",") if name.strip()]
        units = [name for name in units if name != "Young Couples"]
        department.units = ", ".join(units)
        department.save(update_fields=["units"])


class Migration(migrations.Migration):

    dependencies = [
        ("members", "0160_treasuryaccount_department_and_more"),
    ]

    operations = [
        migrations.RunPython(seed_young_couples, unseed_young_couples),
    ]
