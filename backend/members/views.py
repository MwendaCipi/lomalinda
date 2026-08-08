from django.conf import settings
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.core.validators import validate_email
from django.http import HttpResponseRedirect
from django.db import transaction
from django.utils import timezone
from datetime import datetime, timedelta
import uuid
import re
import json
import time
from decimal import Decimal
from html.parser import HTMLParser
from urllib.parse import urljoin
import requests
from rest_framework import generics
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from rest_framework.views import APIView

from .models import Announcement, BoardMeeting, ChildDedicationRequest, ChurchBudget, ChurchCorrespondence, ChurchFinancialReport, ChurchNotification, ChurchSettings, Contribution, EnrollmentRequest, ExternalResourceLink, Friend, GivingPurpose, MembershipTransferRequest, PendingTestimony, PrayerRequest, SabbathEvent, Testimony, VisitationRequest
from .mpesa import MpesaConfigurationError, initiate_stk_push
from .paystack import PaystackConfigurationError, initialize_checkout, parse_webhook, verify_webhook_signature
from .serializers import AnnouncementSerializer, BoardMeetingSerializer, ChildDedicationRequestSerializer, ChurchBudgetSerializer, ChurchCorrespondenceSerializer, ChurchFinancialReportSerializer, ChurchNotificationSerializer, ChurchSettingsSerializer, ContributionInitiateSerializer, ContributionSerializer, EnrollmentCompleteSerializer, EnrollmentRequestSerializer, GivingPurposeSerializer, MembershipTransferRequestSerializer, PrayerRequestSerializer, RegisterSerializer, SabbathEventSerializer, TestimonySerializer, UserDetailSerializer, VisitationRequestSerializer


def send_enrollment_email(enrollment):
    link = f"{settings.FRONTEND_URL}/enroll/confirm?token={enrollment.token}"
    account_label = 'friend account' if enrollment.joining_mode == 'friend' else 'church account'
    send_mail('Complete your Loma Linda Church account', f"Hello {enrollment.first_name or 'there'},\n\nYour request for a Loma Linda Church {account_label} has been approved. Complete your account here:\n{link}\n\nThis link expires in 48 hours.", settings.DEFAULT_FROM_EMAIL, [enrollment.email], fail_silently=False)


def send_password_reset_email(user, uid, token):
    link = f"{settings.FRONTEND_URL}/reset-password?uid={uid}&token={token}"
    send_mail('Reset your Loma Linda Church password', f"Hello {user.first_name or user.username},\n\nReset your password here:\n{link}\n\nIf you did not request this, you can ignore this email.", settings.DEFAULT_FROM_EMAIL, [user.email], fail_silently=False)


def send_contribution_receipt(contribution):
    if not contribution.donor_email or contribution.receipt_sent_at or contribution.status != 'completed':
        return

    local_now = timezone.localtime()
    if local_now.weekday() == 5:
        greeting = 'Happy Sabbath'
    elif local_now.hour < 12:
        greeting = 'Good morning'
    elif local_now.hour < 18:
        greeting = 'Good afternoon'
    else:
        greeting = 'Good evening'

    receipt_reference = contribution.mpesa_receipt_number or contribution.paystack_reference or str(contribution.id)
    donor_name = contribution.donor_name.strip() if contribution.donor_name else 'friend'
    body = (
        f"{greeting} {donor_name},\n\n"
        f"Thank you for giving towards {contribution.purpose}. Here is your receipt for the gift received by SDA Church Loma Linda, Meru.\n\n"
        f"Amount: {contribution.currency} {contribution.amount:,.2f}\n"
        f"Giving purpose: {contribution.purpose}\n"
        f"Payment method: {contribution.get_payment_method_display()}\n"
        f"Receipt reference: {receipt_reference}\n"
        f"Date received: {timezone.localtime(contribution.paid_at or local_now).strftime('%d %B %Y, %H:%M')}\n\n"
        "May God bless you for supporting the work of the church."
    )
    try:
        send_mail(
            f"Giving receipt — {contribution.purpose}",
            body,
            settings.DEFAULT_FROM_EMAIL,
            [contribution.donor_email],
            fail_silently=False,
        )
    except Exception:
        return
    contribution.receipt_sent_at = timezone.now()
    contribution.save(update_fields=['receipt_sent_at'])


def is_finance_manager(user):
    profile = getattr(user, 'member_profile', None)
    return bool(profile and profile.role in ('admin', 'leader', 'finance', 'treasurer'))


MISSION_READING_SOURCES = {
    'children': 'https://adventistmission.org/mission-awareness/mission-quarterlies/children/articles/',
    'adults': 'https://adventistmission.org/mission-awareness/mission-quarterlies/youth-and-adult/articles',
}
SSNET_SOURCE = 'https://ssnet.org/'
SSNET_WEEKLY_LESSON_URL = 'https://ssnet.org/lessons/current.html'
ADULT_LESSON_SOURCE = SSNET_SOURCE
CHILDREN_LESSON_SOURCES = {
    'beginner': 'https://beginner.aliveinjesus.info/students',
    'kindergarten': 'https://kindergarten.aliveinjesus.info/students',
    'primary': 'https://primary.aliveinjesus.info/students',
    'junior': 'https://www.juniorpowerpoints.org/page2447',
    'teens': 'https://www.cornerstoneconnections.net/lessons',
}


class _MissionLinkParser(HTMLParser):
    def __init__(self, source_url, path_fragment):
        super().__init__()
        self.source_url = source_url
        self.path_fragment = path_fragment
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag != 'a':
            return
        href = dict(attrs).get('href', '')
        if not href or href.startswith('#'):
            return
        url = urljoin(self.source_url, href)
        is_article_path = self.path_fragment in url and re.search(r'/articles/[^/?#]+/?$', url) is not None
        if is_article_path and url.rstrip('/') != self.source_url.rstrip('/') and url not in self.links:
            self.links.append(url)


class _WeeklyLessonParser(HTMLParser):
    def __init__(self, source_url):
        super().__init__()
        self.source_url = source_url
        self.current_href = None
        self.current_text = []
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag == 'a':
            self.current_href = dict(attrs).get('href', '')
            self.current_text = []

    def handle_data(self, data):
        if self.current_href is not None:
            self.current_text.append(data)

    def handle_endtag(self, tag):
        if tag != 'a' or not self.current_href:
            return
        text = ' '.join(''.join(self.current_text).split())
        match = re.search(r'Lesson\s+(\d{1,2})\s+-\s+([A-Za-z]+\s+\d{1,2})', text, flags=re.IGNORECASE)
        href = urljoin(self.source_url, self.current_href)
        if match and re.search(r'/assets/(juniors|teens)/Lessons/\d{4}/Q\d/English/(Student|Teacher)/', href):
            year_match = re.search(r'/Lessons/(\d{4})/Q(\d)/', href)
            self.links.append({
                'number': int(match.group(1)),
                'date': datetime.strptime(f"{year_match.group(1)} {match.group(2)}", '%Y %B %d').date(),
                'audience': 'teachers' if '/Teacher/' in href else 'students',
                'url': href,
            })
        self.current_href = None
        self.current_text = []


class _SsnetQuarterParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.current_href = None
        self.current_text = []
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag == 'a':
            self.current_href = dict(attrs).get('href', '')
            self.current_text = []

    def handle_data(self, data):
        if self.current_href is not None:
            self.current_text.append(data)

    def handle_endtag(self, tag):
        if tag != 'a' or not self.current_href:
            return
        href = urljoin(SSNET_SOURCE, self.current_href)
        text = ' '.join(''.join(self.current_text).split())
        if re.search(r'/lessons/\d{2}[a-d]/?$', href) or re.search(r'20\d{2}\s+Q[1-4]', text, flags=re.IGNORECASE):
            self.links.append({'url': href, 'text': text})
        self.current_href = None
        self.current_text = []


class _SsnetLessonParser(HTMLParser):
    def __init__(self, source_url):
        super().__init__()
        self.source_url = source_url
        self.current_href = None
        self.current_text = []
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag == 'a':
            self.current_href = dict(attrs).get('href', '')
            self.current_text = []

    def handle_data(self, data):
        if self.current_href is not None:
            self.current_text.append(data)

    def handle_endtag(self, tag):
        if tag != 'a' or not self.current_href:
            return
        href = urljoin(self.source_url, self.current_href)
        text = ' '.join(''.join(self.current_text).split())
        lesson_match = re.search(r'/less(\d{2})\.html$', href)
        if lesson_match:
            self.links.append({'number': int(lesson_match.group(1)), 'url': href, 'text': text})
        teacher_match = re.search(r'/helps/lesshp(\d+)\.html$', href)
        if teacher_match:
            self.links.append({'number': int(teacher_match.group(1)), 'url': href, 'text': text, 'teacher': True})
        self.current_href = None
        self.current_text = []


def current_ssnet_quarter_url():
    response = _get_with_retries(SSNET_SOURCE)
    parser = _SsnetQuarterParser()
    parser.feed(response.text)
    today = timezone.localdate()
    current = next((link['url'] for link in parser.links if re.search(rf'{today.year}\s+Q{((today.month - 1) // 3) + 1}', link['text'], flags=re.IGNORECASE)), None)
    return current or (parser.links[-1]['url'] if parser.links else SSNET_SOURCE)


def _current_ssnet_lesson_urls():
    quarter_url = current_ssnet_quarter_url()
    response = _get_with_retries(quarter_url)
    parser = _SsnetLessonParser(quarter_url)
    parser.feed(response.text)
    lessons = [link for link in parser.links if not link.get('teacher')]
    if not lessons:
        return quarter_url, quarter_url
    today = timezone.localdate()
    quarter_start = today.replace(month=((today.month - 1) // 3) * 3 + 1, day=1)
    first_sabbath = quarter_start - timedelta(days=(quarter_start.weekday() - 5) % 7)
    current_number = min(max(((today - first_sabbath).days // 7) + 1, 1), 13)
    lesson = next((item for item in lessons if item['number'] == current_number), lessons[-1])
    lesson_page = _get_with_retries(lesson['url'])
    lesson_parser = _SsnetLessonParser(lesson['url'])
    lesson_parser.feed(lesson_page.text)
    teacher = next((item for item in lesson_parser.links if item.get('teacher') and item['number'] == lesson['number']), None)
    return lesson['url'], teacher['url'] if teacher else quarter_url


def first_mission_story_url(audience):
    source_url = MISSION_READING_SOURCES[audience]
    path_fragment = '/children/' if audience == 'children' else '/youth-and-adult/'
    response = _get_with_retries(source_url)
    response.raise_for_status()
    parser = _MissionLinkParser(source_url, path_fragment)
    parser.feed(response.text)
    if not parser.links:
        return source_url
    # The current Adventist Mission page places the adult weekly article
    # after one introductory article, while the children's weekly article is first.
    return parser.links[1] if audience == 'adults' and len(parser.links) > 1 else parser.links[0]


def _get_with_retries(url, attempts=3):
    headers = {'User-Agent': 'LomaLindaChurch/1.0'}
    for attempt in range(attempts):
        try:
            response = requests.get(url, headers=headers, timeout=12)
            if response.status_code not in (429, 500, 502, 503, 504):
                response.raise_for_status()
                return response
            if attempt == attempts - 1:
                response.raise_for_status()
            retry_after = response.headers.get('Retry-After')
            delay = min(int(retry_after), 60) if retry_after and retry_after.isdigit() else 5 * (attempt + 1)
        except requests.RequestException:
            if attempt == attempts - 1:
                raise
            delay = 5 * (attempt + 1)
        time.sleep(delay)


def cached_resource_url(key):
    link = ExternalResourceLink.objects.filter(key=key).first()
    return link.url if link and link.resolved_at >= timezone.now() - timedelta(days=8) else None


def save_resource_url(key, url):
    ExternalResourceLink.objects.update_or_create(key=key, defaults={'url': url, 'resolved_at': timezone.now()})
    return url


def current_adult_lesson_url():
    return SSNET_WEEKLY_LESSON_URL


def current_adult_pdf_url(kind):
    lesson_url = current_adult_lesson_url()
    page = _get_with_retries(lesson_url)
    pdfs = [urljoin(lesson_url, href) for href in re.findall(r'href=["\']([^"\']+\.pdf)["\']', page.text, flags=re.IGNORECASE)]
    marker = 'EAQ' if kind == 'lesson' else 'ETQ'
    return next((url for url in pdfs if marker in url), ADULT_LESSON_SOURCE)


def first_children_lesson_url(division, audience):
    source_url = CHILDREN_LESSON_SOURCES[division]
    page = _get_with_retries(source_url)
    if division in ('junior', 'teens'):
        parser = _WeeklyLessonParser(source_url)
        parser.feed(page.text)
        lessons = [link for link in parser.links if link['audience'] == audience]
        if not lessons:
            return source_url
        today = timezone.localdate()
        upcoming = [lesson for lesson in lessons if lesson['date'] >= today]
        target_date = min(upcoming, key=lambda lesson: lesson['date'])['date'] if upcoming else max(lessons, key=lambda lesson: lesson['date'])['date']
        target = next(lesson for lesson in lessons if lesson['date'] == target_date)
        return target['url']
    script_urls = re.findall(r'<script[^>]+src="([^"]+)"', page.text)
    today = timezone.localdate()
    quarter_start = today.replace(month=((today.month - 1) // 3) * 3 + 1, day=1)
    current_week = min(max(((today - quarter_start).days // 7) + 1, 1), 13)
    target_host = urljoin(source_url, '/').split('//', 1)[1].split('.', 1)[0]
    target_host = f'app.{target_host}.aliveinjesus.info'
    pattern = re.compile(rf'https://{re.escape(target_host)}/resources/en/aij/(\d{{4}})-(\d{{2}})-([^/]+)/{current_week:02d}(?:"|,)')
    candidates = []
    for script_url in script_urls:
        script = _get_with_retries(urljoin(source_url, script_url))
        candidates.extend(match.group(0)[:-1] for match in pattern.finditer(script.text))
    if not candidates:
        return source_url.replace('/students', f'/{audience}')
    destination = sorted(set(candidates), key=lambda url: tuple(map(int, re.search(r'/aij/(\d{4})-(\d{2})-', url).groups())), reverse=True)[0]
    if audience == 'teachers':
        destination = re.sub(r'-(bg|kd|pr|jr)/(?=\d{2}$)', r'-\1-tg/', destination)
    return destination


class RegisterView(generics.CreateAPIView):
    permission_classes = [AllowAny]
    serializer_class = RegisterSerializer


class EnrollmentRequestView(generics.CreateAPIView):
    permission_classes = [AllowAny]
    serializer_class = EnrollmentRequestSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated_data = {key: value for key, value in serializer.validated_data.items() if key != 'privacy_accepted'}
        validated_data['privacy_accepted_at'] = timezone.now()
        EnrollmentRequest.objects.update_or_create(email=validated_data['email'], defaults={**validated_data, 'token': uuid.uuid4(), 'status': 'pending', 'expires_at': timezone.now() + timedelta(hours=48)})
        return Response({'message': 'Your request has been submitted for approval. We will email you when it is approved.'}, status=status.HTTP_202_ACCEPTED)


class EnrollmentVerifyView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        enrollment = EnrollmentRequest.objects.filter(token=request.query_params.get('token'), status='approved', expires_at__gt=timezone.now()).first()
        if not enrollment:
            return Response({'detail': 'This enrollment link is invalid or expired.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'email': enrollment.email, 'first_name': enrollment.first_name, 'last_name': enrollment.last_name, 'joining_mode': enrollment.joining_mode})


class EnrollmentCompleteView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = EnrollmentCompleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        enrollment = EnrollmentRequest.objects.filter(token=serializer.validated_data['token'], status='approved', expires_at__gt=timezone.now()).first()
        if not enrollment:
            return Response({'detail': 'This enrollment link is invalid or expired.'}, status=status.HTTP_400_BAD_REQUEST)
        if User.objects.filter(username=serializer.validated_data['username']).exists():
            return Response({'username': 'That username is already in use.'}, status=status.HTTP_400_BAD_REQUEST)
        if User.objects.filter(email__iexact=enrollment.email).exists():
            return Response({'email': 'An account already exists for this email.'}, status=status.HTTP_400_BAD_REQUEST)
        user = User.objects.create_user(username=serializer.validated_data['username'], email=enrollment.email, first_name=enrollment.first_name, last_name=enrollment.last_name, password=serializer.validated_data['password'])
        from .models import MemberProfile
        MemberProfile.objects.create(user=user, phone_number=enrollment.phone_number, account_type='friend' if enrollment.joining_mode == 'friend' else 'member')
        enrollment.status = 'completed'
        enrollment.privacy_accepted_at = timezone.now()
        enrollment.save(update_fields=['status', 'privacy_accepted_at'])
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
        queryset = Announcement.objects.filter(published=True)
        if self.request.query_params.get('include_expired') != 'true':
            queryset = queryset.filter(Q(expires_at__isnull=True) | Q(expires_at__gte=today))
        search = self.request.query_params.get('search', '').strip()
        if search:
            queryset = queryset.filter(Q(title__icontains=search) | Q(text__icontains=search) | Q(detail__icontains=search))
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')
        if start_date:
            queryset = queryset.filter(created_at__date__gte=start_date)
        if end_date:
            queryset = queryset.filter(created_at__date__lte=end_date)
        if self.request.user.is_authenticated:
            return queryset
        return queryset.filter(visibility='public')

    def perform_create(self, serializer):
        if getattr(getattr(self.request.user, 'member_profile', None), 'role', '') not in ('admin', 'leader'):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only church leaders can post announcements.')
        serializer.save()


class MissionReadingRedirectView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, audience):
        if audience not in MISSION_READING_SOURCES:
            return HttpResponseRedirect(MISSION_READING_SOURCES['children'])
        key = f'mission_{audience}'
        destination = cached_resource_url(key)
        if destination and not re.search(rf'/mission-quarterlies/{"children" if audience == "children" else "youth-and-adult"}/articles/[^/?#]+/?$', destination):
            destination = None
        try:
            destination = destination or save_resource_url(key, first_mission_story_url(audience))
        except requests.RequestException:
            destination = MISSION_READING_SOURCES[audience]
        return HttpResponseRedirect(destination)


class AdultLessonRedirectView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        destination = cached_resource_url('adult_lesson')
        if destination and destination.startswith('https://sabbath.school'):
            destination = None
        try:
            destination = destination or save_resource_url('adult_lesson', current_adult_lesson_url())
        except requests.RequestException:
            destination = SSNET_WEEKLY_LESSON_URL
        return HttpResponseRedirect(destination)


class AdultLessonPdfRedirectView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, kind):
        if kind not in ('lesson', 'teachers'):
            return HttpResponseRedirect(ADULT_LESSON_SOURCE)
        key = f'adult_pdf_{kind}'
        destination = cached_resource_url(key)
        try:
            destination = destination or save_resource_url(key, current_adult_pdf_url(kind))
        except requests.RequestException:
            destination = ADULT_LESSON_SOURCE
        return HttpResponseRedirect(destination)


class ChildrenLessonRedirectView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, division, audience):
        if division not in CHILDREN_LESSON_SOURCES or audience not in ('students', 'teachers'):
            return HttpResponseRedirect(CHILDREN_LESSON_SOURCES.get(division, CHILDREN_LESSON_SOURCES['primary']))
        key = f'children_{division}_{audience}'
        destination = cached_resource_url(key)
        try:
            destination = destination or save_resource_url(key, first_children_lesson_url(division, audience))
        except requests.RequestException:
            destination = CHILDREN_LESSON_SOURCES[division].replace('/students', f'/{audience}')
        return HttpResponseRedirect(destination)


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
            payment_method=serializer.validated_data.get('payment_method', 'mpesa'),
        )
        donor_email = contribution.donor_email.strip().lower()
        if donor_email:
            friend = Friend.objects.filter(email__iexact=donor_email).first()
            if friend:
                friend.name = contribution.donor_name or friend.name
                friend.phone_number = contribution.phone_number or friend.phone_number
                friend.save(update_fields=['name', 'phone_number', 'updated_at'])
            else:
                Friend.objects.create(email=donor_email, name=contribution.donor_name, phone_number=contribution.phone_number)
        if contribution.giving_type == 'in_kind':
            return Response({'message': 'Thank you. The church will contact you about delivering this gift.', 'contribution_id': str(contribution.id)}, status=status.HTTP_201_CREATED)
        if contribution.payment_method == 'card':
            try:
                result = initialize_checkout(contribution)
            except PaystackConfigurationError as error:
                contribution.delete()
                return Response({'detail': str(error)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
            except ValueError as error:
                contribution.delete()
                return Response({'detail': str(error)}, status=status.HTTP_400_BAD_REQUEST)
            except Exception:
                contribution.status = 'failed'
                contribution.save(update_fields=['status'])
                return Response({'detail': 'The card checkout could not be started.'}, status=status.HTTP_502_BAD_GATEWAY)
            contribution.paystack_reference = result['reference']
            contribution.save(update_fields=['paystack_reference'])
            return Response({'message': 'Continue to secure card checkout.', 'checkout_url': result['authorization_url'], 'contribution_id': str(contribution.id)}, status=status.HTTP_201_CREATED)
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
        send_contribution_receipt(contribution)
        return Response({'ResultCode': 0, 'ResultDesc': 'Accepted'})


class PaystackWebhookView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        try:
            if not verify_webhook_signature(request.body, request.headers.get('X-Paystack-Signature', '')):
                return Response({'detail': 'Invalid webhook signature.'}, status=status.HTTP_400_BAD_REQUEST)
            event = parse_webhook(request.body)
        except (PaystackConfigurationError, ValueError, TypeError, json.JSONDecodeError):
            return Response({'detail': 'Invalid Paystack webhook.'}, status=status.HTTP_400_BAD_REQUEST)

        event_type = event.get('type')
        payment = event.get('data', {})
        contribution_id = payment.get('metadata', {}).get('contribution_id')
        contribution = Contribution.objects.filter(id=contribution_id, paystack_reference=payment.get('reference')).first()
        if not contribution:
            return Response({'received': True})
        expected_amount = int(Decimal(contribution.amount) * 100)
        if event_type == 'charge.success' and payment.get('status') and payment.get('amount') == expected_amount and payment.get('currency') == contribution.currency:
            contribution.status = 'completed'
            contribution.paid_at = timezone.now()
        elif event_type in ('charge.failed', 'transfer.failed'):
            contribution.status = 'failed'
        contribution.save(update_fields=['status', 'paid_at'])
        send_contribution_receipt(contribution)
        return Response({'received': True})


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
        if not user and self.request.data.get('request_type') != 'fellowship':
            raise PermissionDenied('Please sign in before sharing a testimony.')
        name = serializer.validated_data.get('name', '')
        if user and not name:
            name = f"{user.first_name} {user.last_name}".strip() or user.username
        serializer.save(user=user, email=user.email if user else '', name=name, status='approved' if user and self.request.data.get('request_type') != 'fellowship' else 'pending_review')


def send_testimony_verification_email(pending):
    link = f"{settings.FRONTEND_URL}/community/testimonies?token={pending.token}"
    send_mail(
        'Confirm your testimony submission',
        f"Hello {pending.name or 'there'},\n\nConfirm your email and continue sharing your testimony with Loma Linda Church:\n{link}\n\nThis link expires in 30 minutes.",
        settings.DEFAULT_FROM_EMAIL,
        [pending.email],
        fail_silently=False,
    )


class TestimonyVerificationStartView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        email = str(request.data.get('email', '')).strip().lower()
        try:
            validate_email(email)
        except Exception:
            return Response({'email': 'Enter a valid email address.'}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.filter(email__iexact=email, is_active=True).first()
        friend = Friend.objects.filter(email__iexact=email).first()
        name = friend.name if friend and friend.name else (f"{user.first_name} {user.last_name}".strip() if user else '')
        pending = PendingTestimony.objects.create(email=email, name=name)
        try:
            send_testimony_verification_email(pending)
        except Exception:
            pending.delete()
            return Response({'detail': 'The confirmation email could not be sent.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response({'message': 'If the email can receive messages, a confirmation link has been sent.'}, status=status.HTTP_202_ACCEPTED)


class TestimonyVerificationView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def _pending(self, token):
        pending = PendingTestimony.objects.filter(token=token, status='verification_sent', created_at__gt=timezone.now() - timedelta(minutes=30)).first()
        if not pending:
            raise ValueError('This confirmation link is invalid or expired.')
        return pending

    def get(self, request):
        try:
            pending = self._pending(request.query_params.get('token'))
        except ValueError as error:
            return Response({'detail': str(error)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'name': pending.name, 'requires_name': not bool(pending.name)})

    def post(self, request):
        try:
            pending = self._pending(request.data.get('token'))
        except ValueError as error:
            return Response({'detail': str(error)}, status=status.HTTP_400_BAD_REQUEST)
        name = str(request.data.get('name', '')).strip() or pending.name
        testimony_text = str(request.data.get('testimony_text', '')).strip()
        if not name:
            return Response({'name': 'Enter your name.'}, status=status.HTTP_400_BAD_REQUEST)
        if not testimony_text:
            return Response({'testimony_text': 'Enter your testimony.'}, status=status.HTTP_400_BAD_REQUEST)
        pending.name = name
        pending.testimony_text = testimony_text
        pending.status = 'pending_review'
        pending.verified_at = timezone.now()
        pending.save(update_fields=['name', 'testimony_text', 'status', 'verified_at'])
        return Response({'message': 'Your testimony has been submitted for review.'}, status=status.HTTP_201_CREATED)


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
