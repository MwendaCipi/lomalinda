from django.conf import settings
from django.db import migrations, transaction


def grant_the_pastor_role_from_the_seat(apps, schema_editor):
    """Give the church's seated pastor the `pastor` role flag.

    The role was in the catalogue and in every picker, but no office granted
    it: ``OFFICE_ROLE_CODES`` had no entry for the pastorate's "Pastor" seat,
    so a church that appointed its shepherd there never had the flag created
    and every check that reads it (the funds chain's first pen, the letters'
    pastoral signature, the spiritual asks) refused him.

    The mapping is fixed in ``members.views``; this gives the churches that
    appointed before the fix the flag their seat already claims, so the desk
    is right the moment the deploy lands rather than after the next
    leadership save.
    """
    DepartmentAssignment = apps.get_model('members', 'DepartmentAssignment')
    MemberProfile = apps.get_model('members', 'MemberProfile')

    with transaction.atomic():
        seats = DepartmentAssignment.objects.filter(
            department__code='pastorate',
            department__is_active=True,
            kind='leader',
            role__name__iexact='pastor',
        )
        for member_id in seats.values_list('member_id', flat=True).distinct():
            profile, _created = MemberProfile.objects.get_or_create(user_id=member_id)
            held = [code.strip() for code in (profile.roles or '').split(',') if code.strip()]
            if 'pastor' in held or 'admin' in held:
                # The office is already held, or the administrator's role
                # covers it: either way nothing is missing.
                continue
            # ``role`` is the legacy mirror ``set_roles`` recomputes from the
            # set, and it keeps the first code of the normalised order (the
            # stored default ``member`` when that is also held), so the flag
            # is written where every check reads it: the set itself.
            profile.roles = ', '.join(['pastor', *held])
            profile.save(update_fields=['roles'])
            # The role's group is synced from the live models, never through
            # this historical one: ``profile.user`` here is the migration
            # state's User, and setting its ``groups`` with the real Group
            # objects raised "Field 'id' expected a number" on the church
            # that has a pastor — the one case the local test database, with
            # no Pastor seat, could never reach.
            try:
                from django.contrib.auth.models import User as UserModel

                from members.roles import sync_role_groups
            except Exception:  # pragma: no cover - the flag stands without groups
                continue
            sync_role_groups(UserModel.objects.get(pk=member_id), held + ['pastor'])


def reverse_grant(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0260_expunge_remaining_minted_friend_accounts'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RunPython(grant_the_pastor_role_from_the_seat, reverse_grant),
    ]
