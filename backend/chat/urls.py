from django.urls import path

from .views import (
    AnnouncementCommentsForMemberView,
    AnnouncementCommentsView,
    ChatContactsView,
    ChatConversationListView,
    ChatConversationLeaveView,
    ChatMessageListView,
    ChatReadView,
)

urlpatterns = [
    path('conversations/', ChatConversationListView.as_view(), name='chat-conversations'),
    path('conversations/<int:conversation_id>/messages/', ChatMessageListView.as_view(), name='chat-messages'),
    path('conversations/<int:conversation_id>/read/', ChatReadView.as_view(), name='chat-read'),
    path('conversations/<int:conversation_id>/leave/', ChatConversationLeaveView.as_view(), name='chat-conversation-leave'),
    path('contacts/', ChatContactsView.as_view(), name='chat-contacts'),
    path('announcements/<int:pk>/comments/', AnnouncementCommentsView.as_view(), name='announcement-comments'),
    path('announcements/<int:pk>/comments/member/', AnnouncementCommentsForMemberView.as_view(), name='announcement-comments-member'),
]
