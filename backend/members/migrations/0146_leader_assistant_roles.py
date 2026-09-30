"""The leadership desk appoints by position: Leader (1) and Assistants (2).

Every area's seeded roles are pruned to just its Leader and its Assistant —
the two positions the desk searches under — except Eldership, which keeps
the three elders the church elects (First, Second, Third), each still an
office of its own. The named offices the old template carried (Head Deacon,
Church Clerk, Secretary, Treasurer…) go, and where an area had no plain
Leader/Assistant pair, its oldest seeded office row is renamed into the
missing position so the appointments on it survive the reshape; kind rows
are then moved onto the position they serve (an assistant held on a renamed
"Church Clerk" lands under the new Assistant role). Custom roles are
untouched: those are the areas' own additions, created by their leaders
from the leadership modal.
"""

from django.db import migrations

#: Eldership's offices are the shape itself, not roles to prune away.
ELDERSHIP_ROLES = {"First Elder", "Second Elder", "Third Elder"}


def reshape_roles(apps, schema_editor):
    Department = apps.get_model("members", "Department")
    DepartmentRole = apps.get_model("members", "DepartmentRole")

    for department in Department.objects.filter(is_active=True):
        roles = list(department.roles.all().order_by("sort_order", "id"))
        if department.code == "eldership":
            keep_names = ELDERSHIP_ROLES
            position_order = ("First Elder", "Second Elder", "Third Elder", "Assistant")
        else:
            keep_names = {"Leader", "Assistant"}
            position_order = ("Leader", "Assistant")

        seeded = [role for role in roles if not role.is_custom and role.name not in keep_names]
        custom = [role for role in roles if role.is_custom]
        kept = [role for role in roles if role not in seeded]

        def has(name):
            return any(role.name == name for role in kept)

        # Rename the oldest pruned row into a missing position first — its
        # assignments ride along, so whoever held the old office keeps serving.
        for position in ("Leader", "Assistant"):
            if not has(position) and seeded:
                role = seeded.pop(0)
                role.name = position
                role.has_assistant = True
                role.save(update_fields=["name", "has_assistant"])
                kept.append(role)

        # What renaming could not cover is created fresh.
        next_order = max((role.sort_order for role in kept), default=-1) + 1
        for position in ("Leader", "Assistant"):
            if not has(position):
                DepartmentRole.objects.create(
                    department=department, name=position, has_assistant=True, sort_order=next_order,
                )
                next_order += 1

        # In the areas beyond Eldership, seat kinds land on the position they
        # serve: a leader held on the renamed Assistant row moves to Leader,
        # an assistant held on the renamed Leader row moves to Assistant.
        if department.code != "eldership":
            leader_role = next((role for role in kept if role.name == "Leader"), None)
            assistant_role = next((role for role in kept if role.name == "Assistant"), None)
            if leader_role and assistant_role:
                assistant_role.assignments.filter(kind="leader").update(role=leader_role)
                leader_role.assignments.filter(kind="assistant").update(role=assistant_role)

        # The rest of the seeded template goes, appointments included; a
        # church-wide flag carried by title keeps syncing through the sync's
        # office-title fallback, so no permission is lost with the row.
        for role in seeded:
            role.delete()

        # The positions lead the list in church order, then the custom roles
        # in the order the desk added them.
        order = 0
        for name in position_order:
            for role in kept:
                if role.name == name:
                    role.sort_order = order
                    role.save(update_fields=["sort_order"])
                    order += 1
        for role in custom:
            if role.name not in position_order:
                role.sort_order = order
                role.save(update_fields=["sort_order"])
                order += 1


def unreshape(apps, schema_editor):
    """Re-seed the old template beside what survived; appointments stay."""
    DepartmentRole = apps.get_model("members", "DepartmentRole")
    Department = apps.get_model("members", "Department")

    for department in Department.objects.filter(is_active=True):
        template = (
            (("First Elder", False), ("Second Elder", False), ("Third Elder", False))
            if department.code == "eldership"
            else (("Leader", True), ("Secretary", False), ("Treasurer", False))
        )
        next_order = max((role.sort_order for role in department.roles.all()), default=-1) + 1
        for name, assistant in template:
            if not department.roles.filter(name=name).exists():
                DepartmentRole.objects.create(
                    department=department, name=name, has_assistant=assistant, sort_order=next_order,
                )
                next_order += 1


class Migration(migrations.Migration):

    dependencies = [
        ("members", "0145_choir_ministry"),
    ]

    operations = [
        migrations.RunPython(reshape_roles, unreshape),
    ]
