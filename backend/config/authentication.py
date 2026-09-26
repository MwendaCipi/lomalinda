"""Issuing the JWT pair the app signs in with.

A sign-in must answer with one body the client can route the member from: the
profile state in that body decides whether they first change the password they
were given or fill in the profile details they still owe, so the helpers live
here rather than being reassembled by each caller.
"""

from django.contrib.auth.models import update_last_login
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.settings import api_settings


class ChurchTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Include the member-profile onboarding state alongside the JWT pair."""

    def validate(self, attrs):
        data = super().validate(attrs)
        data.update(onboarding_flags(self.user))
        return data


def onboarding_flags(user):
    """The profile state the client needs immediately after a sign-in.

    The four details (sex, gifts, ministry, disability) are collected after the
    password step, so a member owing both is sent through the password change
    first and lands on the profile form afterwards.
    """
    profile = getattr(user, 'member_profile', None)
    return {
        'must_change_password': bool(profile and profile.must_change_password),
        'profile_update_pending': bool(profile and profile.needs_profile_update()),
    }


def sign_in_payload(user):
    """A complete sign-in answer: a fresh JWT pair plus the onboarding flags.

    The token comes from the serializer's ``get_token`` so its claims match the
    password path exactly, and ``last_login`` is stamped here, which keeps
    "last seen" reports honest.
    """
    refresh = ChurchTokenObtainPairSerializer.get_token(user)
    if api_settings.UPDATE_LAST_LOGIN:
        update_last_login(None, user)
    return {
        'access': str(refresh.access_token),
        'refresh': str(refresh),
        **onboarding_flags(user),
    }
