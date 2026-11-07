"""Seed Treasury department leadership roles (Leader and Assistant).

Treasury was created without base Leader and Assistant DepartmentRole rows,
preventing the leadership modal from rendering appointment slots for the
treasurer and assistant treasurer. This migration seeds the standard
Leader/Assistant roles, removes any stray roles, and links existing accounts
holding the treasurer role to the corresponding department assignments.
"""

from django.db import migrations


def seed_treasury_leadership_roles(apps, schema_editor):
    Department = apps.get_model('members', 'Department')
    DepartmentRole = apps.get_model('members', 'DepartmentRole')
    DepartmentAssignment = apps.get_model('members', 'DepartmentAssignment')
    User = apps.get_model('auth', 'User')

    treasury = Department.objects.filter(code='treasury').first()
    if not treasury:
        return

    # Delete any stray elder roles that were briefly seeded on treasury
    DepartmentRole.objects.filter(
        department=treasury,
        name__in=['First Elder', 'Second Elder', 'Third Elder'],
    ).delete()

    leader_role, _ = DepartmentRole.objects.get_or_create(
        department=treasury,
        name='Leader',
        defaults={
            'has_assistant': True,
            'sort_order': 0,
            'is_optional': False,
            'is_custom': False,
        },
    )
    if leader_role.is_optional or leader_role.is_custom or not leader_role.has_assistant:
        leader_role.is_optional = False
        leader_role.is_custom = False
        leader_role.has_assistant = True
        leader_role.save(update_fields=['is_optional', 'is_custom', 'has_assistant'])

    assistant_role, _ = DepartmentRole.objects.get_or_create(
        department=treasury,
        name='Assistant',
        defaults={
            'has_assistant': True,
            'sort_order': 1,
            'is_optional': False,
            'is_custom': False,
        },
    )
    if assistant_role.is_optional or assistant_role.is_custom or not assistant_role.has_assistant:
        assistant_role.is_optional = False
        assistant_role.is_custom = False
        assistant_role.has_assistant = True
        assistant_role.save(update_fields=['is_optional', 'is_custom', 'has_assistant'])

    # Migrate any assignments under an area-level "Treasurer" catalogue role to the base Leader/Assistant roles
    catalogue_treasurer_role = DepartmentRole.objects.filter(department=treasury, name__iexact='treasurer').first()
    if catalogue_treasurer_role and catalogue_treasurer_role.id not in (leader_role.id, assistant_role.id):
        for assign in DepartmentAssignment.objects.filter(role=catalogue_treasurer_role):
            target_role = assistant_role if assign.kind == 'assistant' else leader_role
            assign.role = target_role
            assign.save(update_fields=['role'])
        catalogue_treasurer_role.delete()

    # Backfill active accounts holding the church-wide treasurer role
    for user in User.objects.filter(is_active=True).select_related('member_profile'):
        profile = getattr(user, 'member_profile', None)
        if not profile:
            continue
        all_roles = [r.strip() for r in (profile.roles or profile.role or '').split(',') if r.strip()]
        if 'treasurer' not in all_roles:
            continue

        assistant_codes = [c.strip() for c in (profile.assistant_roles or '').split(',') if c.strip()]
        is_assistant = 'treasurer' in assistant_codes
        target_role = assistant_role if is_assistant else leader_role
        target_kind = 'assistant' if is_assistant else 'leader'

        if not DepartmentAssignment.objects.filter(department=treasury, member=user).exists():
            DepartmentAssignment.objects.create(
                department=treasury,
                role=target_role,
                member=user,
                kind=target_kind,
            )


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0266_departmentwithdrawalrequest_phone_number'),
    ]

    operations = [
        migrations.RunPython(seed_treasury_leadership_roles, migrations.RunPython.noop),
    ]
