"""The deaconate's Head Deacon seat is cleared.

The office was left in the wrong hands: a woman still sat as Head Deacon after
the reshape, and the desk needs the seat empty to appoint the church's Head
Deacon afresh beside its Head Deaconess. The seat's holder is released — the
appointment row goes, and the ``head_deacon`` flag the seat granted goes with
it — so both offices stand ready to be filled by the desk.

The office code is one the leadership board manages, so a ``head_deacon`` flag
with no seat behind it is a leftover rather than a right: anyone still carrying
it after the seat is cleared loses it too. The Head Deaconess seat and its
holder are deliberately untouched.
"""

from django.db import migrations


HEAD_DEACON_CODE = "head_deacon"


def clear_seat(apps, schema_editor):
    Department = apps.get_model("members", "Department")
    DepartmentRole = apps.get_model("members", "DepartmentRole")
    DepartmentAssignment = apps.get_model("members", "DepartmentAssignment")
    MemberProfile = apps.get_model("members", "MemberProfile")

    deaconate = Department.objects.filter(code="deaconate", is_active=True).first()
    if deaconate is None:
        return
    role = DepartmentRole.objects.filter(department=deaconate, name="Head Deacon").first()
    if role is not None:
        DepartmentAssignment.objects.filter(role=role, kind="leader").delete()

    # The seat is empty now: anyone still carrying its flag — the released
    # holder, or a leftover with no seat at all — loses it.
    for profile in MemberProfile.objects.all():
        held = [c.strip() for c in (profile.roles or "").split(",") if c.strip()]
        legacy = (profile.role or "").strip()
        if HEAD_DEACON_CODE not in held and legacy != HEAD_DEACON_CODE:
            continue
        if DepartmentAssignment.objects.filter(
            member_id=profile.user_id, role__name="Head Deacon", kind="leader",
        ).exists():
            continue
        new_roles = [c for c in held if c != HEAD_DEACON_CODE]
        assistants = [c.strip() for c in (profile.assistant_roles or "").split(",") if c.strip()]
        updates = []
        if new_roles != held:
            profile.roles = ", ".join(new_roles) if new_roles else "member"
            updates.append("roles")
        if legacy == HEAD_DEACON_CODE:
            profile.role = new_roles[0] if new_roles else "member"
            updates.append("role")
        if HEAD_DEACON_CODE in assistants:
            profile.assistant_roles = ", ".join(c for c in assistants if c != HEAD_DEACON_CODE)
            updates.append("assistant_roles")
        if updates:
            profile.save(update_fields=updates)


class Migration(migrations.Migration):

    dependencies = [
        ("members", "0164_deaconate_seats_by_sex"),
    ]

    operations = [
        migrations.RunPython(clear_seat, migrations.RunPython.noop),
    ]
