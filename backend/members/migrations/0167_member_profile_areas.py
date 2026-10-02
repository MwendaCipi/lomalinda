"""The profile's areas become real rows: a department and its ministries.

``MemberProfile`` gains ``department_ref`` — the one department the member
belongs to — and ``ministries``, the several they serve in. Both point at
the church's ``Department`` table, so an area is a record the desk curates
rather than a string written into a form. The legacy ``department`` and
``ministry`` strings stay in place while the office re-files members.

This migration also gives the records the new fields point at: the children's
bands (Beginners, Kindergarten, Primary, Junior, Teens) as departments of
their own, and the fellowships that rode AMM and AWM as sub-units (Young
Couples, Single Parents) as rows of their own. The frontend gathers the
bands under Children and the fellowships under the men's and women's desks;
the backend keeps them separate. Each new area gets the Leader/Assistant
roles every area starts with, so its desk opens ready.

The backfill is deliberately conservative — only the legacy values with a
clear counterpart are mapped, and nothing is guessed:

* legacy ``department``: children → children, young_adults → aym,
  youth → teens; adults and seniors have no row and are left as they are.
* legacy ``ministry``: adventist_men → amm, adventist_women → awm (the
  ministries). young_adults and ambassadors name departments in the new
  taxonomy, so they fill ``department_ref`` only where it is still empty.
"""

from django.db import migrations, models


#: (code, name, group, sort_order, description) — the rows this adds.
NEW_AREAS = (
    ('beginners', 'Beginners', 'department', 20, "The youngest children, learning that Jesus loves them."),
    ('kindergarten', 'Kindergarten', 'department', 21, "Kindergarten children growing in the church's care."),
    ('primary', 'Primary', 'department', 22, "Primary children, taught and shepherded at their own level."),
    ('junior', 'Junior', 'department', 23, "Junior youth growing in faith and friendship."),
    ('teens', 'Teens', 'department', 24, "Teens finding their place in the church."),
    ('young_couples', 'Young Couples', 'ministry', 30, "Young couples building homes and faith together."),
    ('single_parents', 'Single Parents', 'ministry', 31, "Single parents supported and encouraged in the church."),
)

#: The legacy age bucket → the department row it now names.
BUCKET_TO_DEPARTMENT = {
    'children': 'children',
    'young_adults': 'aym',
    'youth': 'teens',
}

#: The legacy ministry string → the ministry row it now names.
MINISTRY_TO_MINISTRY = {
    'adventist_men': 'amm',
    'adventist_women': 'awm',
}

#: The legacy ministry string that is a department in the new taxonomy.
MINISTRY_AS_DEPARTMENT = {
    'young_adults': 'aym',
    'ambassadors': 'ambassadors',
}

#: Sub-units that are now rows, so they come off the desks they rode.
UNITS_TO_DROP = {
    'amm': ('Young Couples', 'Single Parents'),
    'awm': ('Young Couples', 'Single Parents'),
    'children': ('Kindergarten',),
}

DEFAULT_ROLES = (('Leader', True), ('Assistant', True))


def seed_areas(apps, schema_editor):
    Department = apps.get_model('members', 'Department')
    DepartmentRole = apps.get_model('members', 'DepartmentRole')

    for code, name, group, sort, description in NEW_AREAS:
        department, _created = Department.objects.get_or_create(
            code=code,
            defaults={
                'name': name,
                'group': group,
                'sort_order': sort,
                'description': description,
            },
        )
        for role_name, has_assistant in DEFAULT_ROLES:
            DepartmentRole.objects.get_or_create(
                department=department,
                name=role_name,
                defaults={'has_assistant': has_assistant},
            )

    # The fellowships and the Kindergarten are their own rows now; take them
    # off the desks that used to carry them as sub-units.
    for code, drop in UNITS_TO_DROP.items():
        department = Department.objects.filter(code=code).first()
        if department is None:
            continue
        kept = [
            unit.strip()
            for unit in (department.units or '').split(',')
            if unit.strip() and unit.strip() not in drop
        ]
        department.units = ', '.join(kept)
        department.save(update_fields=['units'])


def unseed_areas(apps, schema_editor):
    Department = apps.get_model('members', 'Department')
    Department.objects.filter(code__in=[code for code, *_rest in NEW_AREAS]).delete()


def backfill_areas(apps, schema_editor):
    MemberProfile = apps.get_model('members', 'MemberProfile')
    Department = apps.get_model('members', 'Department')
    by_code = {row.code: row for row in Department.objects.all()}

    for profile in MemberProfile.objects.all():
        ref = None
        bucket = BUCKET_TO_DEPARTMENT.get((profile.department or '').strip())
        if bucket and bucket in by_code:
            ref = by_code[bucket]
        ministry = (profile.ministry or '').strip()
        if ref is None:
            as_department = MINISTRY_AS_DEPARTMENT.get(ministry)
            if as_department and as_department in by_code:
                ref = by_code[as_department]
        if ref is not None:
            profile.department_ref = ref
            profile.save(update_fields=['department_ref'])

        as_ministry = MINISTRY_TO_MINISTRY.get(ministry)
        if as_ministry and as_ministry in by_code:
            profile.ministries.add(by_code[as_ministry])


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0166_prayerrequest_audience'),
    ]

    operations = [
        migrations.AddField(
            model_name='memberprofile',
            name='department_ref',
            field=models.ForeignKey(
                blank=True,
                help_text='The department the member belongs to (exactly one)',
                null=True,
                on_delete=models.SET_NULL,
                related_name='members_by_department',
                to='members.department',
            ),
        ),
        migrations.AddField(
            model_name='memberprofile',
            name='ministries',
            field=models.ManyToManyField(
                blank=True,
                help_text='The ministries the member serves in (several allowed)',
                related_name='members_by_ministry',
                to='members.department',
            ),
        ),
        migrations.RunPython(seed_areas, unseed_areas),
        migrations.RunPython(backfill_areas, migrations.RunPython.noop),
    ]
