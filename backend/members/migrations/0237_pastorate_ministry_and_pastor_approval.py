import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models, transaction


def create_pastorate_and_enroll_pastors(apps, schema_editor):
    Department = apps.get_model('members', 'Department')
    DepartmentRole = apps.get_model('members', 'DepartmentRole')
    DepartmentMembership = apps.get_model('members', 'DepartmentMembership')
    DepartmentAssignment = apps.get_model('members', 'DepartmentAssignment')
    MemberProfile = apps.get_model('members', 'MemberProfile')
    TreasuryAccount = apps.get_model('members', 'TreasuryAccount')
    DepartmentWithdrawalRequest = apps.get_model('members', 'DepartmentWithdrawalRequest')

    with transaction.atomic():
        pastorate, _ = Department.objects.get_or_create(
            code='pastorate',
            defaults={
                'name': 'Pastorate',
                'description': 'Shepherding, pastoral care, preaching and spiritual oversight',
                'group': 'ministry',
                'is_active': True,
                'sort_order': 19,
            },
        )
        # Ensure it is marked as a ministry
        if pastorate.group != 'ministry' or pastorate.name != 'Pastorate':
            pastorate.group = 'ministry'
            pastorate.name = 'Pastorate'
            pastorate.is_active = True
            pastorate.save(update_fields=['group', 'name', 'is_active'])

        pastor_role, _ = DepartmentRole.objects.get_or_create(
            department=pastorate,
            name='Pastor',
            defaults={'has_assistant': True, 'sort_order': 1},
        )
        leader_role, _ = DepartmentRole.objects.get_or_create(
            department=pastorate,
            name='Leader',
            defaults={'has_assistant': True, 'sort_order': 2},
        )
        assistant_role, _ = DepartmentRole.objects.get_or_create(
            department=pastorate,
            name='Assistant',
            defaults={'has_assistant': True, 'sort_order': 3},
        )

        pastor_profiles = MemberProfile.objects.filter(
            models.Q(role='pastor') | models.Q(roles__icontains='pastor')
        ).select_related('user')

        for profile in pastor_profiles:
            user = profile.user
            DepartmentMembership.objects.get_or_create(
                member=user,
                department='pastorate',
            )
            profile.ministries.add(pastorate)
            DepartmentAssignment.objects.get_or_create(
                department=pastorate,
                role=pastor_role,
                member=user,
                defaults={'kind': 'leader'},
            )

        # Link any existing pastoral treasury account if available
        pastoral_account = (
            TreasuryAccount.objects.filter(department=pastorate).first() or
            TreasuryAccount.objects.filter(name__iexact='Pastoral', department__isnull=True).first() or
            TreasuryAccount.objects.filter(description__icontains='pastor', department__isnull=True).first()
        )
        if pastoral_account and not pastoral_account.department_id:
            pastoral_account.department = pastorate
            pastoral_account.save(update_fields=['department'])

        # Backfill existing approved or elder_approved requests so history stays consistent
        for row in DepartmentWithdrawalRequest.objects.filter(
            status__in=['elder_approved', 'approved'],
            pastor_approved_by__isnull=True,
            elder_approved_by__isnull=False,
        ):
            row.pastor_approved_by = row.elder_approved_by
            row.pastor_approved_at = row.elder_approved_at
            row.save(update_fields=['pastor_approved_by', 'pastor_approved_at'])


def uncreate_pastorate(apps, schema_editor):
    Department = apps.get_model('members', 'Department')
    Department.objects.filter(code='pastorate').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0236_backfill_campaign_account_refs'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='departmentwithdrawalrequest',
            name='pastor_approved_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='departmentwithdrawalrequest',
            name='pastor_approved_by',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='department_withdrawals_pastor_approved',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name='departmentwithdrawalrequest',
            name='status',
            field=models.CharField(
                choices=[
                    ('pending', 'Pending'),
                    ('pastor_approved', 'Pastor Approved'),
                    ('elder_approved', 'Elder Approved'),
                    ('approved', 'Approved'),
                    ('declined', 'Declined'),
                    ('reversed', 'Reversed'),
                ],
                db_index=True,
                default='pending',
                max_length=20,
            ),
        ),
        migrations.RunPython(create_pastorate_and_enroll_pastors, uncreate_pastorate),
    ]
