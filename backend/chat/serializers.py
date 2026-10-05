from django.contrib.auth.models import User
from rest_framework import serializers

from . import services
from .models import Conversation, Message


class ChatPersonSerializer(serializers.ModelSerializer):
    """A member as a room names them — an id, a handle and a name."""

    name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ('id', 'username', 'name')

    def get_name(self, obj):
        return services.full_name(obj)


class ChatMessageSerializer(serializers.ModelSerializer):
    """One message, with its sender named for the bubble."""

    sender = ChatPersonSerializer(read_only=True)
    sender_id = serializers.IntegerField(read_only=True)

    class Meta:
        model = Message
        fields = ('id', 'conversation', 'sender', 'sender_id', 'body', 'created_at', 'edited_at', 'deleted')


class ChatConversationSerializer(serializers.ModelSerializer):
    """A room as a list shows it, read for the member asking."""

    title = serializers.SerializerMethodField()
    department_code = serializers.SerializerMethodField()
    department_label = serializers.SerializerMethodField()
    other = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()
    can_post = serializers.SerializerMethodField()
    is_moderator = serializers.SerializerMethodField()
    participants = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = (
            'id', 'kind', 'title', 'department_code', 'department_label',
            'other', 'participants', 'last_message', 'unread_count',
            'can_post', 'is_moderator', 'created_at', 'last_message_at',
        )

    def _user(self):
        return self.context['request'].user

    def get_title(self, obj):
        return services.conversation_title(obj, self._user())

    def get_department_code(self, obj):
        return obj.department.code if obj.department_id else ''

    def get_department_label(self, obj):
        return obj.department.name if obj.department_id else ''

    def get_other(self, obj):
        if obj.kind != Conversation.KIND_DM:
            return None
        partner = services.dm_partner(obj, self._user())
        return ChatPersonSerializer(partner).data if partner else None

    def get_last_message(self, obj):
        message = services.last_message(obj)
        return ChatMessageSerializer(message).data if message else None

    def get_unread_count(self, obj):
        return services.unread_count(obj, self._user())

    def get_can_post(self, obj):
        return services.can_post(self._user(), obj)

    def get_is_moderator(self, obj):
        participant = obj.participants.filter(member=self._user()).first()
        return bool(participant and participant.is_moderator)

    def get_participants(self, obj):
        if obj.kind not in (Conversation.KIND_DM, Conversation.KIND_OFFICE):
            return []
        people = [participant.member for participant in obj.participants.select_related('member')]
        return ChatPersonSerializer(people, many=True).data
