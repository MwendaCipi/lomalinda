"""The deaconate seats its two offices: Head Deacon and Head Deaconess.

The reshape (0146) gave every area a generic Leader and Assistant; the
deaconate's own shape is two offices — a Head Deacon, seated by a man, and
a Head Deaconess, seated by a woman — and neither office takes an assistant.
The generic rows go the way Eldership's did (0148): whatever the desk had
set as the deaconate's leader becomes its Head Deacon while that seat stands
empty, an assistant held on the generic rows releases — the office has no
assistants to carry them — and any church-wide assistant flag on the two
offices goes with it.
"""

from django.db import migrations


DEACONATE_OFFICES = ("Head Deacon", "Head Deaconess")
MANAGED_OFFICE_CODES = {"head_deacon", "head_deaconess"}


def seed_deaconate(apps, schema_editor):
    Department = apps.get_model("members", "Department")
    DepartmentRole = apps.get_model("members", "DepartmentRole")
    MemberProfile = apps.get_model("members", "MemberProfile")

    deaconate = Department.objects.filter(code="deaconate", is_active=True).first()
    if deaconate is None:
        return

    # The two office rows, in church order, neither taking an assistant.
    offices = {}
    next_order = max(
        (role.sort_order for role in deaconate.roles.all()), default=-1,
    ) + 1
    for name in DEACONATE_OFFICES:
        role = DepartmentRole.objects.filter(department=deaconate, name=name).first()
        if role is None:
            role = DepartmentRole.objects.create(
                department=deaconate, name=name, has_assistant=False,
                sort_order=next_order, is_custom=False,
            )
            next_order += 1
        elif role.has_assistant:
            role.has_assistant = False
            role.save(update_fields=["has_assistant"])
        offices[name] = role

    # A deaconate leader held on the reshaped Leader row becomes the Head
    # Deacon while that seat stands empty — the same move 0148 made for the
    # eldership's leader into First Elder. Everything else on the generic
    # rows releases: the office seats no assistants beside its holder.
    head_deacon = offices["Head Deacon"]
    for name in ("Leader", "Assistant"):
        role = DepartmentRole.objects.filter(department=deaconate, name=name).first()
        if role is None:
            continue
        for assignment in list(role.assignments.all()):
            if (
                name == "Leader"
                and assignment.kind == "leader"
                and not head_deacon.assignments.filter(kind="leader").exists()
            ):
                assignment.role = head_deacon
                assignment.save(update_fields=["role"])
            else:
                assignment.delete()
        role.delete()

    # An office held as an assistant releases the assistant flag: neither
    # office takes one. Flags held outright — whether seated here or granted
    # in User Management — pass through untouched.
    # Historical models carry no helper methods, so the flags are read and
    # written as the stored columns, mirroring get_assistant_roles() and
    # set_roles() exactly — the way 0148 did its reshaping.
    for profile in MemberProfile.objects.all():
        held = [c.strip() for c in (profile.roles or '').split(',') if c.strip()]
        legacy = (profile.role or '').strip()
        if legacy and legacy not in held:
            held.append(legacy)
        if not held:
            held = ['member']
        stored = [c.strip() for c in (profile.assistant_roles or '').split(',') if c.strip()]
        current = [c for c in stored if c in held]
        released = [c for c in current if c in MANAGED_OFFICE_CODES]
        if not released:
            continue
        profile.assistant_roles = ', '.join(
            c for c in current if c not in MANAGED_OFFICE_CODES
        )
        profile.save(update_fields=['assistant_roles'])


def restore_rows(apps, schema_editor):
    """Reverse recreates the two generic rows, empty — offices stay seated."""
    Department = apps.get_model("members", "Department")
    DepartmentRole = apps.get_model("members", "DepartmentRole")

    deaconate = Department.objects.filter(code="deaconate", is_active=True).first()
    if deaconate is None:
        return
    next_order = max(
        (role.sort_order for role in deaconate.roles.all()), default=-1,
    ) + 1
    for index, name in enumerate(("Leader", "Assistant")):
        DepartmentRole.objects.get_or_create(
            department=deaconate, name=name,
            defaults={"has_assistant": True, "sort_order": next_order + index},
        )


class Migration(migrations.Migration):

    dependencies = [
        ("members", "0158_health_ministry"),
    ]

    operations = [
        migrations.RunPython(seed_deaconate, restore_rows),
    ]
