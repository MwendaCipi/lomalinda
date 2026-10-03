"""Ambassadors reads as its own fellowship inside the AYM desk.

The rail now lists Young Adults as AYM and Ambassadors beside it. The
Ambassadors are a fellowship *of* Adventist Youth Ministries — they share the
youth desk's leadership, calendar and fund — so they are a sub-unit of the
``aym`` department (its comma-separated ``units`` field), exactly the way
Young Couples and Single Parents ride the men's and women's desks. The desk
then reads one toggle per fellowship, and members are added to each
separately: a roll entry carries the unit it belongs to.

The area code stays ``ambassadors`` — role flags, audiences and API paths all
name it — so nothing that already points at the department has to move.
"""

from django.db import migrations


AYM_CODE = "aym"
UNIT = "Ambassadors"


def add_unit(apps, schema_editor):
    Department = apps.get_model("members", "Department")
    department = Department.objects.filter(code=AYM_CODE).first()
    if department is None:
        return
    units = [name.strip() for name in (department.units or "").split(",") if name.strip()]
    if UNIT not in units:
        units.append(UNIT)
        department.units = ", ".join(units)
        department.save(update_fields=["units"])


def remove_unit(apps, schema_editor):
    Department = apps.get_model("members", "Department")
    department = Department.objects.filter(code=AYM_CODE).first()
    if department is None:
        return
    units = [name.strip() for name in (department.units or "").split(",") if name.strip()]
    units = [name for name in units if name != UNIT]
    department.units = ", ".join(units)
    department.save(update_fields=["units"])


class Migration(migrations.Migration):

    dependencies = [
        ("members", "0169_sabbath_school_ministry"),
    ]

    operations = [
        migrations.RunPython(add_unit, remove_unit),
    ]
