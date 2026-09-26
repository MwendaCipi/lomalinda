"""The hard-coded church roles.

Roles are deliberately code, not a database table: the codes below are the only
values an account may hold, and each one maps onto a Django group that carries
its permissions. ``MemberProfile.ROLE_CHOICES`` is derived from this list, and
``ROLE_OPTIONS`` in ``frontend/src/components/roles-options.ts`` mirrors it.

The Administrator role is a **system** role: it always carries every permission
and may only be granted or revoked by a superuser (see
``can_manage_system_roles``).

Two rules come from how the church is actually organised:

* Roles are **shared** — a department may carry several holders at once, so
  there is no one-leader constraint. What stays is the assistant distinction:
  a holder may be marked as an assistant on any role that takes one (elder
  roles take none), and a member can never be both a role's plain holder and
  its assistant at the same time.
"""

ADMIN_ROLE = 'admin'
DEFAULT_ROLE = 'member'

# (code, label, django group, is system role, may have an assistant) — the
# order is canonical and is the order the pickers show.
ROLE_DEFINITIONS = (
    (DEFAULT_ROLE, 'Member', None, False, False),
    ('clerk', 'Church Clerk', 'Church Leaders', False, True),
    ('elder', 'Elder', 'Church Leaders', False, False),
    ('first_elder', 'First Elder', 'Church Leaders', False, False),
    ('second_elder', 'Second Elder', 'Church Leaders', False, False),
    ('third_elder', 'Third Elder', 'Church Leaders', False, False),
    ('head_deacon', 'Head Deacon', 'Church Leaders', False, True),
    ('head_deaconess', 'Head Deaconess', 'Church Leaders', False, True),
    ('treasurer', 'Treasurer', 'Treasury', False, True),
    ('pm_leader', 'PM Leader', None, False, True),
    ('apm_leader', 'APM Leader', 'Adventist Possibility Ministries', False, True),
    # `men_ministry` / `women_ministry` keep their long-standing codes: every
    # permission check in the app names them, and a code is not what anyone
    # reads — the labels below are. AMM = Adventist Men Ministries; APM
    # (Possibility Ministries) is a different office with its own code below
    # the PM (Personal Ministries) leader.
    ('men_ministry', 'AMM Leader', 'Adventist Men Ministries', False, True),
    ('women_ministry', 'AWM Leader', 'Adventist Women Ministries', False, True),
    ('youth_leader', 'Youth Leader', None, False, True),
    ('chaplaincy', 'Chaplaincy Leader', 'Chaplaincy', False, True),
    ('children_ministry', 'Children Leader', 'Children Ministry', False, True),
    ('health_leader', 'Health Leader', None, False, True),
    ('ambassadors_leader', 'Ambassadors Leader', None, False, True),
    ('education_leader', 'Education Leader', None, False, True),
    ('family_life', 'Family Life', None, False, True),
    ('pathfinders_leader', 'Pathfinders Leader', None, False, True),
    ('adventurers_leader', 'Adventurers Leader', None, False, True),
    ('publishing_head', 'Publishing Head', None, False, True),
    ('welfare_leader', 'Welfare Leader', None, False, True),
    ('interest_coordinator', 'Interest Coordinator', None, False, True),
    ('development', 'Development', None, False, True),
    ('choir_director', 'Choir Director', 'Choir Director', False, True),
    (ADMIN_ROLE, 'Administrator', 'Administrators', True, False),
)

ROLE_CHOICES = tuple((code, label) for code, label, _g, _s, _a in ROLE_DEFINITIONS)
ROLE_CODES = tuple(code for code, _label, _g, _s, _a in ROLE_DEFINITIONS)
ROLE_LABELS = {code: label for code, label, _g, _s, _a in ROLE_DEFINITIONS}
#: Church role code -> default Django group (kept in step with migration 0009 / seed_defaults)
ROLE_GROUP_MAP = {code: group for code, _label, group, _s, _a in ROLE_DEFINITIONS if group}
SYSTEM_ROLE_CODES = tuple(code for code, _l, _g, system, _a in ROLE_DEFINITIONS if system)
#: Roles that may additionally be held *as an assistant*.
ASSISTANT_ROLE_CODES = tuple(code for code, _l, _g, _s, assistant in ROLE_DEFINITIONS if assistant)


def is_system_role(code):
    """A system role carries full permissions and cannot be edited or removed."""
    return code in SYSTEM_ROLE_CODES


def role_label(code):
    return ROLE_LABELS.get(code, (code or '').replace('_', ' ').title())


def role_labels(codes):
    return ', '.join(role_label(code) for code in codes)


def role_allows_assistant(code):
    return code in ASSISTANT_ROLE_CODES


# -- Announcement audiences ---------------------------------------------
#
# "Post to" addresses an announcement to parts of the church. The departments
# are the ministry offices themselves — the same roles the church already
# holds — so no second list of departments can drift out of step with reality.
# The two non-ministry channels decide how far beyond the sign-in the post
# travels.
MINISTRY_AUDIENCE_OPTIONS = (
    # The congregation groups a post can address, alongside the ministry
    # offices below. These name membership, not office: a post to Adventist
    # Men reaches the men, not only their leader.
    ('adventist_men', 'Adventist Men'),
    ('adventist_women', 'Adventist Women'),
    ('young_adults', 'Young Adults'),
    ('board', 'Board Members'),
    ('pm_leader', 'PM Leader (Personal Ministries)'),
    ('apm_leader', 'APM Leader (Possibility Ministries)'),
    ('men_ministry', 'AMM Leader (Adventist Men)'),
    ('women_ministry', 'AWM Leader (Adventist Women)'),
    ('youth_leader', 'Youth Leader (Adventist Youth)'),
    ('ambassadors_leader', 'Ambassadors Leader'),
    ('pathfinders_leader', 'Pathfinders Leader'),
    ('adventurers_leader', 'Adventurers Leader'),
    ('children_ministry', 'Children Leader'),
    ('health_leader', 'Health Leader'),
    ('education_leader', 'Education Leader'),
    ('family_life', 'Family Life Leader'),
    ('chaplaincy', 'Chaplaincy Leader'),
    ('publishing_head', 'Publishing Head'),
    ('welfare_leader', 'Welfare Leader'),
    ('interest_coordinator', 'Interest Coordinator'),
    ('development', 'Development'),
    ('choir_director', 'Choir Director'),
    ('head_deacon', 'Head Deacon'),
    ('head_deaconess', 'Head Deaconess'),
    ('treasurer', 'Treasurer'),
    ('clerk', 'Church Clerk'),
)

MINISTRY_AUDIENCE_CODES = tuple(code for code, _label in MINISTRY_AUDIENCE_OPTIONS)


def unknown_audience_codes(codes):
    """Codes outside the audience vocabulary — refused at the API."""
    allowed = set(MINISTRY_AUDIENCE_CODES)
    return [code for code in (codes or []) if code not in allowed]


# -- Per-role rights ---------------------------------------------------
#
# Every role carries its own bundle of rights — what a holder may do in the
# app by virtue of the office. The rights are the vocabulary the rest of the
# code checks; the Church Roles Configuration screen in church settings decides
# which rights each role carries, and the defaults below are what a church
# gets before it touches anything.

#: The whole rights vocabulary, in display order: (code, label, description).
ROLE_RIGHTS = (
    ('finance', 'Finance', 'Open the finance desk: reconciliation, cash receipts, refunds and fund drives.'),
    ('treasury_accounts', 'Treasury Accounts', 'Create and manage treasury accounts, transfers and expenditures.'),
    ('board_invitations', 'Board Invitations', 'Schedule board meetings and send board invitations.'),
    ('business_invitations', 'Business Invitations', 'Schedule business meetings and send the invitations.'),
    ('announcements', 'Announcements', 'Publish announcements to the church.'),
    ('requests_admin', 'Requests Desk', 'Review prayer, visitation and dedication requests.'),
    ('members_admin', 'Member Records', 'Edit member records, invitations and transfers.'),
    ('reports', 'Financial Reports', 'See the live reports and published financial figures.'),
)

ROLE_RIGHT_CODES = tuple(code for code, _label, _desc in ROLE_RIGHTS)

#: What each role may do before the church edits anything. The administrator
#: role is not listed — a system role always carries every right.
DEFAULT_ROLE_RIGHTS = {
    'clerk': ('board_invitations', 'business_invitations', 'announcements', 'members_admin', 'requests_admin'),
    'elder': ('board_invitations', 'business_invitations', 'announcements', 'requests_admin'),
    'first_elder': ('board_invitations', 'business_invitations', 'announcements', 'requests_admin'),
    'second_elder': ('board_invitations', 'business_invitations', 'announcements'),
    'third_elder': ('board_invitations', 'business_invitations', 'announcements'),
    'treasurer': ('finance', 'treasury_accounts', 'reports'),
    'head_deacon': ('requests_admin',),
    'head_deaconess': ('requests_admin',),
    'youth_leader': ('announcements',),
    'choir_director': ('announcements',),
    'children_ministry': ('announcements',),
    'men_ministry': ('announcements',),
    'women_ministry': ('announcements',),
    'chaplaincy': ('requests_admin',),
}


def role_rights_settings(settings_obj=None):
    """The configured rights per role, falling back to the shipped defaults.

    The stored shape is ``{role_code: [right_code, …]}``; empty or missing
    entries fall back per-role to the defaults, so a church that has only
    customised one role keeps the shipped rights everywhere else.
    """
    if settings_obj is None:
        from .models import ChurchSettings
        settings_obj = ChurchSettings.objects.first()
    stored = getattr(settings_obj, 'role_rights', None) or {}
    configured = {}
    for code in ROLE_CODES:
        if code in stored and isinstance(stored[code], (list, tuple)):
            configured[code] = [r for r in stored[code] if r in ROLE_RIGHT_CODES]
        elif code in DEFAULT_ROLE_RIGHTS:
            configured[code] = list(DEFAULT_ROLE_RIGHTS[code])
        else:
            configured[code] = []
    return configured


def user_has_right(user, right):
    """Whether ``user`` may do ``right`` through any role they hold.

    Administrators and staff hold every right by definition — the system role
    carries all of them even when its holder is not a Django staff account.
    Assistants count: they hold the role, and the office's rights ride on the
    role.
    """
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    if getattr(user, 'is_staff', False) or getattr(user, 'is_superuser', False):
        return True
    profile = getattr(user, 'member_profile', None)
    if not profile:
        return False
    if any(is_system_role(code) for code in profile.get_roles()):
        return True
    rights = role_rights_settings()
    return any(right in rights.get(code, ()) for code in profile.get_roles())


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


def user_display_name(user):
    """The name the office would recognise, falling back to the username."""
    if not user:
        return ''
    full = f"{user.first_name or ''} {user.last_name or ''}".strip()
    return full or user.username


def assignment_error(target_user, codes, assistants=()):
    """Return ``(field, message)`` when this assignment breaks a church rule.

    ``codes`` is the full role set the member would hold and ``assistants`` the
    subset of it they would hold as an assistant. Roles are shared freely; the
    rules left are that an assistant flag needs the role and the role must
    take one, and a holder can't also be the role's assistant.
    """
    codes = list(codes)
    assistants = list(assistants)

    for code in assistants:
        if code not in codes:
            return (
                'assistant_roles',
                f"{role_label(code)} can only be an assistant on a role the member already holds.",
            )
        if not role_allows_assistant(code):
            return (
                'assistant_roles',
                f"{role_label(code)} does not take an assistant.",
            )
    return None


def role_register():
    """Every role with who holds it, for the role pickers.

    ``leader`` is kept for the pickers' display — the first holder of the role
    in join order, assistant or not — and ``assistants`` the holders marked as
    assistants. With roles shared freely, ``leader`` no longer gates anything.
    """
    from .models import MemberProfile

    leaders = {}
    assistants = {}
    for profile in MemberProfile.objects.select_related('user').order_by('id'):
        name = user_display_name(profile.user)
        held = profile.get_roles()
        shared = profile.get_assistant_roles()
        for code in held:
            if code == DEFAULT_ROLE:
                # Member is the everyone-state, not an office: tallying it
                # would crown the first-ever member its "holder" and make the
                # pickers read the plain role as taken.
                continue
            if code in shared:
                assistants.setdefault(code, []).append({'id': profile.user_id, 'name': name})
            # Display leader: the first holder in join order, assistant or not —
            # a role staffed by an assistant alone still names somebody.
            leaders.setdefault(code, {'id': profile.user_id, 'name': name})

    register = []
    for code, label, group, system, assistant in ROLE_DEFINITIONS:
        register.append({
            'code': code,
            'label': label,
            'group': group or '',
            'system': system,
            'assistant': assistant,
            'leader': leaders.get(code),
            'assistants': assistants.get(code, []),
        })
    return register


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
    clerk or elder can never promote themselves or demote an administrator.
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
