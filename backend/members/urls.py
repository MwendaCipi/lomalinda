from django.urls import path

from .views import MeView, MyContributionsView, RegisterView

urlpatterns = [
    path('register/', RegisterView.as_view(), name='member-register'),
    path('me/', MeView.as_view(), name='member-me'),
    path('contributions/', MyContributionsView.as_view(), name='member-contributions'),
]
