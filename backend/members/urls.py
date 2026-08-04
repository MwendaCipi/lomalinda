from django.urls import path

from .views import ChurchFinancialReportsView, InitiateContributionView, MeView, MpesaCallbackView, MyContributionsView, PrayerRequestView, RegisterView, SabbathEventsView

urlpatterns = [
    path('register/', RegisterView.as_view(), name='member-register'),
    path('me/', MeView.as_view(), name='member-me'),
    path('contributions/', MyContributionsView.as_view(), name='member-contributions'),
    path('contributions/initiate/', InitiateContributionView.as_view(), name='contribution-initiate'),
    path('payments/mpesa/callback/', MpesaCallbackView.as_view(), name='mpesa-callback'),
    path('prayer-requests/', PrayerRequestView.as_view(), name='prayer-request'),
    path('reports/', ChurchFinancialReportsView.as_view(), name='church-reports'),
    path('sabbath-events/', SabbathEventsView.as_view(), name='sabbath-events'),
]
