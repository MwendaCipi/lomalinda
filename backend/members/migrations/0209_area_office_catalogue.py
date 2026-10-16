"""Every area's offices are seeded, and the desk picks a person, not a title.

The leadership desk used to name its own roles — "Music Leader", "Assistant
Sponsor", whatever an area needed — with a free-text box, so two areas could
carry two spellings of the same office and nothing was comparable across the
church. The offices are now a list the church keeps in code
(``members.models.DEPARTMENT_ROLE_CATALOGUE``): every area is seeded with the
base Leader/Assistant pair plus Secretary, Treasurer, Choir Leader and
Pianist, and the desk fills each one with a person.

Two things happen here. ``is_custom`` becomes ``is_optional`` — the flag no
longer means "a title the desk typed", it means "a catalogue office this area
may drop", while the base pair and the church's own elected offices stay — and
the catalogue is seeded into the areas that already exist, appended after the
seats they carry so an area's own offices keep their order.

Areas that already carry an office under one of these names (a Secretary the
desk added by hand, say) keep the row they have: only the missing offices are
added, and a second run adds nothing. The wording is settled in code, so
rollback deletes nothing.
"""

from django.db import migrations, models

# members.models.DEPARTMENT_ROLE_CATALOGUE, in its order.
DEPARTMENT_ROLE_CATALOGUE = (
    ('Secretary', True),
    ('Treasurer', True),
    ('Choir Leader', True),
    ('Pianist', False),
)


def seed_area_offices(apps, schema_editor):
    Department = apps.get_model('members', 'Department')
    DepartmentRole = apps.get_model('members', 'DepartmentRole')

    for department in Department.objects.all():
        taken = {
            (name or '').strip().lower()
            for name in DepartmentRole.objects.filter(department=department).values_list('name', flat=True)
        }
        next_order = (
            DepartmentRole.objects.filter(department=department)
            .order_by('-sort_order')
            .values_list('sort_order', flat=True)
            .first()
        )
        next_order = 0 if next_order is None else next_order + 1
        for name, has_assistant in DEPARTMENT_ROLE_CATALOGUE:
            if name.lower() in taken:
                continue
            DepartmentRole.objects.create(
                department=department,
                name=name,
                has_assistant=has_assistant,
                sort_order=next_order,
                is_optional=True,
            )
            next_order += 1


def unseed(apps, schema_editor):
    # The offices are the church's own list now, and a row the desk has
    # already seated somebody in is not this migration's to delete.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0208_seed_welfare_ministry'),
    ]

    operations = [
        migrations.RenameField(
            model_name='departmentrole',
            old_name='is_custom',
            new_name='is_optional',
        ),
        migrations.AlterField(
            model_name='departmentrole',
            name='is_optional',
            field=models.BooleanField(default=False, help_text='One of the seeded catalogue offices, which an area may drop; the base Leader and Assistant stay'),
        ),
        migrations.RunPython(seed_area_offices, unseed),
    ]
