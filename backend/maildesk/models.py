"""The letters that arrive at ``info@sdalomalinda.or.ke``, kept as a desk.

The model is deliberately close to how the office already experiences mail: a
*thread* is one conversation, a *message* is a letter inside it, and the thread
carries only what the list needs to show before anything is opened.

Everything is tenant-scoped, so one church's correspondence can never be read
from another's schema. Read state is **per account** rather than a flag on the
letter: elders, clerks and the administrator share this desk, and one of them
having read a letter says nothing about whether the others have — so the
unread count on a thread means *this* officer is waiting, not somebody else.

The cursor is the one piece of bookkeeping IMAP demands: a mailbox's UIDs are
only meaningful against the folder's ``UIDVALIDITY``, and a server that
rebuilds the folder invalidates them, so the desk must notice and start again
rather than silently skip mail it has never seen.
"""

from django.conf import settings
from django.db import models


class MailThread(models.Model):
    """One conversation: the subject, who it is with, and where it stands."""

    subject = models.CharField(max_length=998, blank=True, default='')
    correspondent_name = models.CharField(max_length=255, blank=True, default='')
    correspondent_email = models.EmailField(blank=True, default='')
    last_message_at = models.DateTimeField(db_index=True)
    preview = models.CharField(max_length=200, blank=True, default='')
    message_count = models.PositiveIntegerField(default=0)
    starred = models.BooleanField(default=False)
    archived = models.BooleanField(default=False)

    class Meta:
        ordering = ['-last_message_at', '-id']
        verbose_name = 'email thread'
        verbose_name_plural = 'email threads'
        indexes = [
            models.Index(fields=['archived', '-last_message_at']),
            models.Index(fields=['starred', '-last_message_at']),
        ]

    def __str__(self):
        return self.subject or self.correspondent_email or f'Thread {self.pk}'


class MailMessage(models.Model):
    """One letter — one that arrived, or one the desk wrote itself."""

    DIRECTION_INBOUND = 'in'
    DIRECTION_OUTBOUND = 'out'
    DIRECTION_CHOICES = (
        (DIRECTION_INBOUND, 'Arrived'),
        (DIRECTION_OUTBOUND, 'Sent'),
    )

    thread = models.ForeignKey(MailThread, on_delete=models.CASCADE, related_name='messages')
    #: RFC 5322 ``Message-ID``, unique across the whole desk. Ingestion is
    #: keyed on it, so the same letter fetched twice is stored once — the
    #: property that makes re-running a poll mid-way safe.
    message_id = models.CharField(max_length=255, unique=True)
    in_reply_to = models.CharField(max_length=255, blank=True, default='', db_index=True)
    references = models.TextField(blank=True, default='')
    direction = models.CharField(max_length=3, choices=DIRECTION_CHOICES, default=DIRECTION_INBOUND)
    from_name = models.CharField(max_length=255, blank=True, default='')
    from_email = models.EmailField(blank=True, default='')
    to_header = models.TextField(blank=True, default='')
    cc_header = models.TextField(blank=True, default='')
    subject = models.CharField(max_length=998, blank=True, default='')
    body_text = models.TextField(blank=True, default='')
    body_html = models.TextField(blank=True, default='')
    sent_at = models.DateTimeField(db_index=True)
    #: The IMAP UID this letter was fetched under, kept so a letter is traceable
    #: back to the mailbox it came from. Outgoing letters have none.
    uid = models.PositiveIntegerField(null=True, blank=True, db_index=True)
    size = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['sent_at', 'id']
        verbose_name = 'email'
        verbose_name_plural = 'emails'

    def __str__(self):
        direction = '→' if self.direction == self.DIRECTION_OUTBOUND else '←'
        return f'{direction} {self.subject or self.message_id}'


class MailAttachment(models.Model):
    """A file a letter carried, stored where the rest of the media lives."""

    message = models.ForeignKey(MailMessage, on_delete=models.CASCADE, related_name='attachments')
    filename = models.CharField(max_length=255, blank=True, default='attachment')
    content_type = models.CharField(max_length=100, blank=True, default='application/octet-stream')
    file = models.FileField(upload_to='mailbox/%Y/%m/', blank=True)
    size = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['id']

    def __str__(self):
        return self.filename


class MailReadState(models.Model):
    """One account's mark against one letter: *I* have read this.

    A row existing means read; no row means unread. Storing absence rather
    than an ``is_read`` flag on the message is what keeps four officers' unread
    counts independent without a column per officer.
    """

    message = models.ForeignKey(MailMessage, on_delete=models.CASCADE, related_name='read_states')
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='mailbox_read_states'
    )
    read_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['message', 'user'], name='mailbox_read_once_per_account'),
        ]

    def __str__(self):
        return f'{self.user_id} read {self.message_id}'


class MailboxCursor(models.Model):
    """The high-water mark of the IMAP mailbox this desk polls.

    A singleton (``pk=1``). ``last_uid`` is only meaningful while
    ``uid_validity`` still matches the folder's, so a change there is a reset
    rather than a cursor to keep.
    """

    uid_validity = models.PositiveBigIntegerField(default=0)
    last_uid = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = 'mailbox cursor'
        verbose_name_plural = 'mailbox cursor'

    def __str__(self):
        return f'uid {self.last_uid} (validity {self.uid_validity})'
