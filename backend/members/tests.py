from datetime import date
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase

from .views import CHILDREN_LESSON_SOURCES, _WeeklyLessonParser, first_children_lesson_url


class WeeklyLessonParserTests(TestCase):
    def test_parses_student_and_teacher_lessons_for_both_age_groups(self):
        html = '''
        <a href="/assets/juniors/Lessons/2026/Q3/English/Student/PP-26-Q3-L06.pdf">Lesson 06 - August 8</a>
        <a href="/assets/juniors/Lessons/2026/Q3/English/Teacher/PP-26-Q3-L06-T.pdf">Lesson 06 - August 8</a>
        <a href="/assets/teens/Lessons/2026/Q3/English/Student/CC-26-Q3-L06.pdf">Lesson 06 - August 8</a>
        <a href="/assets/teens/Lessons/2026/Q3/English/Teacher/CC-26-Q3-L06-T.pdf">Lesson 06 - August 8</a>
        '''

        parser = _WeeklyLessonParser('https://www.juniorpowerpoints.org/page2447')
        parser.feed(html)

        self.assertEqual(len(parser.links), 4)
        self.assertEqual(parser.links[0]['date'], date(2026, 8, 8))
        self.assertEqual(parser.links[0]['audience'], 'students')
        self.assertEqual(parser.links[3]['audience'], 'teachers')

    @patch('members.views.requests.get')
    def test_resolves_current_teen_lesson(self, mock_get):
        mock_get.return_value.raise_for_status.return_value = None
        mock_get.return_value.text = (
            '<a href="/assets/teens/Lessons/2026/Q3/English/Student/CC-26-Q3-L06.pdf">'
            'Lesson 06 - August 8</a>'
        )

        with patch('members.views.timezone.localdate', return_value=date(2026, 8, 6)):
            resolved = first_children_lesson_url('teens', 'students')

        self.assertEqual(
            resolved,
            'https://www.cornerstoneconnections.net/assets/teens/Lessons/2026/Q3/English/Student/CC-26-Q3-L06.pdf',
        )
        self.assertIn('teens', CHILDREN_LESSON_SOURCES)

from rest_framework.test import APITestCase
from rest_framework import status
from django.contrib.auth.models import User
from django.utils import timezone

from .models import Contribution, MemberProfile, Testimony


class TestimonyAPITests(APITestCase):
    def test_unauthenticated_user_can_submit_testimony_pending_approval(self):
        response = self.client.post(
            '/api/members/testimonies/',
            {
                'name': 'Visitor John',
                'testimony_text': 'God has been faithful in providing for my family this year.',
            },
            REMOTE_ADDR='192.168.1.50',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        testimony = Testimony.objects.get(name='Visitor John')
        self.assertEqual(testimony.status, 'pending_review')
        self.assertEqual(testimony.ip_address, '192.168.1.50')

        # Should not appear in public list
        list_response = self.client.get('/api/members/testimonies/')
        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(list_response.data), 0)

    def test_same_ip_cannot_submit_twice_while_pending_approval(self):
        # First submission
        res1 = self.client.post(
            '/api/members/testimonies/',
            {
                'name': 'Visitor 1',
                'testimony_text': 'First testimony message from this IP.',
            },
            REMOTE_ADDR='192.168.1.100',
        )
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)

        # Second submission before first is approved
        res2 = self.client.post(
            '/api/members/testimonies/',
            {
                'name': 'Visitor 2',
                'testimony_text': 'Second testimony message from same IP.',
            },
            REMOTE_ADDR='192.168.1.100',
        )
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('already have a testimony pending', str(res2.data))

        # Approve the first testimony
        first_testimony = Testimony.objects.get(name='Visitor 1')
        first_testimony.status = 'approved'
        first_testimony.save()

        # Third submission should now succeed
        res3 = self.client.post(
            '/api/members/testimonies/',
            {
                'name': 'Visitor 2',
                'testimony_text': 'Second testimony message from same IP after approval.',
            },
            REMOTE_ADDR='192.168.1.100',
        )
        self.assertEqual(res3.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Testimony.objects.count(), 2)


class ContributionReconciliationAPITests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='treasurer', password='secure-password')
        MemberProfile.objects.create(user=self.user, role='treasurer')
        self.client.force_authenticate(self.user)
        self.today = timezone.localdate()

    def test_treasurer_can_record_cash_and_reconcile_daily_totals(self):
        Contribution.objects.create(
            amount='1500.00',
            purpose='Tithe',
            status='completed',
            paid_at=timezone.now(),
            payment_method='mpesa',
        )
        cash_response = self.client.post('/api/members/treasury/cash-contributions/', {
            'received_on': self.today.isoformat(),
            'amount': '400.00',
            'purpose': 'Local Church Budget',
            'receipt_number': 'ENV-101',
        }, format='json')
        self.assertEqual(cash_response.status_code, status.HTTP_201_CREATED)

        reconcile_response = self.client.put(
            f'/api/members/treasury/reconciliation/?date={self.today.isoformat()}',
            {'digital_amount_confirmed': '1500.00', 'cash_amount_counted': '400.00', 'notes': 'Counted by two officers.'},
            format='json',
        )
        self.assertEqual(reconcile_response.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(str(reconcile_response.data['digital_recorded'])), Decimal('1500.00'))
        self.assertEqual(Decimal(str(reconcile_response.data['cash_recorded'])), Decimal('400.00'))
        self.assertEqual(Decimal(str(reconcile_response.data['total_variance'])), Decimal('0.00'))

    def test_member_cannot_access_treasury_reconciliation(self):
        member = User.objects.create_user(username='member', password='secure-password')
        MemberProfile.objects.create(user=member, role='member')
        self.client.force_authenticate(member)
        response = self.client.get('/api/members/treasury/reconciliation/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
