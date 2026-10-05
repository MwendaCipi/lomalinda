from django.urls import path

from .views import (
    ChatContactsView,
    ChatConversationListView,
    ChatMessageListView,
    ChatReadView,
)

urlpatterns = [
    path('conversations/', ChatConversationListView.as_view(), name='chat-conversations'),
    path('conversations/<int:conversation_id>/messages/', ChatMessageListView.as_view(), name='chat-messages'),
    path('conversations/<int:conversation_id>/read/', ChatReadView.as_view(), name='chat-read'),
    path('contacts/', ChatContactsView.as_view(), name='chat-contacts'),
]
