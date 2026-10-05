"""Chat: the church talking to itself.

Four kinds of room, one shape. A **direct message** is two members; an area's
**group** is everyone on its roll together with its leaders; an **office
thread** is a member raising something with the church office; an area's
**channel** is announcement-shaped — its leaders post, the area reads.

A room owns ``Message`` rows and ``Participant`` rows. A participant's
``last_read_at`` is what makes an unread count possible, so unread is a
property of the room and the reader, never a second table to keep in step.
"""

from django.conf import settings
from django.db import models
from django.utils import timezone


class Conversation(models.Model):
    """One room. Its kind decides who is in it and who may post."""

    KIND_DM = 'dm'
    KIND_GROUP = 'group'
    KIND_OFFICE = 'office'
    KIND_CHANNEL = 'channel'
    KIND_CHOICES = [
        (KIND_DM, 'Direct message'),
        (KIND_GROUP, 'Area group'),
        (KIND_OFFICE, 'Office thread'),
        (KIND_CHANNEL, 'Announcement channel'),
    ]

    kind = models.CharField(max_length=16, choices=KIND_CHOICES)
    title = models.CharField(max_length=120, blank=True)
    #: The area a group or channel belongs to; null for a direct message and
    #: for an office thread.
    department = models.ForeignKey(
        'members.Department',
        null=True, blank=True,
        on_delete=models.CASCADE,
        related_name='chat_conversations',
    )
    #: A stable name for the rooms the church owns rather than a member
    #: opening: an area's group (``dept:<code>``), its channel
    #: (``dept:<code>:announce``), a member's office thread (``office:<id>``)
    #: and the unordered pair of a direct message (``dm:<lo>:<hi>``). Blank for
    #: a room that has no key, which nothing here creates.
    key = models.CharField(max_length=120, blank=True, db_index=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='chat_conversations_created',
    )
    created_at = models.DateTimeField(default=timezone.now)
    #: When the last message landed; the desk's ordering key.
    last_message_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ('-last_message_at', '-created_at', '-id')
        constraints = [
            models.UniqueConstraint(
                fields=('kind', 'key'),
                condition=~models.Q(key=''),
                name='uniq_chat_room_key',
            ),
        ]

    def __str__(self):
        return f"{self.get_kind_display()}: {self.title or self.key or self.pk}"


class Participant(models.Model):
    """One member's place in a room, and how far they have read it."""

    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name='participants')
    member = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='chat_participations')
    #: Whether this member may post to a channel — the area's leaders are
    #: moderators, the roll reads. Groups ignore it (everyone may post).
    is_moderator = models.BooleanField(default=False)
    joined_at = models.DateTimeField(default=timezone.now)
    #: The moment this member last read the room; the unread count is the
    #: messages after it that somebody else wrote.
    last_read_at = models.DateTimeField(null=True, blank=True)
    muted = models.BooleanField(default=False)

    class Meta:
        ordering = ('joined_at', 'id')
        constraints = [
            models.UniqueConstraint(fields=('conversation', 'member'), name='uniq_chat_participant'),
        ]

    def __str__(self):
        return f"{self.member.get_username()} in {self.conversation_id}"


class Message(models.Model):
    """One thing said in a room."""

    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name='messages')
    #: Null once the sender's account is removed; the words stay.
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='chat_messages',
    )
    body = models.TextField()
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    edited_at = models.DateTimeField(null=True, blank=True)
    #: A deleted message keeps its row so a room's history does not silently
    #: re-order under a reader; the body is hidden on the way out.
    deleted = models.BooleanField(default=False)

    class Meta:
        ordering = ('created_at', 'id')

    def __str__(self):
        return f"{self.pk} in {self.conversation_id}"
