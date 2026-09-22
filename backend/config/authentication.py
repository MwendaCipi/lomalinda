from rest_framework_simplejwt.serializers import TokenObtainPairSerializer


class ChurchTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Include the member-profile onboarding state alongside the JWT pair."""

    def validate(self, attrs):
        data = super().validate(attrs)
        profile = getattr(self.user, 'member_profile', None)
        data['must_change_password'] = bool(profile and profile.must_change_password)
        return data
