"""The Pianist office leaves the catalogue.

0209 seeded every area with Secretary, Treasurer, Choir Leader and Pianist.
The church no longer seats a pianist as an area office — the seat was the
one catalogue row with no assistant and, more often than not, sat empty —
so the office is dropped from the list in code and from the areas that
carry it here. Appointments behind the seat go with it (the role's rows
cascade); an area's own base pair and its elected offices are untouched.
"""

from django.db import migrations


def drop_pianist(apps, schema_editor):
    DepartmentRole = apps.get_model('members', 'DepartmentRole')
    DepartmentRole.objects.filter(name__iexact='Pianist').delete()


def restore_pianist(apps, schema_editor):
    # The wording is settled in code; re-adding rows here would leave areas
    # that dropped the office themselves carrying it again. Nothing comes back.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0209_area_office_catalogue'),
    ]

    operations = [
        migrations.RunPython(drop_pianist, restore_pianist),
    ]
