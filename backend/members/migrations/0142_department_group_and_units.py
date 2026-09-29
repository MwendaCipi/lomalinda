from django.db import migrations, models
from django.utils import timezone


# Which heading each seeded department belongs under. The three office bodies
# the church is governed by keep their own desks on the rail (Elders', Clerk's,
# Deaconate), so they are filed as offices rather than listed twice.
SEED_GROUPS = {
    'eldership': 'office',
    'clerkship': 'office',
    'deaconate': 'office',
    'apm': 'ministry',
    'chaplaincy': 'ministry',
    'amm': 'department',
    'awm': 'department',
    'aym': 'department',
    'children': 'department',
    'ambassadors': 'department',
}

# Ministries the rail names that had no record yet. They are ordinary
# departments to the rest of the system — the same roles, roll and calendar —
# so they are created here rather than special-cased anywhere.
NEW_MINISTRIES = (
    ('music', 'Music', 17, 'The church’s music ministry: the choir, song leading and instrumentalists.'),
    ('personal_ministries', 'Personal Ministries', 18, 'Lay evangelism, Bible work and the church’s outreach programmes.'),
)

DEFAULT_ROLES = (('Leader', True), ('Secretary', False), ('Treasurer', False))

# The children's department runs as two units under one leadership.
CHILDREN_UNITS = 'Kindergarten, Pathfinders'


def seed_groups_and_units(apps, schema_editor):
    """File today's departments under a heading, and add what is missing.

    Young Adults is the AYM under the name the church uses for it — the code
    stays `aym`, because role flags, audiences and API paths all name it.
    """
    Department = apps.get_model('members', 'Department')
    DepartmentRole = apps.get_model('members', 'DepartmentRole')

    for code, group in SEED_GROUPS.items():
        Department.objects.filter(code=code).update(group=group)

    Department.objects.filter(code='aym').update(name='Young Adults')
    Department.objects.filter(code='children').update(units=CHILDREN_UNITS)

    for code, name, sort, description in NEW_MINISTRIES:
        department, _created = Department.objects.get_or_create(
            code=code,
            defaults={
                'name': name,
                'group': 'ministry',
                'sort_order': sort,
                'description': description,
                'created_at': timezone.now(),
            },
        )
        for index, (role_name, assistant) in enumerate(DEFAULT_ROLES):
            DepartmentRole.objects.get_or_create(
                department=department, name=role_name,
                defaults={'has_assistant': assistant, 'sort_order': index},
            )


def unseed(apps, schema_editor):
    """Reverse: the two ministries go, the headings and the name come back."""
    Department = apps.get_model('members', 'Department')
    Department.objects.filter(code__in=[code for code, *_rest in NEW_MINISTRIES]).delete()
    Department.objects.filter(code='aym').update(name='Adventist Youth (AYM)')
    Department.objects.filter(code='children').update(units='')
    Department.objects.update(group='department')


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0141_restore_church_office_seats'),
    ]

    operations = [
        migrations.AddField(
            model_name='department',
            name='group',
            field=models.CharField(
                choices=[('office', 'Church office'), ('ministry', 'Ministry'), ('department', 'Department')],
                default='department',
                help_text='Whether this is a ministry or a department, or an office with its own desk',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='department',
            name='units',
            field=models.CharField(
                blank=True,
                help_text="Sub-units, comma-separated (e.g. 'Kindergarten, Pathfinders')",
                max_length=200,
            ),
        ),
        migrations.AddField(
            model_name='departmentassignment',
            name='unit',
            field=models.CharField(
                blank=True,
                help_text='The sub-unit this leader serves; blank for the department as a whole',
                max_length=60,
            ),
        ),
        migrations.AddField(
            model_name='departmentmembership',
            name='unit',
            field=models.CharField(
                blank=True,
                help_text='The sub-unit the member belongs to; blank for the department as a whole',
                max_length=60,
            ),
        ),
        migrations.AddField(
            model_name='departmentevent',
            name='unit',
            field=models.CharField(
                blank=True,
                help_text='The sub-unit the event belongs to; blank for the whole department',
                max_length=60,
            ),
        ),
        migrations.RunPython(seed_groups_and_units, unseed),
    ]
