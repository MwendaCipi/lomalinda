"""Re-seat the deaconate's two offices by sex.

The deaconate seats a Head Deacon, a man's office, and a Head Deaconess, a
woman's (0159 gave it those two seats, and the leadership save refuses a
holder whose profile sex contradicts the seat). Someone seated against the
rule — a woman on the Head Deacon, or a man on the Head Deaconess — is moved
to the office their sex belongs to: a woman on the Head Deacon becomes the
Head Deaconess, a man on the Head Deaconess becomes the Head Deacon.

Two offices hold at most one leader each, so a move lands only in a free
seat: when the two seats hold each other's rightful holders they are swapped,
and when the seat a person belongs in already carries someone, nothing moves
— a correctly-seated person is never displaced, and the desks sort any
remaining oddity out by hand.

The member's derived church-wide flags follow the seat they end up holding:
the two office codes are mutually exclusive, so head_deacon and
head_deaconess swap in ``roles``, the legacy ``role`` column and
``assistant_roles`` (neither office takes an assistant).
"""

from django.db import migrations


#: Each office and the sex that fills it.
SEAT_SEX = {"Head Deacon": "male", "Head Deaconess": "female"}
#: The church-wide role code each office grants.
SEAT_CODE = {"Head Deacon": "head_deacon", "Head Deaconess": "head_deaconess"}
OFFICE_NAMES = ("Head Deacon", "Head Deaconess")
OFFICE_CODES = frozenset(SEAT_CODE.values())


def reseat(apps, schema_editor):
    Department = apps.get_model("members", "Department")
    DepartmentRole = apps.get_model("members", "DepartmentRole")
    DepartmentAssignment = apps.get_model("members", "DepartmentAssignment")
    MemberProfile = apps.get_model("members", "MemberProfile")

    deaconate = Department.objects.filter(code="deaconate", is_active=True).first()
    if deaconate is None:
        return
    offices = {
        role.name: role
        for role in DepartmentRole.objects.filter(
            department=deaconate, name__in=OFFICE_NAMES
        )
    }
    if len(offices) < 2:
        return

    gender_of = {
        profile.user_id: (profile.gender or "").strip().lower()
        for profile in MemberProfile.objects.all()
    }

    def belongs_in(assignment):
        """The office a holder's sex belongs in, or None when it is unwritten."""
        if assignment is None:
            return None
        gender = gender_of.get(assignment.member_id, "")
        for name in OFFICE_NAMES:
            if SEAT_SEX[name] == gender:
                return name
        return None

    leaders = {
        name: DepartmentAssignment.objects.filter(role=offices[name], kind="leader").first()
        for name in OFFICE_NAMES
    }
    wanted = {name: belongs_in(assignment) for name, assignment in leaders.items()}

    # The two seats hold each other's rightful holder: swap them.
    if (
        leaders["Head Deacon"]
        and leaders["Head Deaconess"]
        and wanted["Head Deacon"] == "Head Deaconess"
        and wanted["Head Deaconess"] == "Head Deacon"
    ):
        first, second = leaders["Head Deacon"], leaders["Head Deaconess"]
        first.role = offices["Head Deaconess"]
        second.role = offices["Head Deacon"]
        first.save(update_fields=["role"])
        second.save(update_fields=["role"])
    else:
        # Otherwise a misplaced holder moves only into the seat their sex
        # belongs in, and only while it stands empty.
        for name in OFFICE_NAMES:
            assignment = leaders[name]
            want = wanted[name]
            if assignment is None or want is None or want == name:
                continue
            if leaders[want] is None:
                assignment.role = offices[want]
                assignment.save(update_fields=["role"])

    # The flags follow the seats now held: only the two office codes, and each
    # person carries the one matching the office they sit in.
    seated = {
        assignment.member_id: assignment.role.name
        for assignment in DepartmentAssignment.objects.filter(
            role__in=list(offices.values()), kind="leader"
        )
    }
    for profile in MemberProfile.objects.all():
        office = seated.get(profile.user_id)
        if office is None:
            continue
        want = SEAT_CODE[office]
        stale = OFFICE_CODES - {want}
        held = [c.strip() for c in (profile.roles or "").split(",") if c.strip()]
        new_roles = [c for c in held if c not in stale]
        if want not in new_roles:
            new_roles.append(want)
        assistants = [c.strip() for c in (profile.assistant_roles or "").split(",") if c.strip()]
        new_assistants = [c for c in assistants if c not in OFFICE_CODES]
        legacy = (profile.role or "").strip()
        updates = []
        if new_roles != held:
            profile.roles = ", ".join(new_roles)
            updates.append("roles")
        if new_assistants != assistants:
            profile.assistant_roles = ", ".join(new_assistants)
            updates.append("assistant_roles")
        if legacy in OFFICE_CODES and legacy != want:
            profile.role = want
            updates.append("role")
        if updates:
            profile.save(update_fields=updates)


class Migration(migrations.Migration):

    dependencies = [
        ("members", "0163_deaconaterequest"),
    ]

    operations = [
        migrations.RunPython(reseat, migrations.RunPython.noop),
    ]
