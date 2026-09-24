from rest_framework_simplejwt.serializers import TokenObtainPairSerializer


class ChurchTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Include the member-profile onboarding state alongside the JWT pair."""

    def validate(self, attrs):
        data = super().validate(attrs)
        profile = getattr(self.user, 'member_profile', None)
        data['must_change_password'] = bool(profile and profile.must_change_password)
        # The four details (sex, gifts, ministry, disability) are collected
        # after the password step, so a member owing both is sent through the
        # password change first and lands on the profile form afterwards.
        data['profile_update_pending'] = bool(profile and profile.needs_profile_update())
        return data
