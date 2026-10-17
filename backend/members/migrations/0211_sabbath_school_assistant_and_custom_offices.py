"""Sabbath School gets its Assistant seat, and each area's own offices are marked custom.

Two corrections in the leadership desk.

Sabbath School was seeded (0169) with a Leader, a Secretary and a Treasurer
but no Assistant row, so the desk never offered Set assistant for the area.
The office is added beside the Leader, and the offices that follow shift along
so the desk reads the board in its usual order.

The church also needs to know which offices are its own to fill. ``is_custom``
marks every office that is not the base Leader/Assistant pair or an elected
office (the three elders and the deaconate's two heads): Secretary, Treasurer,
Choir Leader, and whatever wording an area carried before the catalogue.
Church leadership sets the fixed seats; the area's own leader fills the
custom ones.
"""

from django.db import migrations, models

# members.models.CHURCH_SEAT_ROLE_NAMES, in its wording.
CHURCH_SEAT_ROLE_NAMES = (
    'leader', 'assistant',
    'first elder', 'second elder', 'third elder',
    'head deacon', 'head deaconess',
)


def seed_sabbath_school_assistant(apps, schema_editor):
    Department = apps.get_model('members', 'Department')
    DepartmentRole = apps.get_model('members', 'DepartmentRole')

    school = Department.objects.filter(code='sabbath_school').first()
    if school is None:
        return
    if DepartmentRole.objects.filter(department=school, name__iexact='Assistant').exists():
        return
    leader = DepartmentRole.objects.filter(department=school, name__iexact='Leader').first()
    order = (leader.sort_order + 1) if leader else 0
    for role in DepartmentRole.objects.filter(department=school, sort_order__gte=order):
        role.sort_order += 1
        role.save(update_fields=['sort_order'])
    DepartmentRole.objects.create(
        department=school,
        name='Assistant',
        has_assistant=True,
        sort_order=order,
        is_optional=False,
        is_custom=False,
    )


def unseed_sabbath_school_assistant(apps, schema_editor):
    Department = apps.get_model('members', 'Department')
    DepartmentRole = apps.get_model('members', 'DepartmentRole')

    school = Department.objects.filter(code='sabbath_school').first()
    if school is None:
        return
    role = DepartmentRole.objects.filter(department=school, name__iexact='Assistant').first()
    # A seat somebody already holds is not a rollback's to delete.
    if role is not None and not role.assignments.exists():
        role.delete()


def mark_custom_offices(apps, schema_editor):
    DepartmentRole = apps.get_model('members', 'DepartmentRole')

    for role in DepartmentRole.objects.all():
        custom = (role.name or '').strip().lower() not in CHURCH_SEAT_ROLE_NAMES
        if role.is_custom != custom:
            role.is_custom = custom
            role.save(update_fields=['is_custom'])


def clear_custom_marks(apps, schema_editor):
    DepartmentRole = apps.get_model('members', 'DepartmentRole')
    DepartmentRole.objects.filter(is_custom=True).update(is_custom=False)


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0210_drop_pianist_office'),
    ]

    operations = [
        migrations.AddField(
            model_name='departmentrole',
            name='is_custom',
            field=models.BooleanField(
                default=False,
                help_text="An office the area's own leader fills; church leadership sets only the base pair and the elected offices",
            ),
        ),
        migrations.RunPython(seed_sabbath_school_assistant, unseed_sabbath_school_assistant),
        migrations.RunPython(mark_custom_offices, clear_custom_marks),
    ]
