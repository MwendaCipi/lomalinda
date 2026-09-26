from django.db import migrations
from django.utils import timezone


def forwards(apps, schema_editor):
    RoleHistory = apps.get_model('members', 'RoleHistory')
    MemberProfile = apps.get_model('members', 'MemberProfile')
    for profile in MemberProfile.objects.all():
        user = profile.user
        now = timezone.now()
        for code in profile.get_roles():
            RoleHistory.objects.get_or_create(
                member=user,
                role=code,
                ended_at__isnull=True,
                defaults={'started_at': user.date_joined or now},
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
