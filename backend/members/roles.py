"""The hard-coded church roles.

Roles are deliberately code, not a database table: the codes below are the only
values an account may hold, and each one maps onto a Django group that carries
its permissions. ``MemberProfile.ROLE_CHOICES`` is derived from this list, and
``ROLE_OPTIONS`` in ``frontend/src/components/roles-combobox.tsx`` mirrors it.

The Administrator role is a **system** role: it always carries every permission
and may only be granted or revoked by a superuser (see
``can_manage_system_roles``).
"""

ADMIN_ROLE = 'admin'

# (code, label, django group, is system role) — order is canonical.
ROLE_DEFINITIONS = (
    ('member', 'Member', None, False),
    ('clerk', 'Church Clerk', 'Church Leaders', False),
    ('elder', 'Elder / First Elder', 'Church Leaders', False),
    ('youth_leader', 'Youth Leader', None, False),
    ('choir_director', 'Choir Director', 'Choir Director', False),
    ('children_ministry', 'Children Leader', 'Children Ministry', False),
    ('men_ministry', 'AMM Leader', 'Adventist Men Ministries', False),
    ('women_ministry', 'AWM Leader', 'Adventist Women Ministries', False),
    ('chaplaincy', 'Chaplain', 'Chaplaincy', False),
    ('finance', 'Finance Team', 'Finance Team', False),
    ('treasurer', 'Treasurer', 'Finance Team', False),
    ('leader', 'Church Leader', 'Church Leaders', False),
    (ADMIN_ROLE, 'Administrator', 'Administrators', True),
)

ROLE_CHOICES = tuple((code, label) for code, label, _group, _system in ROLE_DEFINITIONS)
ROLE_CODES = tuple(code for code, _label, _group, _system in ROLE_DEFINITIONS)
ROLE_LABELS = {code: label for code, label, _group, _system in ROLE_DEFINITIONS}
#: Church role code -> default Django group (kept in step with migration 0009 / seed_defaults)
ROLE_GROUP_MAP = {code: group for code, _label, group, _system in ROLE_DEFINITIONS if group}
SYSTEM_ROLE_CODES = tuple(code for code, _label, _group, system in ROLE_DEFINITIONS if system)
DEFAULT_ROLE = 'member'


def is_system_role(code):
    """A system role carries full permissions and cannot be edited or removed."""
    return code in SYSTEM_ROLE_CODES


def role_label(code):
    return ROLE_LABELS.get(code, (code or '').replace('_', ' ').title())


def role_labels(codes):
    return ', '.join(role_label(code) for code in codes)


def parse_role_codes(value):
    """Split a submitted role value into a clean, de-duplicated code list.

    Accepts a comma separated string, a list of strings, or ``None``, and always
    returns codes in canonical order. Unknown codes are kept so callers can
    report them; use :func:`normalize_roles` when they should be dropped.
    """
    if value is None:
        raw = []
    elif isinstance(value, str):
        raw = value.split(',')
    else:
        raw = list(value)

    seen = []
    for item in raw:
        code = str(item or '').strip()
        if code and code not in seen:
            seen.append(code)
    known = [code for code in ROLE_CODES if code in seen]
    return known + [code for code in seen if code not in ROLE_CODES]


def unknown_role_codes(codes):
    return [code for code in codes if code not in ROLE_CODES]


def normalize_roles(value, default=(DEFAULT_ROLE,)):
    """Return the role codes to store for ``value``, dropping unknown codes."""
    codes = [code for code in parse_role_codes(value) if code in ROLE_CODES]
    if not codes:
        codes = [code for code in default]
    return codes


def sync_role_groups(user, codes):
    """Point ``user`` at the Django groups for ``codes``.

    The Administrator role (and every other role) always carries its group's
    permissions. Groups that are not role groups are left untouched.
    """
    from django.contrib.auth.models import Group

    managed = set(ROLE_GROUP_MAP.values())
    wanted = {ROLE_GROUP_MAP[code] for code in codes if code in ROLE_GROUP_MAP}
    others = {group.name for group in user.groups.all() if group.name not in managed}
    names = wanted | others
    if not names:
        return []
    groups = list(Group.objects.filter(name__in=names))
    user.groups.set(groups)
    return sorted(group.name for group in groups)


def can_manage_system_roles(actor):
    """Whether ``actor`` may hand out or take away a system role (Administrator).

    Only superusers and administrators may touch the Administrator role, so a
    clerk or leader can never promote themselves or demote an administrator.
    """
    if not actor or not getattr(actor, 'is_authenticated', False):
        return False
    if getattr(actor, 'is_superuser', False) or getattr(actor, 'is_staff', False):
        return True
    profile = getattr(actor, 'member_profile', None)
    return bool(profile and profile.has_role(ADMIN_ROLE))


def check_system_role_change(actor, target_user, old_roles, new_roles):
    """Return an error message if ``actor`` may not make this system-role change.

    Administrator is a system role: only administrators and superusers may grant
    or revoke it, and nobody may revoke their own (that would lock the church out
    of its own console).
    """
    old_system = sorted({code for code in old_roles if is_system_role(code)})
    new_system = sorted({code for code in new_roles if is_system_role(code)})
    if old_system == new_system:
        return None

    if not can_manage_system_roles(actor):
        return f"Only an administrator can grant or change the {role_label(ADMIN_ROLE)} role."

    if getattr(actor, 'id', None) == getattr(target_user, 'id', None):
        dropped = [code for code in old_system if code not in new_system]
        if dropped:
            return (
                f"You cannot remove your own {role_label(ADMIN_ROLE)} role. "
                "Ask another administrator to change it for you."
            )
    return None
