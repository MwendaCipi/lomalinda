from rest_framework import generics
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Contribution
from .serializers import ContributionSerializer, RegisterSerializer


class RegisterView(generics.CreateAPIView):
    permission_classes = [AllowAny]
    serializer_class = RegisterSerializer


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile = getattr(request.user, 'member_profile', None)
        return Response({'id': request.user.id, 'username': request.user.username, 'email': request.user.email, 'first_name': request.user.first_name, 'last_name': request.user.last_name, 'phone_number': profile.phone_number if profile else ''})


class MyContributionsView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ContributionSerializer

    def get_queryset(self):
        return Contribution.objects.filter(member=self.request.user)
