from django.conf import settings
from django.db import migrations, models, transaction


def fix_pastor_and_approvals(apps, schema_editor):
    Department = apps.get_model('members', 'Department')
    DepartmentRole = apps.get_model('members', 'DepartmentRole')
    DepartmentMembership = apps.get_model('members', 'DepartmentMembership')
    DepartmentAssignment = apps.get_model('members', 'DepartmentAssignment')
    MemberProfile = apps.get_model('members', 'MemberProfile')
    DepartmentWithdrawalRequest = apps.get_model('members', 'DepartmentWithdrawalRequest')
    User = apps.get_model(*settings.AUTH_USER_MODEL.split('.'))

    with transaction.atomic():
        # 1. Locate Pr George Mwirigi
        pastor = (
            User.objects.filter(username='mwirigi').first() or
            User.objects.filter(first_name__icontains='George', last_name__icontains='Mwirigi').first() or
            User.objects.filter(first_name__icontains='George').first()
        )

        if pastor:
            # Correct full name to Pr George Mwirigi
            pastor.first_name = 'Pr George'
            pastor.last_name = 'Mwirigi'
            pastor.save(update_fields=['first_name', 'last_name'])

            # Set role to pastor
            profile, _ = MemberProfile.objects.get_or_create(user=pastor)
            profile.role = 'pastor'
            existing_roles = [r.strip() for r in (profile.roles or '').split(',') if r.strip()]
            if 'pastor' not in existing_roles:
                existing_roles.insert(0, 'pastor')
            profile.roles = ','.join(existing_roles)
            profile.save(update_fields=['role', 'roles'])

            # Enroll pastor into the Pastorate department
            pastorate = Department.objects.filter(code='pastorate').first()
            if pastorate:
                DepartmentMembership.objects.get_or_create(
                    member=pastor,
                    department='pastorate',
                )
                if hasattr(profile, 'ministries'):
                    profile.ministries.add(pastorate)

                pastor_role = DepartmentRole.objects.filter(department=pastorate, name='Pastor').first()
                if not pastor_role:
                    pastor_role = DepartmentRole.objects.filter(department=pastorate, name='Leader').first()
                if pastor_role:
                    DepartmentAssignment.objects.get_or_create(
                        department=pastorate,
                        role=pastor_role,
                        member=pastor,
                        defaults={'kind': 'leader'},
                    )

            # 2. Fix historical withdrawal requests:
            # For all requests that had elder clearance, set pastor_approved_by to Pr George Mwirigi.
            # elder_approved_by stays as the respective elder (e.g. Victor Mwenda),
            # and decided_by stays as the releasing treasurer (e.g. William Onjwayo).
            DepartmentWithdrawalRequest.objects.filter(
                models.Q(status__in=['elder_approved', 'approved']) |
                models.Q(elder_approved_by__isnull=False)
            ).update(
                pastor_approved_by=pastor,
            )


def reverse_fix(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0237_pastorate_ministry_and_pastor_approval'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RunPython(fix_pastor_and_approvals, reverse_fix),
    ]
