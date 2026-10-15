from django.urls import path

from . import views

app_name = 'maildesk'

urlpatterns = [
    path('summary/', views.MailboxSummaryView.as_view(), name='summary'),
    path('sync/', views.MailboxSyncView.as_view(), name='sync'),
    path('compose/', views.MailboxComposeView.as_view(), name='compose'),
    path('threads/', views.MailThreadListView.as_view(), name='threads'),
    path('threads/<int:pk>/', views.MailThreadDetailView.as_view(), name='thread'),
    path('threads/<int:pk>/reply/', views.MailThreadReplyView.as_view(), name='thread-reply'),
    path('threads/<int:pk>/state/', views.MailThreadStateView.as_view(), name='thread-state'),
]
