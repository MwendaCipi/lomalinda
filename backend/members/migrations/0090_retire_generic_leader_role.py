"""Retire the generic 'Church Leader' role.

Every real leadership duty is already covered by concrete roles (elder,
clerk, treasurer, ...), so the catch-all ``leader`` code only caused
confusion — even genuine leaders were denied announcement posting because
the old permission checks compared against the wrong codes. Existing
holders are migrated to ``elder`` (the closest standing role) and the
'Church Leaders' Django group keeps its remaining clerk/elder members.
"""

from django.db import migrations


def retire_leader_role(apps, schema_editor):
    MemberProfile = apps.get_model('members', 'MemberProfile')

    profiles = MemberProfile.objects.filter(role='leader') | MemberProfile.objects.filter(roles__contains='leader')
    for profile in profiles.distinct():
        codes = [c.strip() for c in (profile.roles or '').split(',') if c.strip()]
        codes = [c for c in codes if c and c != 'leader']
        if not codes or (len(codes) == 1 and codes[0] == 'member' and profile.role == 'leader'):
            # Held leader as their only meaningful role: promote to elder.
            codes = ['elder']
        elif profile.role == 'leader':
            codes = ['elder'] + [c for c in codes if c != 'elder']
        profile.roles = ', '.join(codes) if codes else 'member'
        if profile.role == 'leader':
            profile.role = codes[0] if codes else 'member'
        profile.save(update_fields=['role', 'roles'])

    # ChurchSettings.board_roles may still list the retired code.
    ChurchSettings = apps.get_model('members', 'ChurchSettings')
    for settings_row in ChurchSettings.objects.all():
        board_roles = settings_row.board_roles or []
        if 'leader' in board_roles:
            settings_row.board_roles = [('elder' if r == 'leader' else r) for r in board_roles if r]
            settings_row.save(update_fields=['board_roles'])

    # Pending invitations must not hand out a role that no longer exists.
    Invitation = apps.get_model('members', 'Invitation')
    for invitation in Invitation.objects.filter(roles__contains='leader'):
        codes = [c.strip() for c in (invitation.roles or '').split(',') if c.strip()]
        codes = ['elder' if c == 'leader' else c for c in codes if c]
        seen = []
        for c in codes:
            if c not in seen:
                seen.append(c)
        invitation.roles = ', '.join(seen) or 'member'
        invitation.save(update_fields=['roles'])


class Migration(migrations.Migration):
    dependencies = [('members', '0089_announcement_attachment_actions_receipt_wording')]
    operations = [migrations.RunPython(retire_leader_role, migrations.RunPython.noop)]
