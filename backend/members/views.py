from django.db import transaction
from rest_framework import generics
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from rest_framework.views import APIView

from .models import ChurchBudget, ChurchFinancialReport, ChurchSettings, Contribution, PrayerRequest, SabbathEvent
from .mpesa import MpesaConfigurationError, initiate_stk_push
from .serializers import ChurchBudgetSerializer, ChurchFinancialReportSerializer, ChurchSettingsSerializer, ContributionInitiateSerializer, ContributionSerializer, PrayerRequestSerializer, RegisterSerializer, SabbathEventSerializer


class RegisterView(generics.CreateAPIView):
    permission_classes = [AllowAny]
    serializer_class = RegisterSerializer


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile = getattr(request.user, 'member_profile', None)
        return Response({'id': request.user.id, 'username': request.user.username, 'email': request.user.email, 'first_name': request.user.first_name, 'last_name': request.user.last_name, 'phone_number': profile.phone_number if profile else '', 'role': profile.role if profile else 'member'})


class MyContributionsView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ContributionSerializer

    def get_queryset(self):
        return Contribution.objects.filter(member=self.request.user)


class InitiateContributionView(APIView):
    permission_classes = [AllowAny]

    @transaction.atomic
    def post(self, request):
        serializer = ContributionInitiateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        contribution = Contribution.objects.create(
            member=request.user if request.user.is_authenticated else None,
            amount=serializer.validated_data['amount'],
            giving_type=serializer.validated_data['giving_type'],
            purpose=serializer.validated_data['purpose'],
            phone_number=serializer.validated_data['phone_number'],
            donor_name=serializer.validated_data.get('donor_name', ''),
            donor_email=serializer.validated_data.get('donor_email', ''),
            item_description=serializer.validated_data.get('item_description', ''),
        )
        if contribution.giving_type == 'in_kind':
            return Response({'message': 'Thank you. The church will contact you about delivering this gift.', 'contribution_id': str(contribution.id)}, status=status.HTTP_201_CREATED)
        try:
            result = initiate_stk_push(contribution)
        except MpesaConfigurationError as error:
            contribution.delete()
            return Response({'detail': str(error)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except ValueError as error:
            contribution.delete()
            return Response({'detail': str(error)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            contribution.status = 'failed'
            contribution.save(update_fields=['status'])
            return Response({'detail': 'The payment request could not be started.'}, status=status.HTTP_502_BAD_GATEWAY)

        contribution.checkout_request_id = result['CheckoutRequestID']
        contribution.merchant_request_id = result.get('MerchantRequestID', '')
        contribution.save(update_fields=['checkout_request_id', 'merchant_request_id'])
        return Response({'message': result.get('CustomerMessage', 'Check your phone to complete the payment.'), 'contribution_id': str(contribution.id)}, status=status.HTTP_201_CREATED)


class MpesaCallbackView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        callback = request.data.get('Body', {}).get('stkCallback', {})
        checkout_request_id = callback.get('CheckoutRequestID')
        contribution = Contribution.objects.filter(checkout_request_id=checkout_request_id).first()
        if not contribution:
            return Response({'ResultCode': 0, 'ResultDesc': 'Accepted'})

        result_code = callback.get('ResultCode')
        if result_code == 0:
            metadata = {item.get('Name'): item.get('Value') for item in callback.get('CallbackMetadata', {}).get('Item', [])}
            from django.utils import timezone
            contribution.status = 'completed'
            contribution.mpesa_receipt_number = metadata.get('MpesaReceiptNumber')
            contribution.phone_number = str(metadata.get('PhoneNumber', contribution.phone_number))
            contribution.paid_at = timezone.now()
        else:
            contribution.status = 'failed'
        contribution.save()
        return Response({'ResultCode': 0, 'ResultDesc': 'Accepted'})


class PrayerRequestView(generics.CreateAPIView):
    permission_classes = [AllowAny]
    serializer_class = PrayerRequestSerializer


class ChurchFinancialReportsView(generics.ListAPIView):
    permission_classes = [AllowAny]
    serializer_class = ChurchFinancialReportSerializer

    def get_queryset(self):
        profile = getattr(self.request.user, 'member_profile', None)
        if profile and profile.role in ('leader', 'admin', 'finance'):
            return ChurchFinancialReport.objects.all()
        return ChurchFinancialReport.objects.filter(published_to_members=True)


class ChurchBudgetsView(generics.ListAPIView):
    permission_classes = [AllowAny]
    serializer_class = ChurchBudgetSerializer

    def get_queryset(self):
        profile = getattr(self.request.user, 'member_profile', None)
        if profile and profile.role in ('leader', 'admin', 'finance'):
            return ChurchBudget.objects.all()
        return ChurchBudget.objects.filter(published_to_public=True)


class SabbathEventsView(generics.ListAPIView):
    permission_classes = [AllowAny]
    serializer_class = SabbathEventSerializer

    def get_queryset(self):
        return SabbathEvent.objects.filter(published=True)


class ChurchSettingsView(generics.RetrieveAPIView):
    serializer_class = ChurchSettingsSerializer
    permission_classes = [AllowAny]

    def get_object(self):
        settings, _ = ChurchSettings.objects.get_or_create(pk=1)
        return settings
