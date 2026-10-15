"""How a thread, a letter and its attachments leave the API.

Read state is per officer, so it is not a column on the message and cannot be
serialised from the model alone — the views prefetch the requesting officer's
own read rows onto each message (``read_for_me``) and the serializer reports
from those, keeping the thread detail a fixed number of queries however long
the conversation runs.
"""

from rest_framework import serializers

from .models import MailAttachment, MailMessage, MailThread


class MailAttachmentSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = MailAttachment
        fields = ('id', 'filename', 'content_type', 'size', 'url')

    def get_url(self, obj):
        if not obj.file:
            return ''
        request = self.context.get('request')
        path = obj.file.url
        return request.build_absolute_uri(path) if request else path


class MailMessageSerializer(serializers.ModelSerializer):
    attachments = MailAttachmentSerializer(many=True, read_only=True)
    is_read = serializers.SerializerMethodField()
    direction_label = serializers.CharField(source='get_direction_display', read_only=True)

    class Meta:
        model = MailMessage
        fields = (
            'id', 'direction', 'direction_label', 'from_name', 'from_email',
            'to_header', 'cc_header', 'subject', 'body_text', 'body_html',
            'sent_at', 'is_read', 'message_id', 'attachments',
        )

    def get_is_read(self, obj):
        # Prefetched per officer by the view; one query only if a caller
        # serialises a message without the prefetch (the browsable API).
        prefetched = getattr(obj, 'read_for_me', None)
        if prefetched is not None:
            return bool(prefetched)
        user = self.context.get('user')
        if user is None or not getattr(user, 'is_authenticated', False):
            return True
        return obj.read_states.filter(user=user).exists()


class MailThreadSerializer(serializers.ModelSerializer):
    unread_count = serializers.IntegerField(default=0)
    has_attachments = serializers.SerializerMethodField()

    class Meta:
        model = MailThread
        fields = (
            'id', 'subject', 'correspondent_name', 'correspondent_email',
            'last_message_at', 'preview', 'message_count', 'starred',
            'archived', 'unread_count', 'has_attachments',
        )

    def get_has_attachments(self, obj):
        counts = getattr(obj, 'attachment_counts', None)
        if counts is None:
            return False
        return bool(counts.get(obj.pk))


class MailThreadDetailSerializer(MailThreadSerializer):
    messages = serializers.SerializerMethodField()

    class Meta(MailThreadSerializer.Meta):
        fields = MailThreadSerializer.Meta.fields + ('messages',)

    def get_messages(self, obj):
        messages = list(getattr(obj, 'messages_for_serialisation', obj.messages.all()))
        return MailMessageSerializer(
            messages, many=True, context=self.context
        ).data
