"""Who is in a room, who may read it, and how the church's rooms get made.

The rules live here rather than in a view: a room's audience is always the
church's own record — the roll, the leadership assignments, the profile ties —
never a second member list kept in the chat app, so a member added to a
department is in its group the next time the room is synced.
"""

from django.contrib.auth.models import User
from django.db.models import Q
from django.utils import timezone

from members.models import Department, DepartmentAssignment, DepartmentMembership, MemberProfile

from .models import Conversation, Message, Participant

#: The roles that make a member part of the church office. An office holder
#: reads every office thread; a member reads only their own.
OFFICE_ROLES = ('admin', 'elder', 'clerk', 'pastor')

#: The profile's legacy strings, translated into the area codes the rest of the
#: system files areas by. The office is still re-filing members, so a room must
#: read both the modern ties and these.
LEGACY_DEPARTMENT_CODES = {
    'children': 'children',
    'youth': 'aym',
    'young_adults': 'aym',
}
LEGACY_MINISTRY_CODES = {
    'adventist_men': 'amm',
    'adventist_women': 'awm',
    'young_adults': 'aym',
    'ambassadors': 'ambassadors',
}


# ── Identity ─────────────────────────────────────────────────────────────────

def full_name(user):
    """How a person's name reads in a room: their name, or their username."""
    if user is None:
        return ''
    name = f"{user.first_name} {user.last_name}".strip()
    return name or user.get_username()


def member_roles(user):
    """The role codes this account holds."""
    profile = getattr(user, 'member_profile', None)
    if profile is not None:
        return set(profile.get_roles())
    return {'admin'} if (user.is_superuser or user.is_staff) else {'member'}


def is_office_holder(user):
    """Does this account sit in the church office?"""
    if getattr(user, 'is_superuser', False) or getattr(user, 'is_staff', False):
        return True
    return bool(member_roles(user).intersection(OFFICE_ROLES))


def office_holder_ids():
    """The ids of every active office account, without a profile-per-row loop."""
    ids = set(
        User.objects.filter(is_active=True)
        .filter(Q(is_staff=True) | Q(is_superuser=True))
        .values_list('id', flat=True)
    )
    for user_id, roles, role in MemberProfile.objects.values_list('user_id', 'roles', 'role'):
        codes = {code.strip() for code in (roles or '').split(',') if code.strip()}
        if role:
            codes.add(role.strip())
        if codes.intersection(OFFICE_ROLES):
            ids.add(user_id)
    return ids


def department_member_ids(code):
    """Every account in one area: its roll, its leaders, and its profile ties."""
    ids = set(DepartmentMembership.objects.filter(department=code).values_list('member_id', flat=True))
    ids |= set(DepartmentAssignment.objects.filter(department__code=code).values_list('member_id', flat=True))
    ids |= set(MemberProfile.objects.filter(department_ref__code=code).values_list('user_id', flat=True))
    ids |= set(MemberProfile.objects.filter(ministries__code=code).values_list('user_id', flat=True))
    legacy_departments = [k for k, v in LEGACY_DEPARTMENT_CODES.items() if v == code]
    if legacy_departments:
        ids |= set(MemberProfile.objects.filter(department__in=legacy_departments).values_list('user_id', flat=True))
    legacy_ministries = [k for k, v in LEGACY_MINISTRY_CODES.items() if v == code]
    if legacy_ministries:
        ids |= set(MemberProfile.objects.filter(ministry__in=legacy_ministries).values_list('user_id', flat=True))
    return {user_id for user_id in ids if user_id is not None}


def department_leader_ids(code):
    """The accounts appointed to lead one area."""
    return set(DepartmentAssignment.objects.filter(department__code=code).values_list('member_id', flat=True))


# ── Rooms ────────────────────────────────────────────────────────────────────

def sync_area_room(conversation):
    """Bring an area room's participants in step with the church's record.

    People added to the roll arrive, people no longer in the area leave, and
    the leaders' moderator flag follows the assignments table. Opening a room
    touches nothing here; publishing a message or opening the desk does.
    """
    if conversation.department_id is None:
        return
    code = conversation.department.code
    leaders = department_leader_ids(code)
    everyone = department_member_ids(code) | leaders
    existing = {participant.member_id: participant for participant in conversation.participants.all()}
    for member_id in everyone - existing.keys():
        Participant.objects.get_or_create(
            conversation=conversation,
            member_id=member_id,
            defaults={'is_moderator': member_id in leaders},
        )
    for member_id, participant in existing.items():
        if member_id not in everyone:
            participant.delete()
            continue
        moderator = member_id in leaders
        if participant.is_moderator != moderator:
            participant.is_moderator = moderator
            participant.save(update_fields=['is_moderator'])


def ensure_area_rooms(department):
    """The area's group and channel, made if they do not exist yet.

    Every area the church keeps gets both rooms the moment anything asks for
    them: a group where the area talks, and a channel its leaders post to.
    """
    rooms = []
    for kind, key, title in (
        (Conversation.KIND_GROUP, f'dept:{department.code}', department.name),
        (Conversation.KIND_CHANNEL, f'dept:{department.code}:announce', f'{department.name} announcements'),
    ):
        conversation, _created = Conversation.objects.get_or_create(
            kind=kind,
            key=key,
            defaults={'department': department, 'title': title},
        )
        changed = []
        if conversation.department_id != department.id:
            conversation.department = department
            changed.append('department')
        if conversation.title != title:
            conversation.title = title
            changed.append('title')
        if changed:
            conversation.save(update_fields=changed)
        sync_area_room(conversation)
        rooms.append(conversation)
    return rooms


def area_room(department, kind):
    """One of an area's rooms, by kind — made and synced on the way."""
    for room in ensure_area_rooms(department):
        if room.kind == kind:
            return room
    return None


def open_dm(member_a, member_b):
    """The direct message between two members, made if this is the first."""
    if member_a.id == member_b.id:
        raise ValueError('A direct message needs two different members.')
    low, high = sorted((member_a.id, member_b.id))
    key = f'dm:{low}:{high}'
    conversation, created = Conversation.objects.get_or_create(
        kind=Conversation.KIND_DM,
        key=key,
        defaults={'created_by': member_a},
    )
    if created:
        Participant.objects.bulk_create([
            Participant(conversation=conversation, member_id=low),
            Participant(conversation=conversation, member_id=high),
        ])
    return conversation


def open_office_thread(member):
    """A member's thread with the church office, made if this is the first.

    Everyone in the office reads it and may answer; the member reads their own.
    """
    conversation, created = Conversation.objects.get_or_create(
        kind=Conversation.KIND_OFFICE,
        key=f'office:{member.id}',
        defaults={'title': f'Office — {full_name(member)}', 'created_by': member},
    )
    if created:
        Participant.objects.bulk_create(
            [Participant(conversation=conversation, member=member)]
            + [Participant(conversation=conversation, member_id=user_id, is_moderator=True)
               for user_id in office_holder_ids()]
        )
    return conversation


# ── Access ───────────────────────────────────────────────────────────────────

def is_participant(user, conversation):
    return conversation.participants.filter(member=user).exists()


def access_to(user, conversation):
    """May this account read the room?"""
    if conversation.kind == Conversation.KIND_OFFICE:
        return is_office_holder(user) or is_participant(user, conversation)
    if conversation.kind == Conversation.KIND_CHANNEL:
        return is_participant(user, conversation) or is_office_holder(user)
    return is_participant(user, conversation)


def can_post(user, conversation):
    """May this account write to the room?

    A channel is announcement-shaped: its leaders and the office post, the area
    reads. Every other room is a conversation, and a participant may speak.
    """
    if not access_to(user, conversation):
        return False
    if conversation.kind == Conversation.KIND_CHANNEL:
        participant = conversation.participants.filter(member=user).first()
        return bool((participant and participant.is_moderator) or is_office_holder(user))
    return True


def conversations_for(user):
    """The rooms this account reads, most recently active first.

    A member reads the rooms they are in; the office reads every office thread
    as well, so a question raised while nobody was looking is still waiting.
    """
    rooms = Conversation.objects.filter(participants__member=user)
    if is_office_holder(user):
        rooms = Conversation.objects.filter(
            Q(participants__member=user) | Q(kind=Conversation.KIND_OFFICE)
        )
    return rooms.distinct().order_by('-last_message_at', '-created_at', '-id')


def last_message(conversation):
    return conversation.messages.filter(deleted=False).order_by('-created_at', '-id').first()


def unread_count(conversation, user):
    """How many messages, written by others, the account has not read."""
    participant = conversation.participants.filter(member=user).first()
    if participant is None:
        return 0
    messages = conversation.messages.filter(deleted=False).exclude(sender=user)
    if participant.last_read_at is not None:
        messages = messages.filter(created_at__gt=participant.last_read_at)
    return messages.count()


def post_message(conversation, user, body):
    """Write a message and stamp the room's last-message time."""
    message = Message.objects.create(conversation=conversation, sender=user, body=body.strip())
    conversation.last_message_at = message.created_at
    conversation.save(update_fields=['last_message_at'])
    return message


def mark_read(conversation, user):
    """Move this account's read marker to now, if they are in the room."""
    participant = conversation.participants.filter(member=user).first()
    if participant is None:
        return None
    participant.last_read_at = timezone.now()
    participant.save(update_fields=['last_read_at'])
    return participant


def dm_partner(conversation, user):
    """The other member of a direct message, for naming the thread."""
    participant = (
        conversation.participants.select_related('member')
        .exclude(member=user)
        .first()
    )
    return participant.member if participant else None


def conversation_title(conversation, user):
    """How a room reads in a list: the area, the partner, or its own title."""
    if conversation.kind == Conversation.KIND_DM:
        partner = dm_partner(conversation, user)
        return full_name(partner) if partner else 'Direct message'
    return conversation.title or conversation.get_kind_display()
