from django.db import migrations
from django.utils import timezone


def forwards(apps, schema_editor):
    RoleHistory = apps.get_model('members', 'RoleHistory')
    MemberProfile = apps.get_model('members', 'MemberProfile')
    for profile in MemberProfile.objects.all():
        user = profile.user
        # Historical models carry fields, not methods: get_roles() is
        # re-implemented here — the comma-separated roles plus the legacy
        # single role, deduplicated, falling back to plain membership.
        codes = [code.strip() for code in (profile.roles or '').split(',') if code.strip()]
        legacy = (profile.role or '').strip()
        if legacy and legacy not in codes:
            codes.append(legacy)
        if not codes:
            codes = ['member']
        for code in codes:
            if RoleHistory.objects.filter(member=user, role=code, ended_at__isnull=True).exists():
                continue
            RoleHistory.objects.create(
                member=user,
                role=code,
                # The member has held the role since they joined; the field's
                # own default (now) covers a missing date_joined.
                started_at=user.date_joined or timezone.now(),
            )


def backwards(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0121_role_history'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
