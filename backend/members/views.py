from django.conf import settings
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone
from datetime import timedelta
import uuid
from rest_framework import generics
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from rest_framework.views import APIView

from .models import Announcement, BoardMeeting, ChildDedicationRequest, ChurchBudget, ChurchCorrespondence, ChurchFinancialReport, ChurchNotification, ChurchSettings, Contribution, EnrollmentRequest, GivingPurpose, MembershipTransferRequest, PrayerRequest, SabbathEvent, Testimony, VisitationRequest
from .mpesa import MpesaConfigurationError, initiate_stk_push
from .serializers import AnnouncementSerializer, BoardMeetingSerializer, ChildDedicationRequestSerializer, ChurchBudgetSerializer, ChurchCorrespondenceSerializer, ChurchFinancialReportSerializer, ChurchNotificationSerializer, ChurchSettingsSerializer, ContributionInitiateSerializer, ContributionSerializer, EnrollmentCompleteSerializer, EnrollmentRequestSerializer, GivingPurposeSerializer, MembershipTransferRequestSerializer, PrayerRequestSerializer, RegisterSerializer, SabbathEventSerializer, TestimonySerializer, UserDetailSerializer, VisitationRequestSerializer


def send_enrollment_email(enrollment):
    link = f"{settings.FRONTEND_URL}/enroll/confirm?token={enrollment.token}"
    send_mail('Complete your Loma Linda Church member account', f"Hello {enrollment.first_name or 'there'},\n\nComplete your member account here:\n{link}\n\nThis link expires in 48 hours.", settings.DEFAULT_FROM_EMAIL, [enrollment.email], fail_silently=False)


def send_password_reset_email(user, uid, token):
    link = f"{settings.FRONTEND_URL}/reset-password?uid={uid}&token={token}"
    send_mail('Reset your Loma Linda Church password', f"Hello {user.first_name or user.username},\n\nReset your password here:\n{link}\n\nIf you did not request this, you can ignore this email.", settings.DEFAULT_FROM_EMAIL, [user.email], fail_silently=False)


def is_finance_manager(user):
    profile = getattr(user, 'member_profile', None)
    return bool(profile and profile.role in ('admin', 'leader', 'finance', 'treasurer'))


class RegisterView(generics.CreateAPIView):
    permission_classes = [AllowAny]
    serializer_class = RegisterSerializer


class EnrollmentRequestView(generics.CreateAPIView):
    permission_classes = [AllowAny]
    serializer_class = EnrollmentRequestSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        enrollment, _ = EnrollmentRequest.objects.update_or_create(email=serializer.validated_data['email'], defaults={**serializer.validated_data, 'token': uuid.uuid4(), 'status': 'pending', 'expires_at': timezone.now() + timedelta(hours=48)})
        send_enrollment_email(enrollment)
        return Response({'message': 'If that email can receive member invitations, an enrollment link has been sent.'}, status=status.HTTP_202_ACCEPTED)


class EnrollmentVerifyView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        enrollment = EnrollmentRequest.objects.filter(token=request.query_params.get('token'), status='pending', expires_at__gt=timezone.now()).first()
        if not enrollment:
            return Response({'detail': 'This enrollment link is invalid or expired.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'email': enrollment.email, 'first_name': enrollment.first_name, 'last_name': enrollment.last_name})


class EnrollmentCompleteView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = EnrollmentCompleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        enrollment = EnrollmentRequest.objects.filter(token=serializer.validated_data['token'], status='pending', expires_at__gt=timezone.now()).first()
        if not enrollment:
            return Response({'detail': 'This enrollment link is invalid or expired.'}, status=status.HTTP_400_BAD_REQUEST)
        if User.objects.filter(username=serializer.validated_data['username']).exists():
            return Response({'username': 'That username is already in use.'}, status=status.HTTP_400_BAD_REQUEST)
        if User.objects.filter(email__iexact=enrollment.email).exists():
            return Response({'email': 'An account already exists for this email.'}, status=status.HTTP_400_BAD_REQUEST)
        user = User.objects.create_user(username=serializer.validated_data['username'], email=enrollment.email, first_name=enrollment.first_name, last_name=enrollment.last_name, password=serializer.validated_data['password'])
        from .models import MemberProfile
        MemberProfile.objects.create(user=user, phone_number=enrollment.phone_number)
        enrollment.status = 'completed'
        enrollment.save(update_fields=['status'])
        return Response({'message': 'Your account is ready. You can now sign in.'}, status=status.HTTP_201_CREATED)


class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get('email', '').strip()
        user = User.objects.filter(email__iexact=email, is_active=True).first()
        if user:
            send_password_reset_email(user, user.pk, default_token_generator.make_token(user))
        return Response({'message': 'If an account exists for that email, a password reset link has been sent.'})


class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        user = User.objects.filter(pk=request.data.get('uid'), is_active=True).first()
        token = request.data.get('token')
        if not user or not default_token_generator.check_token(user, token):
            return Response({'detail': 'This password reset link is invalid or expired.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_password(request.data.get('password', ''), user)
        except Exception as error:
            return Response({'password': list(error.messages)}, status=status.HTTP_400_BAD_REQUEST)
        user.set_password(request.data['password'])
        user.save(update_fields=['password'])
        return Response({'message': 'Your password has been reset. You can now sign in.'})


class AnnouncementView(generics.ListCreateAPIView):
    serializer_class = AnnouncementSerializer

    def get_permissions(self):
        return [IsAuthenticated()] if self.request.method == 'POST' else [AllowAny()]

    def get_queryset(self):
        from django.db.models import Q
        from django.utils import timezone
        today = timezone.now().date()
        queryset = Announcement.objects.filter(published=True).filter(
            Q(expires_at__isnull=True) | Q(expires_at__gte=today)
        )
        if self.request.user.is_authenticated:
            return queryset
        return queryset.filter(visibility='public')

    def perform_create(self, serializer):
        if getattr(getattr(self.request.user, 'member_profile', None), 'role', '') not in ('admin', 'leader'):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only church leaders can post announcements.')
        serializer.save()


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


class ChildDedicationRequestView(generics.CreateAPIView):
    queryset = ChildDedicationRequest.objects.all()
    serializer_class = ChildDedicationRequestSerializer
    permission_classes = [AllowAny]


class TestimonyView(generics.ListCreateAPIView):
    serializer_class = TestimonySerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        return Testimony.objects.filter(status='approved')

    def perform_create(self, serializer):
        user = self.request.user if self.request.user.is_authenticated else None
        name = serializer.validated_data.get('name', '')
        if user and not name:
            name = f"{user.first_name} {user.last_name}".strip() or user.username
        serializer.save(user=user, name=name, status='pending_review')


class ChurchFinancialReportsView(generics.ListAPIView):
    permission_classes = [AllowAny]
    serializer_class = ChurchFinancialReportSerializer

    def get_queryset(self):
        user = self.request.user if self.request.user.is_authenticated else None
        profile = getattr(user, 'member_profile', None) if user else None
        if profile and profile.role in ('leader', 'admin', 'finance'):
            return ChurchFinancialReport.objects.all()
        return ChurchFinancialReport.objects.filter(published_to_members=True)


class ChurchBudgetsView(generics.ListAPIView):
    permission_classes = [AllowAny]
    serializer_class = ChurchBudgetSerializer

    def get_queryset(self):
        return ChurchBudget.objects.all()


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


class GivingPurposeListCreateView(generics.ListCreateAPIView):
    serializer_class = GivingPurposeSerializer

    def get_permissions(self):
        return [IsAuthenticated()] if self.request.method == 'POST' else [AllowAny()]

    def get_queryset(self):
        return GivingPurpose.objects.filter(active=True)

    def perform_create(self, serializer):
        if not is_finance_manager(self.request.user):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only finance managers can add giving purposes.')
        serializer.save()


class GivingPurposeDetailView(generics.DestroyAPIView):
    serializer_class = GivingPurposeSerializer
    queryset = GivingPurpose.objects.all()

    def perform_destroy(self, instance):
        if not is_finance_manager(self.request.user):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only finance managers can remove giving purposes.')
        instance.active = False
        instance.save(update_fields=['active'])


class CurrentMemberView(generics.RetrieveAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = UserDetailSerializer

    def get_object(self):
        return self.request.user


class MembershipTransferRequestView(generics.ListCreateAPIView):
    permission_classes = [AllowAny]
    serializer_class = MembershipTransferRequestSerializer

    def get_queryset(self):
        return MembershipTransferRequest.objects.all()


class ChurchCorrespondenceView(generics.ListCreateAPIView):
    permission_classes = [AllowAny]
    serializer_class = ChurchCorrespondenceSerializer

    def get_queryset(self):
        return ChurchCorrespondence.objects.all()


class BoardMeetingView(generics.ListCreateAPIView):
    permission_classes = [AllowAny]
    serializer_class = BoardMeetingSerializer

    def get_queryset(self):
        return BoardMeeting.objects.all()


class ChurchNotificationView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ChurchNotificationSerializer

    def get_queryset(self):
        return ChurchNotification.objects.filter(user=self.request.user)


class VisitationRequestView(generics.ListCreateAPIView):
    permission_classes = [AllowAny]
    serializer_class = VisitationRequestSerializer

    def get_queryset(self):
        return VisitationRequest.objects.all()
