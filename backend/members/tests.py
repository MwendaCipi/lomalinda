from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase

from .views import CHILDREN_LESSON_SOURCES, _WeeklyLessonParser, first_children_lesson_url, send_invitation_email


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
from django.contrib.auth.models import Group, User
from django.utils import timezone

from .models import Contribution, EnrollmentRequest, Invitation, MemberProfile, MpesaRefund, Testimony
from .mpesa import account_reference_for_purpose
from .mpesa_tokens import pack_callback_context, unpack_callback_context


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


class MpesaPurposeReferenceTests(TestCase):
    def test_account_reference_uses_compact_purpose(self):
        self.assertEqual(account_reference_for_purpose('LCB'), 'LCB')
        self.assertEqual(account_reference_for_purpose('Tithe'), 'TITHE')
        self.assertEqual(account_reference_for_purpose('Local Church Budget'), 'LCB')
        self.assertEqual(account_reference_for_purpose(''), 'GIVING')


class MpesaInitiationAPITests(APITestCase):
    @patch('members.views.initiate_stk_push_for_context')
    def test_stk_initiation_creates_no_contribution_row(self, mock_stk):
        mock_stk.return_value = {'CustomerMessage': 'Prompt sent'}
        response = self.client.post('/api/members/contributions/initiate/', {
            'giving_type': 'financial',
            'payment_method': 'mpesa',
            'amount': '100.00',
            'purpose': 'Tithe',
            'phone_number': '0712345678',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Contribution.objects.count(), 0)
        # The push carried the initiation details for the callback.
        kwargs = mock_stk.call_args.kwargs
        self.assertEqual(kwargs['phone_number'], '254712345678')
        self.assertEqual(kwargs['amount'], Decimal('100.00'))
        self.assertEqual(kwargs['purpose'], 'Tithe')
        # The context token is signed, not encrypted, but unpacks intact.
        self.assertEqual(
            unpack_callback_context(mock_stk.call_args.kwargs['context_token']),
            {'amount': '100.00', 'purpose': 'Tithe', 'phone_number': '254712345678'},
        )

    @patch('members.views.initiate_stk_push_for_context')
    def test_stk_initiation_failure_creates_no_contribution_row(self, mock_stk):
        mock_stk.side_effect = RuntimeError('Safaricom unavailable')
        response = self.client.post('/api/members/contributions/initiate/', {
            'giving_type': 'financial',
            'payment_method': 'mpesa',
            'amount': '100.00',
            'purpose': 'Tithe',
            'phone_number': '0712345678',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)
        self.assertEqual(Contribution.objects.count(), 0)

    @patch('members.views.initiate_stk_push_for_context')
    def test_stk_initiation_carries_the_form_name_in_the_context(self, mock_stk):
        mock_stk.return_value = {'CustomerMessage': 'Prompt sent.'}
        response = self.client.post('/api/members/contributions/initiate/', {
            'giving_type': 'financial',
            'payment_method': 'mpesa',
            'amount': '100.00',
            'purpose': 'Tithe',
            'phone_number': '0712345678',
            'donor_name': 'Judith Ndirangu',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        context = unpack_callback_context(mock_stk.call_args.kwargs['context_token'])
        self.assertEqual(context.get('donor_name'), 'Judith Ndirangu')


class MpesaCallbackAPITests(APITestCase):
    def _callback_payload(self, result_code=0, checkout_id='ws_CO_123'):
        payload = {
            'Body': {
                'stkCallback': {
                    'MerchantRequestID': '29115-34620561-1',
                    'CheckoutRequestID': checkout_id,
                    'ResultCode': result_code,
                }
            }
        }
        if result_code != 0:
            payload['Body']['stkCallback']['ResultDesc'] = {
                1032: 'Request cancelled by user',
                1037: 'DS timeout user cannot be reached',
                1: 'The initiator information is invalid',
            }.get(result_code, 'Payment not completed')
        if result_code == 0:
            payload['Body']['stkCallback']['CallbackMetadata'] = {
                'Item': [
                    {'Name': 'Amount', 'Value': 100.00},
                    {'Name': 'MpesaReceiptNumber', 'Value': 'SCL4N0XXXX'},
                    {'Name': 'PhoneNumber', 'Value': 254712345678},
                    {'Name': 'FirstName', 'Value': 'Jane'},
                    {'Name': 'MiddleName', 'Value': 'Wanjiku'},
                    {'Name': 'LastName', 'Value': 'Doe'},
                ]
            }
        return payload

    def _post_callback(self, payload, context):
        token = pack_callback_context(context)
        return self.client.post(f'/api/members/payments/mpesa/callback/?ctx={token}', payload, format='json')

    def test_successful_callback_creates_completed_contribution_named_from_mpesa(self):
        context = {'amount': '100.00', 'purpose': 'Tithe', 'phone_number': '254712345678'}
        response = self._post_callback(self._callback_payload(), context)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Contribution.objects.count(), 1)
        contribution = Contribution.objects.get()
        self.assertEqual(contribution.status, 'completed')
        self.assertEqual(contribution.donor_name, 'Jane Wanjiku Doe')
        self.assertEqual(contribution.mpesa_receipt_number, 'SCL4N0XXXX')
        self.assertEqual(contribution.amount, Decimal('100.00'))

    def test_callback_records_name_from_contact_when_safaricom_omits_it(self):
        """Without the name items, the giver is resolved from email/phone instead."""
        User.objects.create_user(
            'zipp.m', 'zipporah.moturi@example.com', 'ChurchPass#2026',
            first_name='Zipporah', last_name='Moturi',
        )
        payload = self._callback_payload()
        items = payload['Body']['stkCallback']['CallbackMetadata']['Item']
        payload['Body']['stkCallback']['CallbackMetadata']['Item'] = [
            item for item in items
            if item['Name'] not in ('FirstName', 'MiddleName', 'LastName')
        ]
        context = {
            'amount': '100.00', 'purpose': 'Tithe',
            'phone_number': '254712345678',
            'donor_email': 'zipporah.moturi@example.com',
        }
        response = self._post_callback(payload, context)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        contribution = Contribution.objects.get(checkout_request_id='ws_CO_123')
        self.assertEqual(contribution.donor_name, 'Zipporah Moturi')

    def test_callback_prefers_the_form_name_over_metadata(self):
        context = {
            'amount': '100.00', 'purpose': 'Tithe',
            'phone_number': '254712345678',
            'donor_name': 'Judith Ndirangu',
        }
        # The payload still carries Safaricom's FirstName — the form wins.
        response = self._post_callback(self._callback_payload(), context)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        contribution = Contribution.objects.get(checkout_request_id='ws_CO_123')
        self.assertEqual(contribution.donor_name, 'Judith Ndirangu')
        self.assertEqual(contribution.purpose, 'Tithe')
        self.assertEqual(contribution.phone_number, '254712345678')
        self.assertIsNotNone(contribution.paid_at)

    def test_cancelled_callback_records_terminal_failed_attempt(self):
        context = {'amount': '100.00', 'purpose': 'Tithe', 'phone_number': '254712345678'}
        response = self._post_callback(self._callback_payload(result_code=1032), context)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Contribution.objects.count(), 1)
        attempt = Contribution.objects.get()
        self.assertEqual(attempt.status, 'failed')
        self.assertEqual(attempt.amount, Decimal('100.00'))
        self.assertEqual(attempt.purpose, 'Tithe')
        self.assertEqual(attempt.phone_number, '254712345678')
        self.assertEqual(attempt.item_description, 'Request cancelled by user')
        # No money moved: no receipt and no payment timestamp.
        self.assertIsNone(attempt.mpesa_receipt_number)
        self.assertIsNone(attempt.paid_at)

    def test_repeated_failed_callback_records_only_one_attempt(self):
        context = {'amount': '100.00', 'purpose': 'Tithe', 'phone_number': '254712345678'}
        self._post_callback(self._callback_payload(result_code=1037), context)
        self._post_callback(self._callback_payload(result_code=1037), context)
        self.assertEqual(Contribution.objects.count(), 1)

    def test_tampered_or_missing_token_creates_no_contribution(self):
        response = self.client.post(
            '/api/members/payments/mpesa/callback/?ctx=tampered-token',
            self._callback_payload(),
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Contribution.objects.count(), 0)

    def test_repeated_callback_creates_only_one_contribution(self):
        context = {'amount': '100.00', 'purpose': 'Tithe', 'phone_number': '254712345678'}
        self._post_callback(self._callback_payload(), context)
        self._post_callback(self._callback_payload(), context)
        self.assertEqual(Contribution.objects.count(), 1)

    def test_callback_links_campaign_card_and_member(self):
        from django.contrib.auth.models import User

        from .models import CampaignCardAssignment, FundraisingCampaign
        giver = User.objects.create_user(username='254712345678', password='secure-password')
        campaign = FundraisingCampaign.objects.create(name='Camp Goal 2026', target_amount=Decimal('100000.00'))
        card = CampaignCardAssignment.objects.create(campaign=campaign, member=giver, referral_token='card-token-1')
        context = {
            'amount': '500.00',
            'purpose': 'Camp Goal 2026',
            'phone_number': '254712345678',
            'member_id': giver.pk,
            'donor_email': 'giver@example.com',
            'referral_token': card.referral_token,
        }
        self._post_callback(self._callback_payload(), context)
        contribution = Contribution.objects.get()
        self.assertEqual(contribution.member, giver)
        self.assertEqual(contribution.donor_email, 'giver@example.com')
        self.assertEqual(contribution.campaign, campaign)
        self.assertEqual(contribution.card_assignment, card)


class MyContributionsStatusFilterTests(APITestCase):
    def _make(self, member, **kwargs):
        return Contribution.objects.create(member=member, amount=Decimal('100.00'), purpose='Tithe', **kwargs)

    def test_failed_attempts_hidden_by_default_and_opt_in(self):
        from django.contrib.auth.models import User

        member = User.objects.create_user(username='254700000001', password='secure-password')
        self._make(member, status='completed', payment_method='mpesa', paid_at=timezone.now())
        self._make(member, status='failed', payment_method='mpesa')
        self.client.force_authenticate(member)
        default = self.client.get('/api/members/contributions/')
        self.assertEqual([c['status'] for c in default.json()], ['completed'])
        with_failed = self.client.get('/api/members/contributions/?include_failed=1')
        self.assertEqual(sorted(c['status'] for c in with_failed.json()), ['completed', 'failed'])


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

    def test_c2b_confirmation_ignores_amounts_matching_no_receipt(self):
        # The old flow matched pending rows by phone and amount; there are no
        # pending rows anymore, and unknown confirmations must not adopt one.
        Contribution.objects.create(
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

        contribution = Contribution.objects.get(mpesa_receipt_number='XYZ98765')
        self.assertEqual(contribution.status, 'completed')
        self.assertEqual(contribution.donor_name, 'Samuel Oti Otieno')


class MpesaRefundAPITests(APITestCase):
    def setUp(self):
        self.treasurer = User.objects.create_user(username='refund_treasurer', password='secure-password')
        MemberProfile.objects.create(user=self.treasurer, role='treasurer')
        self.member = User.objects.create_user(username='refund_member', password='secure-password')
        MemberProfile.objects.create(user=self.member, role='member')
        self.contribution = Contribution.objects.create(
            amount=Decimal('1500.00'),
            purpose='Tithe',
            status='completed',
            paid_at=timezone.now(),
            payment_method='mpesa',
            phone_number='254712345678',
            donor_name='Grace Wambui',
        )

    def _refund_url(self):
        return f'/api/members/treasury/contributions/{self.contribution.id}/refund/'

    @patch('members.views.initiate_b2c_refund')
    def test_treasurer_can_refund_completed_mpesa_contribution(self, mock_b2c):
        mock_b2c.return_value = {
            'ResponseCode': '0',
            'ResponseDescription': 'Accept the service request successfully.',
            'ConversationID': 'AG_20260921_0001',
        }
        self.client.force_authenticate(self.treasurer)
        response = self.client.post(self._refund_url(), {
            'phone_number': '0712345678',
            'reason': 'Duplicate offering captured twice.',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        refund = MpesaRefund.objects.get(contribution=self.contribution)
        self.assertEqual(refund.status, 'accepted')
        self.assertEqual(refund.amount, Decimal('1500.00'))
        self.assertEqual(refund.phone_number, '254712345678')
        self.assertEqual(refund.initiated_by, self.treasurer)

    def test_member_cannot_refund(self):
        self.client.force_authenticate(self.member)
        response = self.client.post(self._refund_url(), {'phone_number': '0712345678'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(MpesaRefund.objects.count(), 0)

    def test_unauthenticated_user_cannot_refund(self):
        response = self.client.post(self._refund_url(), {'phone_number': '0712345678'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(MpesaRefund.objects.count(), 0)

    def test_cannot_refund_non_mpesa_contribution(self):
        self.contribution.payment_method = 'cash'
        self.contribution.save(update_fields=['payment_method'])
        self.client.force_authenticate(self.treasurer)
        response = self.client.post(self._refund_url(), {'phone_number': '0712345678'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(MpesaRefund.objects.count(), 0)

    def test_cannot_refund_pending_contribution(self):
        self.contribution.status = 'pending'
        self.contribution.save(update_fields=['status'])
        self.client.force_authenticate(self.treasurer)
        response = self.client.post(self._refund_url(), {'phone_number': '0712345678'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(MpesaRefund.objects.count(), 0)

    def test_cannot_refund_twice(self):
        MpesaRefund.objects.create(
            contribution=self.contribution,
            amount=self.contribution.amount,
            phone_number='254712345678',
            initiated_by=self.treasurer,
            originator_conversation_id='origin-abc123',
            status='accepted',
        )
        self.client.force_authenticate(self.treasurer)
        response = self.client.post(self._refund_url(), {'phone_number': '0712345678'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(MpesaRefund.objects.count(), 1)

    @patch('members.views.initiate_b2c_refund')
    def test_mpesa_rejection_deletes_refund_and_returns_502(self, mock_b2c):
        mock_b2c.side_effect = Exception('M-Pesa rejected the request.')
        self.client.force_authenticate(self.treasurer)
        response = self.client.post(self._refund_url(), {'phone_number': '0712345678'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)
        self.assertEqual(MpesaRefund.objects.count(), 0)

    @patch('members.views.initiate_b2c_refund')
    def test_missing_b2c_config_returns_503(self, mock_b2c):
        from .mpesa import MpesaConfigurationError
        mock_b2c.side_effect = MpesaConfigurationError('M-Pesa B2C is not configured: missing MPESA_INITIATOR_NAME.')
        self.client.force_authenticate(self.treasurer)
        response = self.client.post(self._refund_url(), {'phone_number': '0712345678'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(MpesaRefund.objects.count(), 0)

    def test_b2c_result_completes_refund(self):
        refund = MpesaRefund.objects.create(
            contribution=self.contribution,
            amount=self.contribution.amount,
            phone_number='254712345678',
            initiated_by=self.treasurer,
            originator_conversation_id='origin-complete-1',
            status='accepted',
        )
        payload = {
            'OriginatorConversationID': 'origin-complete-1',
            'ConversationID': 'AG_20260921_0001',
            'Result': {
                'ResultType': 0,
                'ResultCode': 0,
                'ResultDesc': 'The service request is processed successfully.',
                'ResultParameters': {
                    'ResultParameter': [
                        {'Key': 'TransactionAmount', 'Value': 1500},
                        {'Key': 'TransactionID', 'Value': 'SJK4Q1XYZ'},
                    ]
                },
            },
        }
        response = self.client.post('/api/members/payments/mpesa/b2c/result/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        refund.refresh_from_db()
        self.assertEqual(refund.status, 'completed')
        self.assertEqual(refund.transaction_id, 'SJK4Q1XYZ')
        self.assertIsNotNone(refund.completed_at)

    def test_b2c_result_failure_marks_refund_failed(self):
        refund = MpesaRefund.objects.create(
            contribution=self.contribution,
            amount=self.contribution.amount,
            phone_number='254712345678',
            initiated_by=self.treasurer,
            originator_conversation_id='origin-fail-1',
            status='accepted',
        )
        payload = {
            'OriginatorConversationID': 'origin-fail-1',
            'Result': {'ResultCode': 2001, 'ResultDesc': 'The initiator information is invalid.'},
        }
        response = self.client.post('/api/members/payments/mpesa/b2c/result/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        refund.refresh_from_db()
        self.assertEqual(refund.status, 'failed')
        self.assertIn('invalid', refund.outcome_description)

    def test_b2c_result_for_unknown_conversation_is_still_accepted(self):
        response = self.client.post('/api/members/payments/mpesa/b2c/result/', {
            'OriginatorConversationID': 'does-not-exist',
            'Result': {'ResultCode': 0, 'ResultDesc': 'Processed.'},
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {'ResultCode': 0, 'ResultDesc': 'Accepted'})

    def test_refundable_contributions_lists_completed_mpesa_with_refund_state(self):
        refunded = Contribution.objects.create(
            amount=Decimal('800.00'), purpose='Camp Offering', status='completed',
            paid_at=timezone.now(), payment_method='mpesa', phone_number='254701111111',
            donor_name='Refunded Giver',
        )
        MpesaRefund.objects.create(
            contribution=refunded, amount=refunded.amount, phone_number='254701111111',
            initiated_by=self.treasurer, originator_conversation_id='origin-ref-list', status='accepted',
        )
        bank = Contribution.objects.create(
            amount=Decimal('900.00'), purpose='Tithe', status='completed',
            paid_at=timezone.now(), payment_method='bank_transfer',
        )
        self.client.force_authenticate(self.treasurer)
        response = self.client.get('/api/members/treasury/refundable-contributions/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {row['id'] for row in response.data}
        self.assertIn(self.contribution.id, ids)
        self.assertIn(refunded.id, ids)
        self.assertNotIn(bank.id, ids)
        by_id = {row['id']: row for row in response.data}
        self.assertFalse(by_id[self.contribution.id]['refund'])
        self.assertEqual(by_id[refunded.id]['refund_status'], 'accepted')

    def test_refundable_contributions_requires_treasurer(self):
        self.client.force_authenticate(self.member)
        response = self.client.get('/api/members/treasury/refundable-contributions/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_treasurer_can_list_refunds_but_member_cannot(self):
        MpesaRefund.objects.create(
            contribution=self.contribution,
            amount=self.contribution.amount,
            phone_number='254712345678',
            initiated_by=self.treasurer,
            originator_conversation_id='origin-list-1',
            status='accepted',
        )
        self.client.force_authenticate(self.member)
        member_response = self.client.get('/api/members/treasury/refunds/')
        self.assertEqual(member_response.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(self.treasurer)
        treasurer_response = self.client.get('/api/members/treasury/refunds/')
        self.assertEqual(treasurer_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(treasurer_response.data), 1)
        self.assertEqual(treasurer_response.data[0]['contribution_purpose'], 'Tithe')


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




class InvitationAPITests(APITestCase):
    """Email invitations: an admin invites, the invitee sets their own password."""

    def setUp(self):
        self.admin_user = User.objects.create_user('linda.admin', 'linda.admin@example.com', 'ChurchAdmin#2026')
        MemberProfile.objects.create(user=self.admin_user, role='admin', roles='admin', phone_number='0700000001')
        self.member_user = User.objects.create_user('plain.member', 'plain@example.com', 'MemberPass#2026')
        MemberProfile.objects.create(user=self.member_user, role='member', roles='member')

    def _invitation(self, **overrides):
        values = {
            'email': 'invitee@example.com',
            'first_name': 'Grace',
            'last_name': 'Wanjiku',
            'roles': 'admin',
            'account_type': 'member',
            'expires_at': timezone.now() + timedelta(days=7),
        }
        values.update(overrides)
        return Invitation.objects.create(**values)

    def test_admin_can_invite_and_the_email_carries_the_link(self):
        self.client.force_authenticate(user=self.admin_user)
        with patch('members.views.send_mail') as mock_send:
            response = self.client.post('/api/members/invitations/', {
                'email': 'grace@example.com',
                'first_name': 'Grace',
                'last_name': 'Wanjiku',
                'roles': ['admin'],
                'account_type': 'member',
            }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data['email_sent'])
        self.assertIn('/accept-invite?token=', response.data['invite_url'])
        invitation = Invitation.objects.get(email='grace@example.com')
        self.assertEqual(invitation.status, 'pending')
        self.assertEqual(invitation.role_codes(), ['admin'])
        self.assertEqual(invitation.invited_by, self.admin_user)
        self.assertIsNotNone(invitation.sent_at)
        recipient = mock_send.call_args[0][3]
        self.assertEqual(recipient, ['grace@example.com'])
        # The email carries the raw token even though the database stores only
        # its hash: the link in the response must open the same invitation.
        raw_token = response.data['invite_url'].split('token=')[1]
        self.assertIn(raw_token, mock_send.call_args[0][1])

    def test_a_plain_member_cannot_invite(self):
        self.client.force_authenticate(user=self.member_user)
        response = self.client.post('/api/members/invitations/', {
            'email': 'someone@example.com', 'first_name': 'Someone',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(Invitation.objects.count(), 0)

    def test_inviting_an_existing_account_email_is_refused(self):
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post('/api/members/invitations/', {
            'email': 'plain@example.com', 'first_name': 'Plain',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('already exists', response.data['email'])

    def test_invitee_sets_a_password_and_can_then_sign_in(self):
        Group.objects.get_or_create(name='Administrators')
        invitation = self._invitation()

        lookup = self.client.get(f'/api/members/auth/invitation/verify/?token={invitation.raw_token}')
        self.assertEqual(lookup.status_code, status.HTTP_200_OK)
        self.assertEqual(lookup.data['email'], 'invitee@example.com')
        self.assertEqual(lookup.data['roles'], ['admin'])

        accepted = self.client.post('/api/members/auth/invitation/accept/', {
            'token': str(invitation.raw_token),
            'username': 'grace.wanjiku',
            'password': 'SabbathRest#2026',
            'confirm_password': 'SabbathRest#2026',
            'privacy_accepted': True, 'terms_accepted': True,
        }, format='json')
        self.assertEqual(accepted.status_code, status.HTTP_201_CREATED)

        user = User.objects.get(username='grace.wanjiku')
        self.assertTrue(user.is_active)
        self.assertEqual(user.email, 'invitee@example.com')
        self.assertEqual(user.member_profile.roles, 'admin')
        self.assertIn('Administrators', [group.name for group in user.groups.all()])

        invitation.refresh_from_db()
        self.assertEqual(invitation.status, 'accepted')
        self.assertEqual(invitation.user, user)

        # The whole point: the invited person signs in with what they chose.
        token_response = self.client.post('/api/auth/token/', {
            'username': 'grace.wanjiku', 'password': 'SabbathRest#2026',
        }, format='json')
        self.assertEqual(token_response.status_code, status.HTTP_200_OK)
        self.assertIn('access', token_response.data)

        # And the link cannot be used twice.
        reuse = self.client.post('/api/members/auth/invitation/accept/', {
            'token': str(invitation.raw_token),
            'username': 'someone.else',
            'password': 'AnotherPass#2026',
            'confirm_password': 'AnotherPass#2026',
            'privacy_accepted': True, 'terms_accepted': True,
        }, format='json')
        self.assertEqual(reuse.status_code, status.HTTP_400_BAD_REQUEST)

    def test_accept_guards_against_bad_input(self):
        invitation = self._invitation()
        mismatch = self.client.post('/api/members/auth/invitation/accept/', {
            'token': str(invitation.raw_token),
            'username': 'grace.wanjiku',
            'password': 'SabbathRest#2026',
            'confirm_password': 'Something#Else1',
            'privacy_accepted': True, 'terms_accepted': True,
        }, format='json')
        self.assertEqual(mismatch.status_code, status.HTTP_400_BAD_REQUEST)

        taken = self.client.post('/api/members/auth/invitation/accept/', {
            'token': str(invitation.raw_token),
            'username': 'plain.member',
            'password': 'SabbathRest#2026',
            'confirm_password': 'SabbathRest#2026',
            'privacy_accepted': True, 'terms_accepted': True,
        }, format='json')
        self.assertEqual(taken.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('username', taken.data)

    def test_expired_and_revoked_links_are_refused(self):
        expired = self._invitation(email='late@example.com', expires_at=timezone.now() - timedelta(minutes=1))
        self.assertEqual(
            self.client.get(f'/api/members/auth/invitation/verify/?token={expired.token}').status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertEqual(
            self.client.post('/api/members/auth/invitation/accept/', {
                'token': str(expired.raw_token), 'username': 'late.comer',
                'password': 'SabbathRest#2026', 'confirm_password': 'SabbathRest#2026', 'privacy_accepted': True, 'terms_accepted': True,
            }, format='json').status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        revoked = self._invitation(email='revoked@example.com')
        self.client.force_authenticate(user=self.admin_user)
        self.assertEqual(
            self.client.delete(f'/api/members/invitations/{revoked.pk}/').status_code,
            status.HTTP_200_OK,
        )
        revoked.refresh_from_db()
        self.assertEqual(revoked.status, 'revoked')
        self.assertEqual(
            self.client.get(f'/api/members/auth/invitation/verify/?token={revoked.raw_token}').status_code,
            status.HTTP_400_BAD_REQUEST,
        )

    def test_resend_issues_a_fresh_link(self):
        invitation = self._invitation(email='resend@example.com')
        original_token = invitation.token
        self.client.force_authenticate(user=self.admin_user)
        with patch('members.views.send_mail') as mock_send:
            response = self.client.post(f'/api/members/invitations/{invitation.pk}/', {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['email_sent'])
        mock_send.assert_called_once()
        invitation.refresh_from_db()
        self.assertNotEqual(invitation.token, original_token)
        self.assertEqual(invitation.status, 'pending')

    def test_the_database_stores_only_the_hash(self):
        invitation = self._invitation()

        raw_token = invitation.raw_token
        self.assertTrue(raw_token)
        self.assertNotEqual(invitation.token, raw_token)
        self.assertEqual(len(invitation.token), 64)

        # The raw link opens the invitation; the stored hash and anything
        # similar do not, so a leaked database dump cannot revive an invite.
        self.assertEqual(Invitation.from_token(raw_token).pk, invitation.pk)
        self.assertIsNone(Invitation.from_token(invitation.token))
        self.assertIsNone(Invitation.from_token(f'{raw_token}x'))

    def test_the_office_sets_how_long_invitations_last(self):
        from .models import ChurchSettings

        ChurchSettings.objects.create(invitation_link_lifetime_days=2)
        self.client.force_authenticate(user=self.admin_user)
        now = timezone.now()
        with patch('members.views.timezone.now', return_value=now), patch('members.views.send_mail'):
            response = self.client.post('/api/members/invitations/', {
                'email': 'twodays@example.com', 'first_name': 'Grace', 'roles': ['member'],
            }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        invitation = Invitation.objects.get(email='twodays@example.com')
        self.assertEqual(invitation.expires_at, now + timedelta(days=2))


class MyContributionsTests(APITestCase):
    """A member's giving record lists completed payments only: a pending
    M-Pesa prompt is not money given and must not inflate their history."""

    def setUp(self):
        self.member = User.objects.create_user('giver.member', 'giver@example.com', 'MemberPass#2026')
        MemberProfile.objects.create(user=self.member, roles='member')

    def test_only_completed_contributions_are_listed(self):
        Contribution.objects.create(member=self.member, amount=Decimal('500.00'), purpose='Tithe', status='completed', paid_at=timezone.now())
        Contribution.objects.create(member=self.member, amount=Decimal('900.00'), purpose='Tithe', status='pending')
        Contribution.objects.create(member=self.member, amount=Decimal('700.00'), purpose='Tithe', status='failed')

        self.client.force_authenticate(user=self.member)
        response = self.client.get('/api/members/contributions/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['status'], 'completed')
        self.assertEqual(Decimal(response.data[0]['amount']), Decimal('500.00'))


class InvitationThrottleTests(APITestCase):
    """One address probing the public invitation endpoints meets a wall.

    Verify and accept draw from one per-client budget, a fresh edge address
    gets its own, and a client-supplied X-Forwarded-For header cannot buy a
    new budget once spent (members/throttling.py).
    """

    def setUp(self):
        from django.conf import settings as django_settings
        from django.core.cache import cache

        cache.clear()
        # The throttle reads its rate on every request, so tightening it here
        # keeps the test fast without touching the deployment default.
        self.original_rates = django_settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']
        django_settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'] = {'invitation_public': '3/hour'}
        self.addCleanup(
            django_settings.REST_FRAMEWORK.__setitem__,
            'DEFAULT_THROTTLE_RATES',
            self.original_rates,
        )
        self.invitation = Invitation.objects.create(
            email='throttled@example.com',
            first_name='Grace',
            last_name='Wanjiku',
            roles='member',
            account_type='member',
            expires_at=timezone.now() + timedelta(days=7),
        )

    def verify(self, **extra):
        return self.client.get(
            f'/api/members/auth/invitation/verify/?token={self.invitation.raw_token}', **extra
        )

    def accept(self, **extra):
        return self.client.post('/api/members/auth/invitation/accept/', {
            'token': str(self.invitation.raw_token),
            'username': 'throttled.user',
            'password': 'SabbathRest#2026',
            'confirm_password': 'SabbathRest#2026',
            'privacy_accepted': True, 'terms_accepted': True,
        }, format='json', **extra)

    def test_verify_and_accept_draw_from_one_budget(self):
        self.assertEqual(self.verify().status_code, 200)
        self.assertEqual(self.verify().status_code, 200)
        self.assertEqual(self.accept().status_code, 201)
        self.assertEqual(self.verify().status_code, 429)

    def test_a_fresh_address_gets_its_own_budget(self):
        self.assertEqual(self.verify().status_code, 200)
        self.assertEqual(self.verify().status_code, 200)
        self.assertEqual(self.verify().status_code, 200)
        self.assertEqual(self.verify().status_code, 429)
        behind_the_edge = self.verify(HTTP_CF_CONNECTING_IP='203.0.113.7')
        self.assertEqual(behind_the_edge.status_code, 200)

    def test_a_rolled_forwarded_for_header_does_not_reset_the_budget(self):
        self.assertEqual(self.verify().status_code, 200)
        self.assertEqual(self.verify().status_code, 200)
        self.assertEqual(self.verify().status_code, 200)
        self.assertEqual(self.verify().status_code, 429)
        self.assertEqual(self.verify(HTTP_X_FORWARDED_FOR='198.51.100.9').status_code, 429)
        self.assertEqual(self.verify(HTTP_X_FORWARDED_FOR='198.51.100.10, 198.51.100.9').status_code, 429)


class ChurchRoleTests(APITestCase):
    """Church roles are hard-coded, and Administrator is a protected system role."""

    def setUp(self):
        for name in ('Administrators', 'Church Leaders', 'Finance Team'):
            Group.objects.get_or_create(name=name)

        self.admin_user = User.objects.create_user('role.admin', 'role.admin@example.com', 'ChurchAdmin#2026')
        MemberProfile.objects.create(user=self.admin_user, role='admin', roles='admin')
        self.clerk_user = User.objects.create_user('role.clerk', 'role.clerk@example.com', 'ChurchClerk#2026')
        MemberProfile.objects.create(user=self.clerk_user, role='clerk', roles='clerk')
        self.member_user = User.objects.create_user('role.member', 'role.member@example.com', 'MemberPass#2026')
        MemberProfile.objects.create(user=self.member_user, role='member', roles='member')

    def _invite(self, actor, **overrides):
        self.client.force_authenticate(user=actor)
        payload = {'email': 'invitee@example.com', 'first_name': 'Grace', 'roles': ['member']}
        payload.update(overrides)
        with patch('members.views.send_mail'):
            return self.client.post('/api/members/invitations/', payload, format='json')

    def test_invitation_rejects_unknown_role_codes(self):
        response = self._invite(self.admin_user, roles=['member', 'pope'])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('pope', response.data['roles'])

    def test_invitation_keeps_every_ticked_role(self):
        response = self._invite(self.admin_user, roles=['treasurer', 'clerk'])
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        invitation = Invitation.objects.get(email='invitee@example.com')
        # Stored in the canonical (hard-coded) order, not the order submitted.
        self.assertEqual(invitation.role_codes(), ['clerk', 'treasurer'])

    def test_clerk_cannot_invite_an_administrator(self):
        response = self._invite(self.clerk_user, roles=['admin'])
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(Invitation.objects.filter(email='invitee@example.com').exists())

    def test_clerk_can_still_invite_a_plain_role(self):
        self.assertEqual(self._invite(self.clerk_user, roles=['member']).status_code, status.HTTP_201_CREATED)

    def _set_roles(self, actor, target, roles):
        self.client.force_authenticate(user=actor)
        return self.client.patch(
            f'/api/members/users/{target.pk}/role/', {'roles': roles}, format='json'
        )

    def test_role_update_stores_the_set_and_syncs_the_role_groups(self):
        response = self._set_roles(self.admin_user, self.member_user, ['treasurer', 'clerk'])
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        profile = MemberProfile.objects.get(user=self.member_user)
        self.assertEqual(profile.roles, 'clerk, treasurer')
        self.assertEqual(profile.role, 'clerk')
        self.assertEqual(
            sorted(self.member_user.groups.values_list('name', flat=True)),
            ['Church Leaders', 'Finance Team'],
        )

    def test_role_update_rejects_unknown_codes(self):
        response = self._set_roles(self.admin_user, self.member_user, ['member', 'wizard'])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('wizard', response.data['roles'])
        profile = MemberProfile.objects.get(user=self.member_user)
        self.assertEqual(profile.roles, 'member')

    def test_clerk_cannot_strip_an_administrator(self):
        response = self._set_roles(self.clerk_user, self.admin_user, ['member'])
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(MemberProfile.objects.get(user=self.admin_user).get_roles(), ['admin'])

    def test_clerk_cannot_promote_anyone_to_administrator(self):
        response = self._set_roles(self.clerk_user, self.member_user, ['admin'])
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_administrator_cannot_drop_their_own_administrator_role(self):
        response = self._set_roles(self.admin_user, self.admin_user, ['member'])
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(MemberProfile.objects.get(user=self.admin_user).get_roles(), ['admin'])

    def test_administrator_can_promote_another_member(self):
        response = self._set_roles(self.admin_user, self.member_user, ['admin', 'clerk'])
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('Administrators', self.member_user.groups.values_list('name', flat=True))


class ChurchRoleRegistryTests(TestCase):
    """The hard-coded role registry, the admin tick list and full admin access."""

    def test_role_helpers_normalize_codes(self):
        """The backend role registry accepts strings or lists and drops junk."""
        from .roles import normalize_roles, parse_role_codes, role_labels, unknown_role_codes

        self.assertEqual(parse_role_codes('treasurer, clerk ,, treasurer'), ['clerk', 'treasurer'])
        self.assertEqual(unknown_role_codes(parse_role_codes(['member', 'nope'])), ['nope'])
        self.assertEqual(normalize_roles([]), ['member'])
        self.assertEqual(normalize_roles('admin, member'), ['member', 'admin'])
        self.assertEqual(role_labels(['clerk']), 'Church Clerk')

    def test_admin_form_edits_roles_as_a_tick_list(self):
        """Django admin shows the roles as checkboxes and protects the system role."""
        from .admin import MemberProfileRolesForm

        user = User.objects.create_user('form.member', 'form.member@example.com', 'MemberPass#2026')
        profile = MemberProfile.objects.create(user=user, role='clerk', roles='clerk')

        form = MemberProfileRolesForm(
            data={'user': user.pk, 'account_type': 'member', 'roles': ['clerk', 'treasurer']},
            instance=profile,
        )
        self.assertTrue(form.is_valid(), form.errors)
        saved = form.save()
        self.assertEqual(saved.roles, 'clerk, treasurer')
        self.assertEqual(saved.role, 'clerk')

        profile.roles = 'admin'
        profile.role = 'admin'
        profile.save()
        blocked = MemberProfileRolesForm(
            data={'user': user.pk, 'account_type': 'member', 'roles': ['member']},
            instance=profile,
        )
        self.assertFalse(blocked.is_valid())
        self.assertIn('system role', str(blocked.errors['roles']))

    def test_admin_change_form_shows_the_hard_coded_roles(self):
        """Superusers can see and tick the church roles from the Django admin."""
        from django.urls import reverse

        superuser = User.objects.create_superuser('root.admin', 'root@example.com', 'RootPass#2026')
        member = User.objects.create_user('render.member', 'render@example.com', 'MemberPass#2026')
        profile = MemberProfile.objects.create(user=member, role='clerk', roles='clerk')
        self.client.force_login(superuser)

        response = self.client.get(reverse('admin:members_memberprofile_change', args=[profile.pk]))
        self.assertEqual(response.status_code, 200)
        for label in ('Member', 'Church Clerk', 'Administrator'):
            self.assertContains(response, label)
        self.assertContains(response, 'type="checkbox"')

        filtered = self.client.get(reverse('admin:members_memberprofile_changelist'), {'role': 'admin'})
        self.assertEqual(filtered.status_code, 200)
        self.assertNotContains(filtered, 'render.member')

    def test_administrators_group_holds_every_members_permission(self):
        """The Administrator role is a system role: it carries full access."""
        from importlib import import_module

        from django.apps import apps as django_apps
        from django.contrib.auth.models import Group, Permission

        group, _ = Group.objects.get_or_create(name='Administrators')
        migration = import_module('members.migrations.0076_administrators_full_permissions')
        migration.grant_all_permissions(django_apps, None)

        expected = set(Permission.objects.filter(content_type__app_label='members').values_list('id', flat=True))
        self.assertTrue(expected)
        self.assertEqual(set(group.permissions.values_list('id', flat=True)), expected)


class PasswordPolicyTests(APITestCase):
    """Passwords only have to clear four rules: 8+ characters, a capital, a
    number and a symbol. A name or a common word is allowed on purpose."""

    def setUp(self):
        self.invitation = Invitation.objects.create(
            email='policy@example.com',
            first_name='Grace',
            last_name='Wanjiku',
            roles='member',
            account_type='member',
            expires_at=timezone.now() + timedelta(days=7),
        )

    def _accept(self, password, username='policy.user'):
        return self.client.post('/api/members/auth/invitation/accept/', {
            'token': str(self.invitation.raw_token),
            'username': username,
            'password': password,
            'confirm_password': password,
            'privacy_accepted': True, 'terms_accepted': True,
        }, format='json')

    def test_every_missing_requirement_is_reported(self):
        for password, expected in (
            ('Short1!', 'at least 8 characters'),
            ('alllowercase1!', 'capital letter'),
            ('NoNumbers!', 'number'),
            ('NoSymbols12', 'symbol'),
        ):
            with self.subTest(password=password):
                response = self._accept(password)
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn(expected, ' '.join(response.data['password']).lower())
        self.assertFalse(User.objects.filter(username='policy.user').exists())

    def test_the_persons_own_name_is_allowed(self):
        """The similarity rule Django ships with is deliberately not used."""
        response = self._accept('GraceWanjiku1!', username='grace.wanjiku')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(User.objects.filter(username='grace.wanjiku').exists())

    def test_common_passwords_are_allowed(self):
        response = self._accept('Password1!')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_the_api_and_django_share_one_policy(self):
        from django.contrib.auth.password_validation import validate_password
        from django.core.exceptions import ValidationError

        from .password_policy import ChurchPasswordValidator, REQUIREMENTS_TEXT

        validate_password('Ngari@2026')
        with self.assertRaises(ValidationError):
            validate_password('ngari2026')
        self.assertEqual(ChurchPasswordValidator().get_help_text(), REQUIREMENTS_TEXT)

    def test_generated_passwords_always_clear_the_policy(self):
        from .password_policy import password_is_valid
        from .views import generate_temporary_password

        for length in (8, 12, 16):
            for _ in range(50):
                self.assertTrue(password_is_valid(generate_temporary_password(length)), length)

    def test_the_console_refuses_a_weak_password_for_a_new_member(self):
        admin_user = User.objects.create_user('policy.admin', 'policy.admin@example.com', 'ChurchAdmin#2026')
        MemberProfile.objects.create(user=admin_user, role='admin', roles='admin')
        self.client.force_authenticate(user=admin_user)

        weak = self.client.post('/api/members/users/', {
            'username': 'weak.user', 'name': 'Weak User', 'email': 'weak.user@example.com',
            'password': 'weakpass',
        }, format='json')
        self.assertEqual(weak.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('password', weak.data)
        self.assertFalse(User.objects.filter(username='weak.user').exists())


class EmailBrandingTests(APITestCase):
    """Every email names the church the same way: SDA Loma Linda, Meru.

    Bodies, sentences and signatures carry the comma — 'SDA Loma Linda, Meru has
    invited you…' — while email headers (From and Subject) use the comma-free
    name, since a bare comma in a display name is an address separator.
    """

    CHURCH = 'SDA Loma Linda, Meru'
    HEADER_NAME = 'SDA Loma Linda Meru'

    def setUp(self):
        self.admin_user = User.objects.create_user('mailer.admin', 'mailer.admin@example.com', 'ChurchAdmin#2026')
        MemberProfile.objects.create(user=self.admin_user, role='admin', roles='admin', phone_number='0700000009')

    def test_invitation_email_says_who_is_inviting_them(self):
        self.client.force_authenticate(user=self.admin_user)
        with patch('members.views.send_mail') as mock_send:
            self.client.post('/api/members/invitations/', {
                'email': 'branding@example.com', 'first_name': 'Grace', 'roles': ['member'],
            }, format='json')

        subject, body = mock_send.call_args[0][0], mock_send.call_args[0][1]
        sender = mock_send.call_args[0][2]
        self.assertEqual(subject, f'You are invited to {self.HEADER_NAME}')
        self.assertIn(self.HEADER_NAME, sender)
        # Never a comma in the From display name: that is an address separator.
        self.assertNotIn(',', sender.split('<')[0])
        # Straight after "Hello Grace," the church is the one doing the inviting,
        # and the apposition its own comma opens is closed before the verb.
        greeting, first_sentence = body.split('\n\n')[:2]
        self.assertEqual(greeting, 'Hello Grace,')
        self.assertTrue(first_sentence.startswith(f'{self.CHURCH}, has invited you'), first_sentence)
        self.assertIn(f'Warm regards,\n{self.CHURCH}', body)

    def test_enrollment_email_uses_the_same_name(self):
        from .views import send_enrollment_email

        enrollment = EnrollmentRequest.objects.create(
            first_name='Grace', last_name='Wanjiku',
            email='branding2@example.com', phone_number='0700000010',
            joining_mode='membership_transfer', current_church='Another SDA Church',
            expires_at=timezone.now() + timedelta(days=2),
        )
        with patch('members.views.send_mail') as mock_send:
            send_enrollment_email(enrollment)

        subject, body = mock_send.call_args[0][0], mock_send.call_args[0][1]
        self.assertEqual(subject, f'Verify your {self.HEADER_NAME} account')
        self.assertIn(f'join {self.CHURCH} as a church account', body)
        self.assertIn(f'Warm regards,\n{self.CHURCH}', body)
        self.assertNotIn('Loma Linda SDA Church', body)

    def test_password_reset_email_uses_the_same_name(self):
        User.objects.create_user('branding.user', 'branding3@example.com', 'MemberPass#2026')
        with patch('members.views.send_mail') as mock_send:
            self.client.post('/api/members/auth/password-reset/', {'email': 'branding3@example.com'}, format='json')

        subject, body = mock_send.call_args[0][0], mock_send.call_args[0][1]
        self.assertEqual(subject, f'Reset your {self.HEADER_NAME} password')
        self.assertIn(f'your {self.HEADER_NAME} account', body)
        self.assertIn(f'Warm regards,\n{self.CHURCH}', body)

    def test_a_plain_member_invitation_does_not_mention_access(self):
        """A member carries no special access, so the email announces none.

        Only an invitation that hands out a special role says so; a member (or
        friend) is simply invited to create their own account.
        """
        self.client.force_authenticate(user=self.admin_user)
        with patch('members.views.send_mail') as mock_send:
            self.client.post('/api/members/invitations/', {
                'email': 'plain.member@example.com', 'first_name': 'Grace', 'roles': ['member'],
            }, format='json')

        body = mock_send.call_args[0][1]
        first_sentence = body.split('\n\n')[1]
        self.assertEqual(
            first_sentence,
            f'{self.CHURCH}, has invited you to create your own account as a Member.',
        )
        self.assertNotIn('access', body)

    def test_a_friend_invitation_does_not_mention_access_either(self):
        invitation = Invitation.objects.create(
            email='plain.friend@example.com', first_name='Grace',
            account_type='friend', roles='member',
            expires_at=timezone.now() + timedelta(days=2),
        )
        with patch('members.views.send_mail') as mock_send:
            send_invitation_email(invitation)

        body = mock_send.call_args[0][1]
        first_sentence = body.split('\n\n')[1]
        self.assertEqual(
            first_sentence,
            f'{self.CHURCH}, has invited you to create your own account as a Friend of SDA Loma Linda.',
        )
        self.assertNotIn('access', body)

    def test_a_special_role_invitation_still_names_its_access(self):
        self.client.force_authenticate(user=self.admin_user)
        with patch('members.views.send_mail') as mock_send:
            self.client.post('/api/members/invitations/', {
                'email': 'clerk@example.com', 'first_name': 'Grace', 'roles': ['clerk'],
            }, format='json')

        body = mock_send.call_args[0][1]
        self.assertIn(
            f'{self.CHURCH}, has invited you to create your own account as a Member '
            'with the following access: Church Clerk.',
            body,
        )

    def test_a_renamed_church_wins_over_the_default(self):
        """The office can rename the church in Church Settings without a code change."""
        from .models import ChurchSettings

        ChurchSettings.objects.create(church_name='SDA Milimani, Meru')
        self.client.force_authenticate(user=self.admin_user)
        with patch('members.views.send_mail') as mock_send:
            self.client.post('/api/members/invitations/', {
                'email': 'renamed@example.com', 'first_name': 'Grace', 'roles': ['member'],
            }, format='json')
        self.assertEqual(mock_send.call_args[0][0], 'You are invited to SDA Milimani Meru')
        self.assertIn('SDA Milimani, Meru, has invited you', mock_send.call_args[0][1])

    def test_a_name_without_a_comma_reads_as_the_subject(self):
        """A church the office names without a comma needs no closing comma."""
        from .models import ChurchSettings

        ChurchSettings.objects.create(church_name='SDA Milimani')
        self.client.force_authenticate(user=self.admin_user)
        with patch('members.views.send_mail') as mock_send:
            self.client.post('/api/members/invitations/', {
                'email': 'plain@example.com', 'first_name': 'Grace', 'roles': ['member'],
            }, format='json')
        first_sentence = mock_send.call_args[0][1].split('\n\n')[1]
        self.assertTrue(first_sentence.startswith('SDA Milimani has invited you'), first_sentence)
        self.assertEqual(mock_send.call_args[0][0], 'You are invited to SDA Milimani')


class BrandNamingTests(TestCase):
    """The church is branded 'SDA Loma Linda' — that word order, not 'Loma Linda SDA'.

    'Meru' belongs to the church's email identity ('SDA Loma Linda, Meru' in a
    sentence, 'SDA Loma Linda Meru' in a header) and stays out of the site's own
    name, so the copy reads as a church rather than as a branch.
    """

    def test_the_welcome_line_names_the_church_without_the_town(self):
        from .models import ChurchSettings

        subtext = ChurchSettings._meta.get_field('clarion_call_subtext').get_default()
        self.assertTrue(subtext.startswith('Join SDA Loma Linda '), subtext)
        self.assertNotIn('Meru', subtext)

    def test_the_church_name_default_keeps_meru_for_email(self):
        from .models import ChurchSettings
        from .views import CHURCH_DEFAULT_NAME, church_name_plain

        self.assertEqual(ChurchSettings._meta.get_field('church_name').get_default(), 'SDA Loma Linda, Meru')
        self.assertEqual(CHURCH_DEFAULT_NAME, 'SDA Loma Linda, Meru')
        self.assertEqual(church_name_plain('SDA Loma Linda, Meru'), 'SDA Loma Linda Meru')

    def test_the_friend_label_reads_sda_loma_linda(self):
        from .models import EnrollmentRequest, Invitation, MemberProfile

        self.assertEqual(dict(MemberProfile.ACCOUNT_TYPE_CHOICES)['friend'], 'Friend of SDA Loma Linda')
        self.assertEqual(dict(EnrollmentRequest.JOINING_MODE_CHOICES)['friend'], 'Friend of SDA Loma Linda')
        self.assertEqual(dict(Invitation._meta.get_field('account_type').choices)['friend'], 'Friend of SDA Loma Linda')


class AnnouncementPermissionTests(APITestCase):
    """Announcement posting is decided by the full role set, not just the primary role."""

    def _profile(self, username, roles):
        user = User.objects.create_user(username, f'{username}@example.com', 'ChurchPass#2026')
        MemberProfile.objects.create(user=user, role=roles.split(", ")[0], roles=roles)
        return user

    def test_an_elder_with_member_primary_role_can_post(self):
        """The reported bug: elders whose primary role is member were refused."""
        elder = self._profile('elder.member', 'member, elder')
        self.client.force_authenticate(elder)
        response = self.client.post('/api/members/announcements/', {
            'title': 'Board meeting', 'text': 'Sunday at 10am.', 'visibility': 'members',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_a_clerk_can_post_and_a_plain_member_cannot(self):
        clerk = self._profile('clerk.poster', 'clerk')
        self.client.force_authenticate(clerk)
        ok = self.client.post('/api/members/announcements/', {
            'title': 'Choir practice', 'text': 'Friday 4pm.', 'visibility': 'members',
        }, format='json')
        self.assertEqual(ok.status_code, status.HTTP_201_CREATED)

        member = self._profile('plain.member', 'member')
        self.client.force_authenticate(member)
        denied = self.client.post('/api/members/announcements/', {
            'title': 'Not mine', 'text': 'Should be refused.', 'visibility': 'members',
        }, format='json')
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

    def test_an_elder_can_delete_their_own_announcement(self):
        from .models import Announcement

        elder = self._profile('elder.deleter', 'member, elder')
        announcement = Announcement.objects.create(title='Temp', text='To be deleted', visibility='members')
        self.client.force_authenticate(elder)
        response = self.client.delete(f'/api/members/announcements/{announcement.pk}/')
        self.assertIn(response.status_code, (status.HTTP_204_NO_CONTENT, status.HTTP_200_OK))
        self.assertFalse(Announcement.objects.filter(pk=announcement.pk).exists())


class GenericLeaderRoleTests(TestCase):
    """The catch-all 'Church Leader' role no longer exists; holders became elders."""

    def test_the_role_registry_has_no_generic_leader(self):
        from .roles import ROLE_CODES

        self.assertNotIn('leader', ROLE_CODES)

    def test_migration_maps_leader_holders_to_elder(self):
        from importlib import import_module

        from django.apps import apps as django_apps

        migration = import_module('members.migrations.0090_retire_generic_leader_role')

        primary = MemberProfile.objects.create(user=User.objects.create_user('lead.primary', 'lp@example.com', 'ChurchPass#2026'), role='leader', roles='leader')
        mixed = MemberProfile.objects.create(user=User.objects.create_user('lead.mixed', 'lm@example.com', 'ChurchPass#2026'), role='treasurer', roles='treasurer, leader')
        migration.retire_leader_role(django_apps, None)

        primary.refresh_from_db()
        mixed.refresh_from_db()
        # Primary-only holders become elders; mixed holders keep their real
        # roles and simply drop the retired code.
        self.assertEqual(primary.role, 'elder')
        self.assertEqual(primary.roles, 'elder')
        self.assertEqual(mixed.role, 'treasurer')
        self.assertEqual(mixed.roles, 'treasurer')

    def test_the_board_roles_default_has_no_leader(self):
        from .views import is_finance_manager  # noqa: F401  (import guards against stale module state)

        settings_row = MemberProfile._meta.get_field('role')
        self.assertNotIn('leader', [code for code, _ in settings_row.choices])


class ReceiptMessageTemplateTests(TestCase):
    """The settings template is the whole receipt message, greeting included."""

    def test_the_default_message_starts_with_the_greeting(self):
        from .models import ChurchSettings

        default = ChurchSettings._meta.get_field('default_receipt_message').get_default()
        self.assertTrue(default.startswith('Dear {name}'), default)

    def test_rendered_receipt_starts_with_the_greeting_line(self):
        from .views import render_receipt_message

        rendered = render_receipt_message(
            'Dear {name},\n\nYour contribution of {amount} towards {account} has been received.',
            'Jane Doe', 'KES 1,000.00', 'Tithe',
        )
        self.assertTrue(rendered.startswith('Dear Jane Doe,'), rendered)
        self.assertIn('KES 1,000.00', rendered)
        self.assertIn('Tithe', rendered)

    def test_receipt_body_is_exactly_the_template_plus_summary_and_signature(self):
        """No hard-coded 'Dear …' prelude may be prepended by the senders."""
        import inspect

        from . import views

        for name in ('send_contribution_receipt', 'send_cash_receipt'):
            source = inspect.getsource(getattr(views, name))
            self.assertNotIn('Dear {donor_name}', source, name)


class AnnouncementPublishingTests(APITestCase):
    """Site visibility follows the sharing channels exactly, on create and edit."""

    def setUp(self):
        self.admin = User.objects.create_user('pub.admin', 'pub.admin@example.com', 'ChurchPass#2026')
        MemberProfile.objects.create(user=self.admin, role='admin', roles='admin')
        self.client.force_authenticate(self.admin)

    def test_site_channel_announcement_is_published(self):
        response = self.client.post('/api/members/announcements/', {
            'title': 'Work day', 'text': 'Sunday after service.', 'visibility': 'members',
            'sharing_option': 'site,email',
        }, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data['published'])

    def test_email_only_announcement_stays_off_the_site(self):
        response = self.client.post('/api/members/announcements/', {
            'title': 'Members only mail', 'text': 'Sent by email.', 'visibility': 'members',
            'sharing_option': 'email',
        }, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertFalse(response.data['published'])

    def test_editing_channels_updates_publishing(self):
        from .models import Announcement

        announcement = Announcement.objects.create(title='Old notice', text='Body', visibility='members', published=False)
        response = self.client.patch(f'/api/members/announcements/{announcement.pk}/', {
            'sharing_option': 'site',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        announcement.refresh_from_db()
        self.assertTrue(announcement.published)


class JoinRequestApprovalTests(APITestCase):
    """Friends (and other joiners) land in the leadership queue until approved."""

    def setUp(self):
        from django.utils import timezone

        self.elder = User.objects.create_user('join.elder', 'join.elder@example.com', 'ChurchPass#2026')
        MemberProfile.objects.create(user=self.elder, role='elder', roles='elder')
        self.plain = User.objects.create_user('join.plain', 'join.plain@example.com', 'ChurchPass#2026')
        MemberProfile.objects.create(user=self.plain, role='member', roles='member')
        self.applicant = User.objects.create_user('friend.joy', 'friend.joy@example.com', 'ChurchPass#2026')
        self.applicant.is_active = False
        self.applicant.save(update_fields=['is_active'])
        self.enrollment = EnrollmentRequest.objects.create(
            email='friend.joy@example.com',
            first_name='Joy',
            last_name='Kariuki',
            joining_mode='friend',
            current_church='SDA Kabarak',
            user=self.applicant,
            status='pending',
            expires_at=timezone.now() + timedelta(hours=48),
        )

    def test_elder_sees_join_requests_and_plain_member_does_not(self):
        self.client.force_authenticate(self.elder)
        response = self.client.get('/api/members/enrollment-requests/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

        self.client.force_authenticate(self.plain)
        response = self.client.get('/api/members/enrollment-requests/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])

    def test_approving_activates_the_account_and_notifies(self):
        from .models import ChurchNotification

        self.client.force_authenticate(self.elder)
        response = self.client.post(
            f'/api/members/enrollment-requests/{self.enrollment.pk}/decision/',
            {'status': 'approved'}, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.enrollment.refresh_from_db()
        self.applicant.refresh_from_db()
        self.assertEqual(self.enrollment.status, 'approved')
        self.assertTrue(self.applicant.is_active)
        self.assertTrue(ChurchNotification.objects.filter(user=self.applicant, title__icontains='approved').exists())

    def test_rejection_keeps_the_account_disabled(self):
        self.client.force_authenticate(self.elder)
        response = self.client.post(
            f'/api/members/enrollment-requests/{self.enrollment.pk}/decision/',
            {'status': 'rejected'}, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.enrollment.refresh_from_db()
        self.applicant.refresh_from_db()
        self.assertEqual(self.enrollment.status, 'rejected')
        self.assertFalse(self.applicant.is_active)

    def test_plain_member_cannot_decide(self):
        self.client.force_authenticate(self.plain)
        response = self.client.post(
            f'/api/members/enrollment-requests/{self.enrollment.pk}/decision/',
            {'status': 'approved'}, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.applicant.refresh_from_db()
        self.assertFalse(self.applicant.is_active)

    def test_invalid_decision_is_rejected(self):
        self.client.force_authenticate(self.elder)
        response = self.client.post(
            f'/api/members/enrollment-requests/{self.enrollment.pk}/decision/',
            {'status': 'maybe'}, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class AnnouncementBroadcastTests(APITestCase):
    """Email carries the attachment; the text length cap holds at the API."""

    def setUp(self):
        self.elder = User.objects.create_user('ann.mail', 'ann.mail@example.com', 'ChurchPass#2026')
        MemberProfile.objects.create(user=self.elder, role='elder', roles='elder')
        self.client.force_authenticate(self.elder)

    def test_email_broadcast_carries_the_attachment(self):
        from django.core import mail
        from django.core.files.uploadedfile import SimpleUploadedFile

        flyer = SimpleUploadedFile('sabbath-flyer.png', b'\x89PNG-fake-bytes', content_type='image/png')
        response = self.client.post('/api/members/announcements/', {
            'title': 'Potluck Sabbath',
            'text': 'Bring a dish to share after divine service.',
            'visibility': 'public',
            'sharing_option': 'email',
            'attachment': flyer,
        }, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(mail.outbox), 1)
        self.assertTrue(mail.outbox[0].attachments, 'the attachment must ride along on the email')
        # Django's storage deduplicates upload names with a unique suffix.
        attached_name = mail.outbox[0].attachments[0][0]
        self.assertTrue(attached_name.startswith('sabbath-flyer'), attached_name)
        self.assertTrue(attached_name.endswith('.png'), attached_name)

    def test_announcement_text_length_is_capped(self):
        response = self.client.post('/api/members/announcements/', {
            'title': 'Too long',
            'text': 'x' * 501,
            'visibility': 'public',
            'sharing_option': 'site',
        }, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        response = self.client.post('/api/members/announcements/', {
            'title': 'Just right',
            'text': 'x' * 500,
            'visibility': 'public',
            'sharing_option': 'site',
        }, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)


class AnnouncementManagementPermissionTests(APITestCase):
    """Writes need leadership (staff/superusers count); drafts stay private."""

    def setUp(self):
        from django.utils import timezone

        from .models import Announcement

        self.owner = User.objects.create_user(
            'ann.owner', 'ann.owner@example.com', 'ChurchPass#2026',
            is_staff=True, is_superuser=True,
        )
        MemberProfile.objects.create(user=self.owner, role='member', roles='member')
        self.stranger = User.objects.create_user('ann.stranger', 'ann.stranger@example.com', 'ChurchPass#2026')
        MemberProfile.objects.create(user=self.stranger, role='member', roles='member')
        self.draft = Announcement.objects.create(
            title='Draft notice', text='Not ready yet.', visibility='members', published=False,
        )

    def test_superuser_with_member_role_can_post(self):
        """The site owner's profile says 'member', but staff means admin."""
        self.client.force_authenticate(self.owner)
        response = self.client.post('/api/members/announcements/', {
            'title': 'From the owner',
            'text': 'Posted as staff.',
            'visibility': 'public',
            'sharing_option': 'site',
        }, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_plain_member_cannot_post(self):
        self.client.force_authenticate(self.stranger)
        response = self.client.post('/api/members/announcements/', {
            'title': 'Sneaky',
            'text': 'Should not land.',
            'visibility': 'public',
            'sharing_option': 'site',
        }, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonymous_cannot_edit(self):
        """Regression: AllowAny + no update guard let strangers rewrite posts."""
        response = self.client.patch(
            f'/api/members/announcements/{self.draft.pk}/',
            {'title': 'Hijacked'}, format='json',
        )
        self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))
        self.draft.refresh_from_db()
        self.assertEqual(self.draft.title, 'Draft notice')

    def test_plain_member_cannot_edit_or_delete(self):
        self.client.force_authenticate(self.stranger)
        response = self.client.patch(
            f'/api/members/announcements/{self.draft.pk}/',
            {'title': 'Hijacked'}, format='json',
        )
        self.assertIn(response.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND))
        response = self.client.delete(f'/api/members/announcements/{self.draft.pk}/')
        # Drafts are invisible to outsiders (404 is as good as 403 here).
        self.assertIn(response.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND))
        self.draft.refresh_from_db()
        self.assertEqual(self.draft.title, 'Draft notice')

    def test_plain_member_cannot_delete_published(self):
        from .models import Announcement

        post = Announcement.objects.create(
            title='Live post', text='Still here after the attempt.', visibility='public', published=True,
        )
        self.client.force_authenticate(self.stranger)
        response = self.client.delete(f'/api/members/announcements/{post.pk}/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        post.refresh_from_db()
        self.assertEqual(post.title, 'Live post')

    def test_superuser_can_delete(self):
        self.client.force_authenticate(self.owner)
        response = self.client.delete(f'/api/members/announcements/{self.draft.pk}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

    def test_unpublished_draft_hidden_from_public_detail(self):
        response = self.client.get(f'/api/members/announcements/{self.draft.pk}/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_leader_can_still_edit_draft(self):
        elder = User.objects.create_user('ann.elder2', 'ann.elder2@example.com', 'ChurchPass#2026')
        MemberProfile.objects.create(user=elder, role='elder', roles='elder')
        self.client.force_authenticate(elder)
        response = self.client.patch(
            f'/api/members/announcements/{self.draft.pk}/',
            {'title': 'Draft notice updated'}, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.draft.refresh_from_db()
        self.assertEqual(self.draft.title, 'Draft notice updated')


class ReceiptGreetingNameTests(TestCase):
    """Receipts greet the recipient's real name; 'friend' only when nobody is identifiable."""

    def _body(self, sender, obj):
        from django.core import mail

        with self.settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend'):
            sender(obj)
        return mail.outbox[-1].body

    def test_member_account_names_a_receipt_without_a_donor_name(self):
        from .views import send_contribution_receipt

        member = User.objects.create_user(
            'manason', 'manason@example.com', 'ChurchPass#2026',
            first_name='Manason', last_name='Amoko',
        )
        contribution = Contribution.objects.create(
            member=member, amount=Decimal('500.00'), purpose='Tithe',
            status='completed', donor_name='',
        )
        body = self._body(send_contribution_receipt, contribution)
        self.assertTrue(body.startswith('Dear Manason Amoko,'), body)

    def test_email_matched_account_names_an_unlinked_donor(self):
        from .views import send_contribution_receipt

        registered = User.objects.create_user(
            'william', 'onjwayo@example.com', 'ChurchPass#2026',
            first_name='William', last_name='Onjwayo',
        )
        contribution = Contribution.objects.create(
            member=None, amount=Decimal('200.00'), purpose='Tithe',
            status='completed', donor_name='', donor_email=registered.email,
        )
        body = self._body(send_contribution_receipt, contribution)
        self.assertTrue(body.startswith('Dear William Onjwayo,'), body)

    def test_phone_matched_account_names_the_donor(self):
        from .views import send_contribution_receipt

        giver = User.objects.create_user(
            'judith', 'judith@example.com', 'ChurchPass#2026',
            first_name='Judith', last_name='Ndirangu',
        )
        MemberProfile.objects.create(user=giver, phone_number='0710570874')
        contribution = Contribution.objects.create(
            member=None, amount=Decimal('150.00'), purpose='Tithe',
            status='completed', donor_name='', donor_email='gift.sender@example.com',
            phone_number='0710570874',
        )
        body = self._body(send_contribution_receipt, contribution)
        self.assertTrue(body.startswith('Dear Judith Ndirangu,'), body)

    def test_unknown_donor_keeps_the_friendly_fallback(self):
        from .views import send_contribution_receipt

        contribution = Contribution.objects.create(
            member=None, amount=Decimal('100.00'), purpose='Tithe',
            status='completed', donor_name='', donor_email='stranger@example.com',
        )
        body = self._body(send_contribution_receipt, contribution)
        self.assertTrue(body.startswith('Dear friend,'), body)

    def test_cash_receipt_greets_the_giver_matched_by_email(self):
        from .views import send_cash_receipt

        treasurer = User.objects.create_user('treasurer', 'treasurer@example.com', 'ChurchPass#2026')
        registered = User.objects.create_user(
            'jillian', 'jillian@example.com', 'ChurchPass#2026',
            first_name='Jillian', last_name='Wanjohi',
        )
        cash = CashContribution.objects.create(
            received_by=treasurer, entry_type='individual',
            amount=Decimal('50.00'), donor_name='', giver_email=registered.email,
        )
        body = self._body(send_cash_receipt, cash)
        self.assertTrue(body.startswith('Dear Jillian Wanjohi,'), body)

    def test_cash_receipt_falls_back_when_nobody_is_identifiable(self):
        from .views import send_cash_receipt

        treasurer = User.objects.create_user('treasurer2', 't2@example.com', 'ChurchPass#2026')
        cash = CashContribution.objects.create(
            received_by=treasurer, entry_type='individual',
            amount=Decimal('75.00'), donor_name='', giver_email='nobody@example.com',
        )
        body = self._body(send_cash_receipt, cash)
        self.assertTrue(body.startswith('Dear friend,'), body)


class GiverIdentityOnTheLedgerTests(APITestCase):
    """Ledgers name givers from real identity (email/phone), not 'Anonymous Giver'."""

    def setUp(self):
        self.finance = User.objects.create_user('fin.treasurer', 'fin@example.com', 'ChurchPass#2026')
        MemberProfile.objects.create(user=self.finance, role='treasurer', roles='treasurer')
        self.donor = User.objects.create_user(
            'zipporah', 'zipporah.moturi@example.com', 'ChurchPass#2026',
            first_name='Zipporah', last_name='Moturi',
        )
        MemberProfile.objects.create(user=self.donor, phone_number='0703720759')

    def _mpesa_give(self, **kwargs):
        base = dict(
            member=None, amount=Decimal('50.00'), purpose='Tithe',
            status='completed', payment_method='mpesa', donor_name='',
        )
        base.update(kwargs)
        return Contribution.objects.create(**base)

    def _ledger_names(self):
        self.client.force_authenticate(self.finance)
        response = self.client.get('/api/members/treasury/refundable-contributions/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return [row['donor_name'] for row in response.data]

    def test_ledger_names_giver_by_phone_in_254_form(self):
        self._mpesa_give(phone_number='254703720759', donor_email='')
        self.assertEqual(self._ledger_names(), ['Zipporah Moturi'])

    def test_ledger_names_giver_by_email_alone(self):
        self._mpesa_give(phone_number='', donor_email='zipporah.moturi@example.com')
        self.assertEqual(self._ledger_names(), ['Zipporah Moturi'])

    def test_unidentifiable_giver_stays_anonymous(self):
        self._mpesa_give(phone_number='254700000000', donor_email='stranger@example.com')
        self.assertEqual(self._ledger_names(), ['Anonymous Giver'])


class InKindDonorDisplayTests(TestCase):
    """In-kind donor display resolves identity before falling back to Anonymous."""

    def _row(self, **kwargs):
        from .models import InKindContribution

        base = dict(donor_name='', items='Bags of maize')
        base.update(kwargs)
        return InKindContribution.objects.create(**base)

    def test_display_resolves_phone_match_before_anonymous(self):
        from .serializers import InKindContributionSerializer

        donor = User.objects.create_user(
            'zipp.i', 'zipporah.inkind@example.com', 'ChurchPass#2026',
            first_name='Zipporah', last_name='Moturi',
        )
        MemberProfile.objects.create(user=donor, phone_number='0703720759')
        row = self._row(phone_number='254703720759')
        data = InKindContributionSerializer(row).data
        self.assertEqual(data['donor_display'], 'Zipporah Moturi')

    def test_display_falls_back_to_anonymous(self):
        from .serializers import InKindContributionSerializer

        row = self._row(items='Chairs')
        data = InKindContributionSerializer(row).data
        self.assertEqual(data['donor_display'], 'Anonymous')


class ReceiptDeliveryFeedbackTests(APITestCase):
    """A recorded receipt's feedback must say what each channel actually did."""

    def setUp(self):
        self.user = User.objects.create_user(username='treasury.feedback', password='secure-password')
        MemberProfile.objects.create(user=self.user, role='treasurer')
        self.client.force_authenticate(self.user)
        self.today = timezone.localdate()

    def _record(self, **overrides):
        payload = {
            'received_on': self.today.isoformat(),
            'amount': '250.00',
            'purpose': 'Tithe',
            'donor_name': 'Phone Giver',
            'giver_phone': '0712345678',
        }
        payload.update(overrides)
        response = self.client.post('/api/members/treasury/cash-contributions/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        return response.data['receipt_delivery_message']

    def test_phone_only_giver_is_told_the_receipt_was_not_sent(self):
        message = self._record()
        self.assertNotEqual(message, 'Receipt delivery completed.')
        self.assertTrue(message.startswith('The receipt was not sent:'))
        self.assertIn('this giver has no email address', message)
        self.assertIn('SMS is not configured', message)

    def test_email_delivery_reports_success_with_the_real_channels(self):
        message = self._record(giver_email='grace@example.com')
        self.assertEqual(message, 'Email sent; SMS was not sent because SMS is not configured.')

    def test_switched_off_channels_never_claim_success(self):
        message = self._record(send_sms='false', send_email='false')
        self.assertEqual(message, 'The receipt was not sent because no delivery channel was selected.')


class InvitationExpiryTests(APITestCase):
    """A pending invitation past its expiry reads as expired, not pending."""

    def setUp(self):
        self.admin_user = User.objects.create_user('expiry.admin', 'expiry.admin@example.com', 'ChurchAdmin#2026')
        MemberProfile.objects.create(user=self.admin_user, role='admin', roles='admin')
        self.client.force_authenticate(user=self.admin_user)

    def _invitation(self, email, **overrides):
        values = {
            'email': email,
            'first_name': 'Grace',
            'last_name': 'Wanjiku',
            'expires_at': timezone.now() + timedelta(days=7),
        }
        values.update(overrides)
        return Invitation.objects.create(**values)

    def test_listing_flips_stale_pending_rows_to_expired(self):
        stale = self._invitation('stale@example.com', expires_at=timezone.now() - timedelta(days=3))
        fresh = self._invitation('fresh@example.com')

        response = self.client.get('/api/members/invitations/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        statuses = {row['id']: row['status'] for row in response.data}
        self.assertEqual(statuses[stale.id], 'expired')
        self.assertEqual(statuses[fresh.id], 'pending')
        stale.refresh_from_db()
        self.assertEqual(stale.status, 'expired')

    def test_an_expired_invitation_can_be_resent_into_pending(self):
        stale = self._invitation('stale@example.com', expires_at=timezone.now() - timedelta(days=3))
        self.client.get('/api/members/invitations/')

        with patch('members.views.send_mail') as mock_send:
            response = self.client.post(f'/api/members/invitations/{stale.id}/', {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['email_sent'])
        mock_send.assert_called_once()
        stale.refresh_from_db()
        self.assertEqual(stale.status, 'pending')
        self.assertGreater(stale.expires_at, timezone.now())


class AnnouncementEventDatesAPITests(APITestCase):
    """Event windows date an announcement; the nearest event leads the feed."""

    def setUp(self):
        self.admin = User.objects.create_user('event.admin', 'event.admin@example.com', 'ChurchAdmin#2026')
        MemberProfile.objects.create(user=self.admin, role='admin', roles='admin')
        self.client.force_authenticate(self.admin)

    def _announcement(self, title, **dates):
        from .models import Announcement
        return Announcement.objects.create(title=title, text=f'{title} body', visibility='members', **dates)

    def test_listing_prioritises_the_event_closest_in_time(self):
        today = timezone.localdate()
        self._announcement('General notice')
        self._announcement('Happening now', event_date_from=today - timedelta(days=1), event_date_to=today + timedelta(days=1))
        self._announcement('Yesterday social', event_date_from=today - timedelta(days=1), event_date_to=today - timedelta(days=1))
        self._announcement('Next week program', event_date_from=today + timedelta(days=7), event_date_to=today + timedelta(days=7))
        self._announcement('Last month trip', event_date_from=today - timedelta(days=30), event_date_to=today - timedelta(days=30))
        self._announcement('Far camp', event_date_from=today + timedelta(days=100), event_date_to=today + timedelta(days=102))

        response = self.client.get('/api/members/announcements/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [row['title'] for row in response.data],
            ['Happening now', 'Yesterday social', 'Next week program', 'Last month trip', 'Far camp', 'General notice'],
        )

    def test_event_dates_and_link_round_trip(self):
        response = self.client.post('/api/members/announcements/', {
            'title': 'Town hall',
            'text': 'Join us for the town hall.',
            'visibility': 'members',
            'sharing_option': 'site',
            'href': 'https://meet.example.com/town-hall',
            'event_date_from': '2026-10-01',
            'event_date_to': '2026-10-02',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['href'], 'https://meet.example.com/town-hall')
        self.assertEqual(response.data['event_date_from'], '2026-10-01')
        self.assertEqual(response.data['event_date_to'], '2026-10-02')

    def test_event_window_cannot_end_before_it_starts(self):
        response = self.client.post('/api/members/announcements/', {
            'title': 'Backwards',
            'text': 'Dates the wrong way round.',
            'visibility': 'members',
            'sharing_option': 'site',
            'event_date_from': '2026-10-05',
            'event_date_to': '2026-10-01',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
