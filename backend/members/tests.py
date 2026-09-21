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
        mock_get.return_value.status_code = 200
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
        self.assertEqual(Decimal(str(reconcile_response.data['total_recorded'])), Decimal('1900.00'))

    def test_purpose_contributions_returns_individual_givings_list(self):
        CashContribution.objects.create(
            received_by=self.user,
            amount=Decimal('500.00'),
            purpose='13th Sabbath',
            received_on=self.today,
            payment_method='cash',
            donor_name='Jane Doe',
        )
        Contribution.objects.create(
            amount=Decimal('1200.00'),
            purpose='13th Sabbath',
            status='completed',
            paid_at=timezone.now(),
            payment_method='mpesa',
            donor_name='John Smith',
        )
        response = self.client.get(
            f'/api/members/treasury/purpose-contributions/?purpose=13th%20Sabbath&from_date={self.today.isoformat()}&to_date={self.today.isoformat()}'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)
        donor_names = {item['donor_name'] for item in response.data}
        self.assertIn('Jane Doe', donor_names)
        self.assertIn('John Smith', donor_names)

    def test_member_cannot_access_treasury_reconciliation(self):
        member = User.objects.create_user(username='member', password='secure-password')
        MemberProfile.objects.create(user=member, role='member')
        self.client.force_authenticate(member)
        response = self.client.get('/api/members/treasury/reconciliation/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class MpesaC2BAPITests(APITestCase):
    def test_c2b_validation_returns_accepted(self):
        response = self.client.post('/api/members/payments/mpesa/c2b/validation/', {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {'ResultCode': 0, 'ResultDesc': 'Accepted'})

    def test_c2b_confirmation_creates_completed_contribution_with_all_names(self):
        payload = {
            'TransactionType': 'Pay Bill',
            'TransID': 'RKT45X890',
            'TransTime': '20260917213000',
            'TransAmount': '2500.00',
            'BusinessShortCode': '600000',
            'BillRefNumber': 'Camp Goal',
            'MSISDN': '254712345678',
            'FirstName': 'Grace',
            'MiddleName': 'Wambui',
            'LastName': 'Mwangi',
        }
        response = self.client.post('/api/members/payments/mpesa/c2b/confirmation/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {'ResultCode': 0, 'ResultDesc': 'Accepted'})

        contribution = Contribution.objects.get(mpesa_receipt_number='RKT45X890')
        self.assertEqual(contribution.donor_name, 'Grace Wambui Mwangi')
        self.assertEqual(contribution.amount, Decimal('2500.00'))
        self.assertEqual(contribution.purpose, 'Camp Goal')
        self.assertEqual(contribution.status, 'completed')
        self.assertEqual(contribution.payment_method, 'mpesa')

    def test_c2b_confirmation_updates_existing_pending_contribution(self):
        pending = Contribution.objects.create(
            phone_number='254711223344',
            amount=Decimal('1000.00'),
            purpose='Tithe',
            status='pending',
            payment_method='mpesa',
        )
        payload = {
            'TransactionType': 'Pay Bill',
            'TransID': 'XYZ98765',
            'TransTime': '20260917213000',
            'TransAmount': '1000.00',
            'BusinessShortCode': '600000',
            'BillRefNumber': 'Tithe',
            'MSISDN': '254711223344',
            'FirstName': 'Samuel',
            'MiddleName': 'Oti',
            'LastName': 'Otieno',
        }
        response = self.client.post('/api/members/payments/mpesa/c2b/confirmation/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {'ResultCode': 0, 'ResultDesc': 'Accepted'})

        pending.refresh_from_db()
        self.assertEqual(pending.id, pending.id)
        self.assertEqual(pending.status, 'completed')
        self.assertEqual(pending.mpesa_receipt_number, 'XYZ98765')
        self.assertEqual(pending.donor_name, 'Samuel Oti Otieno')


from .models import BusinessMeeting, BusinessMeetingAgenda, CashContribution

class PdfGenerationAPITests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='treasurer',
            email='treasurer@sda.org',
            password='password123',
            first_name='John',
            last_name='Doe',
        )
        MemberProfile.objects.create(user=self.user, role='treasurer')
        self.client.force_authenticate(user=self.user)

    def test_reconciliation_pdf_returns_valid_pdf_stream(self):
        CashContribution.objects.create(
            received_by=self.user,
            amount=Decimal('1500.00'),
            purpose='Tithe',
            received_on=date.today(),
            payment_method='cash',
        )
        response = self.client.get('/api/members/reports/reconciliation/pdf/?include_individual=true')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response['Content-Type'], 'application/pdf')
        self.assertTrue(response.content.startswith(b'%PDF'))

    def test_individual_reconciliation_pdf_direct_call(self):
        from .pdf_generator import generate_reconciliation_pdf
        pdf_bytes = generate_reconciliation_pdf(
            church_name="SDA Church Test",
            start_date="2026-01-01",
            end_date="2026-01-31",
            purpose_rows=[],
            totals={"total": 1000},
            is_individual=True,
            individual_rows=[{
                "member_name": "Test Member",
                "date": "2026-01-15",
                "purpose_name": "Tithe",
                "contribution_type": "individual",
                "payment_method": "cash",
                "receipt_number": "REC-001",
                "amount": 1000,
            }],
        )
        self.assertTrue(pdf_bytes.startswith(b'%PDF'))

    def test_member_giving_pdf_returns_valid_pdf_stream(self):
        Contribution.objects.create(
            member=self.user,
            amount=Decimal('3000.00'),
            purpose='Church Building',
            status='COMPLETED',
            payment_method='mpesa',
        )
        response = self.client.get('/api/members/reports/member-giving/pdf/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response['Content-Type'], 'application/pdf')
        self.assertTrue(response.content.startswith(b'%PDF'))

    def test_business_meeting_pdf_returns_valid_pdf_stream(self):
        meeting = BusinessMeeting.objects.create(
            title='Q3 Business Session',
            meeting_date=date.today(),
            location='Main Hall',
            status='upcoming',
            minutes='Initial planning started.',
        )
        BusinessMeetingAgenda.objects.create(
            meeting=meeting,
            title='Financial Budget Approval',
            description='Review annual expenditure',
            order=1,
        )
        response = self.client.get(f'/api/members/business-meetings/{meeting.id}/pdf/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response['Content-Type'], 'application/pdf')
        self.assertTrue(response.content.startswith(b'%PDF'))

    def test_treasury_accounts_and_expenditures(self):
        from .models import TreasuryAccount, Expenditure
        response = self.client.post('/api/members/treasury/accounts/', {
            "name": "KCB Main Account",
            "account_number": "1122334455",
            "account_type": "bank",
            "balance": "50000.00",
            "description": "Primary church bank account"
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        acc1_id = response.data['id']

        response2 = self.client.post('/api/members/treasury/accounts/', {
            "name": "Paybill Account",
            "account_number": "522522",
            "account_type": "mobile_money",
            "balance": "20000.00",
        }, format='json')
        acc2_id = response2.data['id']

        res_credit = self.client.post(f'/api/members/treasury/accounts/{acc1_id}/credit/', {
            "amount": "10000.00",
            "description": "Direct bank deposit"
        }, format='json')
        self.assertEqual(res_credit.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(res_credit.data['account']['balance']), Decimal('60000.00'))

        res_debit = self.client.post(f'/api/members/treasury/accounts/{acc1_id}/debit/', {
            "amount": "5000.00",
            "description": "Hall renovation deposit"
        }, format='json')
        self.assertEqual(res_debit.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(res_debit.data['account']['balance']), Decimal('55000.00'))

        res_transfer = self.client.post('/api/members/treasury/accounts/transfer/', {
            "source_account_id": acc2_id,
            "target_account_id": acc1_id,
            "amount": "10000.00",
            "description": "M-Pesa sweep to bank"
        }, format='json')
        self.assertEqual(res_transfer.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(res_transfer.data['source_account']['balance']), Decimal('10000.00'))
        self.assertEqual(Decimal(res_transfer.data['target_account']['balance']), Decimal('65000.00'))

        res_exp = self.client.post('/api/members/treasury/expenditures/', {
            "title": "Electricity & Water Bill",
            "amount": "8000.00",
            "category": "utilities",
            "account": acc1_id,
            "payment_method": "bank_transfer",
            "vendor_payee": "Kenya Power",
            "expenditure_date": "2026-09-18"
        }, format='json')
        self.assertEqual(res_exp.status_code, status.HTTP_201_CREATED)

        acc1_reloaded = TreasuryAccount.objects.get(pk=acc1_id)
        self.assertEqual(acc1_reloaded.balance, Decimal('57000.00'))


