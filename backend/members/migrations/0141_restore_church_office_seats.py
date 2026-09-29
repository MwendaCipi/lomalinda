# The church-office holders return to their departments.
#
# 0140 seeded Eldership, Clerkship and Deaconate and carried the 0139 area
# offices into the leaders table — but it skipped the old "The Church" area
# on the reasoning that its offices were church-wide roles. That reasoning
# missed the offices that are both: First/Second/Third Elder, Church Clerk,
# Head Deacon and Head Deaconess now belong to departments, and the people
# appointed to them through the church area (or the role picker before it)
# ended up with the role flag and no seat. Because the leaders table is the
# source of truth for the bridge that keeps those flags, an orphaned flag is
# one leadership save away from being quietly withdrawn.
#
# This migration gives every such flag its seat back, deriving the seat from
# the flag the church actually appointed — the flags and the open RoleHistory
# rows are the record that survived. It is idempotent: a flag that already
# has a seat is left alone, so re-running changes nothing.
from django.db import migrations


SEAT_BY_FLAG = {
    # flag: (department code, role name)
    'first_elder': ('eldership', 'First Elder'),
    'second_elder': ('eldership', 'Second Elder'),
    'third_elder': ('eldership', 'Third Elder'),
    'clerk': ('clerkship', 'Church Clerk'),
    'head_deacon': ('deaconate', 'Head Deacon'),
    'head_deaconess': ('deaconate', 'Head Deaconess'),
    'men_ministry': ('amm', 'Leader'),
    'women_ministry': ('awm', 'Leader'),
    'youth_leader': ('aym', 'Leader'),
    'children_ministry': ('children', 'Leader'),
    'ambassadors_leader': ('ambassadors', 'Leader'),
    'apm_leader': ('apm', 'Leader'),
    'chaplaincy': ('chaplaincy', 'Leader'),
}

#: Roles that take an assistant, for the departments 0140 seeded. A member
#: whose flag is held as an assistant gets an assistant row; everyone else
#: leads. (An office role that does not take an assistant cannot carry one,
#: whatever the old flag said.)
ASSISTANT_CAPABLE = {
    ('clerkship', 'Church Clerk'),
    ('deaconate', 'Head Deacon'),
    ('deaconate', 'Head Deaconess'),
    ('amm', 'Leader'),
    ('awm', 'Leader'),
    ('aym', 'Leader'),
    ('children', 'Leader'),
    ('ambassadors', 'Leader'),
    ('apm', 'Leader'),
    ('chaplaincy', 'Leader'),
}


def restore_office_seats(apps, schema_editor):
    Department = apps.get_model('members', 'Department')
    DepartmentRole = apps.get_model('members', 'DepartmentRole')
    DepartmentAssignment = apps.get_model('members', 'DepartmentAssignment')
    MemberProfile = apps.get_model('members', 'MemberProfile')

    seats = {}
    for profile in MemberProfile.objects.select_related('user'):
        flags = set()
        for raw in (profile.roles or '').split(','):
            if raw.strip():
                flags.add(raw.strip())
        for raw in (profile.assistant_roles or '').split(','):
            if raw.strip():
                flags.add(raw.strip())
        assistants = {raw.strip() for raw in (profile.assistant_roles or '').split(',') if raw.strip()}
        for flag in flags:
            placement = SEAT_BY_FLAG.get(flag)
            if not placement:
                continue
            department_code, role_name = placement
            key = (department_code, role_name)
            if key not in seats:
                department, _ = Department.objects.get_or_create(
                    code=department_code,
                    defaults={'name': department_code.title()},
                )
                role, _ = DepartmentRole.objects.get_or_create(
                    department=department, name=role_name,
                    defaults={
                        'has_assistant': key in ASSISTANT_CAPABLE,
                        'sort_order': 0,
                    },
                )
                seats[key] = (department, role)
            department, role = seats[key]
            kind = 'assistant' if (flag in assistants and role.has_assistant) else 'leader'
            DepartmentAssignment.objects.get_or_create(
                role=role, member=profile.user, kind=kind,
                defaults={'department': department},
            )


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0140_department_departmentassignment_departmentrole_and_more'),
    ]

    operations = [
        migrations.RunPython(restore_office_seats, migrations.RunPython.noop),
    ]
