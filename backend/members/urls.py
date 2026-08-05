from django.urls import path

from .views import AnnouncementView, ChurchBudgetsView, ChurchFinancialReportsView, ChurchSettingsView, EnrollmentCompleteView, EnrollmentRequestView, EnrollmentVerifyView, GivingPurposeDetailView, GivingPurposeListCreateView, InitiateContributionView, MeView, MpesaCallbackView, MyContributionsView, PasswordResetConfirmView, PasswordResetRequestView, PrayerRequestView, RegisterView, SabbathEventsView

urlpatterns = [
    path('register/', RegisterView.as_view(), name='member-register'),
    path('me/', MeView.as_view(), name='member-me'),
    path('contributions/', MyContributionsView.as_view(), name='member-contributions'),
    path('contributions/initiate/', InitiateContributionView.as_view(), name='contribution-initiate'),
    path('payments/mpesa/callback/', MpesaCallbackView.as_view(), name='mpesa-callback'),
    path('prayer-requests/', PrayerRequestView.as_view(), name='prayer-request'),
    path('reports/', ChurchFinancialReportsView.as_view(), name='church-reports'),
    path('budgets/', ChurchBudgetsView.as_view(), name='church-budgets'),
    path('sabbath-events/', SabbathEventsView.as_view(), name='sabbath-events'),
    path('church-settings/', ChurchSettingsView.as_view(), name='church-settings'),
    path('giving-purposes/', GivingPurposeListCreateView.as_view(), name='giving-purpose-list-create'),
    path('giving-purposes/<int:pk>/', GivingPurposeDetailView.as_view(), name='giving-purpose-detail'),
    path('auth/enrollment-request/', EnrollmentRequestView.as_view(), name='enrollment-request'),
    path('auth/enrollment/verify/', EnrollmentVerifyView.as_view(), name='enrollment-verify'),
    path('auth/enrollment/complete/', EnrollmentCompleteView.as_view(), name='enrollment-complete'),
    path('auth/password-reset/', PasswordResetRequestView.as_view(), name='password-reset-request'),
    path('auth/password-reset/confirm/', PasswordResetConfirmView.as_view(), name='password-reset-confirm'),
    path('announcements/', AnnouncementView.as_view(), name='announcements'),
]
