"""Education joins the rail as a ministry.

The rail's Ministries heading is not written in the frontend — it expands the
church's own Department records — so asking for an Education ministry on the
rail is answered only when the row exists, filed under Ministries and carrying
the offices its leadership modal renders. Health (0158) and Welfare (0208) were
seeded the same way.

The row is seeded with the whole office list (``DEPARTMENT_ROLE_SEED``): the
base Leader/Assistant pair, then the catalogue offices Secretary, Treasurer and
Choir Leader. 0209 seeded the catalogue into the areas that already existed;
an area created after it — by this migration or by the desk's own Add
department — has to be given the list itself, which is what a department made
through the API gets.

An Education row an office created by hand keeps its name, its rolls and its
seats: only its heading (ministry) is settled here. Rollback deletes nothing.
"""

from django.db import migrations
from django.utils import timezone

# members.models.DEPARTMENT_ROLE_SEED, in its order — DEFAULT_DEPARTMENT_ROLES
# (the base pair) followed by DEPARTMENT_ROLE_CATALOGUE. Migrations cannot
# import app code, so the list is mirrored here as 0209 mirrors it.
BASE_ROLE_COUNT = 2
DEPARTMENT_ROLE_SEED = (
    ('Leader', True),
    ('Assistant', True),
    ('Secretary', True),
    ('Treasurer', True),
    ('Choir Leader', True),
)

EDUCATION_DESCRIPTION = (
    "Christian education in the church and its schools: the study of God's "
    "word, our schools, and the students they serve."
)


def seed_education(apps, schema_editor):
    Department = apps.get_model('members', 'Department')
    DepartmentRole = apps.get_model('members', 'DepartmentRole')

    education, created = Department.objects.get_or_create(
        code='education',
        defaults={
            'name': 'Education Ministry',
            'group': 'ministry',
            'sort_order': 22,
            'is_active': True,
            'description': EDUCATION_DESCRIPTION,
            'created_at': timezone.now(),
        },
    )
    if not created and education.group != 'ministry':
        # The church reads Education as a ministry of the record, so a row
        # that arrived some other way files itself under the same heading.
        education.group = 'ministry'
        education.save(update_fields=['group'])

    # The offices the desk renders: without them the leadership modal has no
    # seat to fill. A hand-created area's own offices are left alone.
    if not education.roles.exists():
        for index, (role_name, has_assistant) in enumerate(DEPARTMENT_ROLE_SEED):
            DepartmentRole.objects.create(
                department=education,
                name=role_name,
                has_assistant=has_assistant,
                sort_order=index,
                # The base pair stays with every area; the catalogue offices
                # are the area's own to keep or drop.
                is_optional=index >= BASE_ROLE_COUNT,
                is_custom=index >= BASE_ROLE_COUNT,
            )


def unseed(apps, schema_editor):
    # The row may pre-exist this migration (an office's own creation), so a
    # rollback never deletes data.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0211_sabbath_school_assistant_and_custom_offices'),
    ]

    operations = [
        migrations.RunPython(seed_education, unseed),
    ]
