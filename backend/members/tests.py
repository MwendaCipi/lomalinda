from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase

from .views import CHILDREN_LESSON_SOURCES, YA_LESSON_URL, _WeeklyLessonParser, current_ya_lesson_url, first_children_lesson_url, send_invitation_email, GivingAccountsView


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

from .models import BoardMeeting, CashContribution, ChurchBudget, ChurchNotification, ChurchSettings, Contribution, EnrollmentRequest, Expenditure, ExternalResourceLink, FundraisingCampaign, InventoryMovement, Invitation, MemberProfile, MpesaRefund, ProfileChangeRequest, Testimony, TreasuryAccount, Announcement
from .meetings import PLACEHOLDERS, eat_greeting
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
        # The context token is signed, not encrypted, but unpacks intact. A
        # single-account gift travels as one allocation line, so the callback
        # has only one shape of context to understand.
        self.assertEqual(
            unpack_callback_context(mock_stk.call_args.kwargs['context_token']),
            {
                'amount': '100.00',
                'purpose': 'Tithe',
                'allocations': [{'purpose': 'Tithe', 'account': 'Tithe', 'amount': '100.00'}],
                'phone_number': '254712345678',
            },
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
            "name": "KCB Main",
            "account_number": "1122334455",
            "account_type": "bank",
            "balance": "50000.00",
            "description": "Primary church bank account"
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        acc1_id = response.data['id']

        response2 = self.client.post('/api/members/treasury/accounts/', {
            "name": "Paybill",
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
        for name in ('Administrators', 'Church Leaders', 'Treasury'):
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
        # `clerk` and `treasurer` are single-holder roles and setUp's clerk holds
        # `clerk`, so this assigns the free elder seat alongside the treasury.
        response = self._set_roles(self.admin_user, self.member_user, ['treasurer', 'elder'])
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        profile = MemberProfile.objects.get(user=self.member_user)
        self.assertEqual(profile.roles, 'elder, treasurer')
        self.assertEqual(profile.role, 'elder')
        self.assertEqual(
            sorted(self.member_user.groups.values_list('name', flat=True)),
            ['Church Leaders', 'Treasury'],
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
        response = self._set_roles(self.admin_user, self.member_user, ['admin', 'elder'])
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


class LiveReportsEndpointsAPITests(APITestCase):
    """The member Live Reports page's stats and feed endpoints."""

    def setUp(self):
        self.user = User.objects.create_user('live.viewer', 'live.viewer@example.com', 'MemberPass#2026')
        MemberProfile.objects.create(user=self.user, role='member', roles='member')
        self.client.force_authenticate(self.user)
        self.now = timezone.now()

    def test_live_stats_totals_only_completed_givings_per_account(self):
        Contribution.objects.create(amount='1500.00', purpose='Tithe', status='completed', paid_at=self.now, payment_method='mpesa')
        Contribution.objects.create(amount='300.00', purpose='Tithe', status='failed', paid_at=self.now, payment_method='mpesa')
        Contribution.objects.create(amount='250.00', purpose='Combined Offering', status='completed', paid_at=self.now, payment_method='mpesa')

        response = self.client.get('/api/members/contributions/live-stats/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        tithe = next(row for row in response.data if row['category'] == 'Tithe')
        self.assertEqual(tithe['total'], 1500.0)
        self.assertEqual(tithe['count'], 1)
        self.assertEqual(sum(row['total'] for row in response.data), 1750.0)

    def test_recent_feed_mixes_cash_and_digital_newest_first(self):
        Contribution.objects.create(
            amount='99.00', purpose='Tithe', status='completed',
            paid_at=self.now - timedelta(days=1), payment_method='mpesa', donor_name='Older Giver',
        )
        CashContribution.objects.create(
            received_by=self.user, amount=Decimal('50.00'), purpose='Tithe',
            received_on=timezone.localdate(), payment_method='cash', donor_name='Fresh Cash Giver',
        )

        response = self.client.get('/api/members/contributions/recent/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data[0]['donor_name'], 'Fresh Cash Giver')
        self.assertEqual(response.data[1]['donor_name'], 'Older Giver')
        self.assertIsInstance(response.data[0]['amount'], float)


class DeaconateInventoryAPITests(APITestCase):
    """The deaconate property register: real records, and movements that stick."""

    def setUp(self):
        self.elder = User.objects.create_user('deacon.elder', 'deacon.elder@example.com', 'ElderPass#2026')
        MemberProfile.objects.create(user=self.elder, role='elder', roles='elder')
        self.member = User.objects.create_user('plain.member', 'plain.member@example.com', 'MemberPass#2026')
        MemberProfile.objects.create(user=self.member, role='member', roles='member')
        self.client.force_authenticate(self.elder)

    def _register(self, **overrides):
        payload = {
            'name': 'Yamaha Digital Piano P-125',
            'tag_number': 'AV-PNO-01',
            'category': 'electronics',
            'location': 'Main Sanctuary Stage',
            'quantity': 1,
            'state': 'good',
            'notes': 'Stage instrument.',
        }
        payload.update(overrides)
        return self.client.post('/api/members/inventory/', payload, format='json')

    def test_registering_an_item_persists_it_for_the_list(self):
        created = self._register()

        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertEqual(created.data['category_display'], 'Electronics')
        self.assertEqual(created.data['state_display'], 'Good')
        self.assertEqual(created.data['movement_count'], 0)

        listed = self.client.get('/api/members/inventory/')
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertEqual(len(listed.data), 1)
        self.assertEqual(listed.data[0]['tag_number'], 'AV-PNO-01')

    def test_two_items_cannot_share_a_tag(self):
        self.assertEqual(self._register().status_code, status.HTTP_201_CREATED)
        clash = self._register(name='Second piano', tag_number='av-pno-01')
        self.assertEqual(clash.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('tag_number', clash.data)

    def test_check_out_takes_custody_and_check_in_returns_it(self):
        item_id = self._register().data['id']

        checked_out = self.client.post(f'/api/members/inventory/{item_id}/movements/', {
            'action': 'check_out',
            'moved_by': 'Head Deacon John',
            'destination': 'Fellowship Hall for Youth Rally',
            'notes': 'Returned on Sabbath morning.',
        }, format='json')

        self.assertEqual(checked_out.status_code, status.HTTP_201_CREATED)
        self.assertEqual(checked_out.data['state'], 'in_use')
        self.assertEqual(checked_out.data['assigned_to'], 'Head Deacon John')
        self.assertEqual(checked_out.data['location'], 'Fellowship Hall for Youth Rally')
        self.assertEqual(checked_out.data['movement_count'], 1)
        self.assertEqual(checked_out.data['movement']['action_display'], 'Check Out')
        self.assertEqual(InventoryMovement.objects.count(), 1)

        returned = self.client.post(f'/api/members/inventory/{item_id}/movements/', {
            'action': 'check_in',
            'moved_by': 'Head Deacon John',
        }, format='json')
        self.assertEqual(returned.status_code, status.HTTP_201_CREATED)
        self.assertEqual(returned.data['state'], 'good')
        self.assertEqual(returned.data['assigned_to'], '')
        self.assertIsNone(returned.data['checked_out_at'])
        self.assertEqual(returned.data['movement_count'], 2)

    def test_state_change_records_the_reported_condition(self):
        item_id = self._register().data['id']

        response = self.client.post(f'/api/members/inventory/{item_id}/movements/', {
            'action': 'state_change',
            'moved_by': 'Deaconess Mary',
            'state_after': 'needs_repair',
            'notes': 'Two tables have loose leg brackets.',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['state'], 'needs_repair')
        self.assertEqual(response.data['state_display'], 'Needs Repair')
        # A condition report never moves the item out of its location.
        self.assertEqual(response.data['location'], 'Main Sanctuary Stage')
        self.assertEqual(response.data['assigned_to'], '')

    def test_state_change_needs_the_new_condition(self):
        item_id = self._register().data['id']

        response = self.client.post(f'/api/members/inventory/{item_id}/movements/', {
            'action': 'state_change',
            'moved_by': 'Deaconess Mary',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('state_after', response.data)
        self.assertEqual(InventoryMovement.objects.count(), 0)

    def test_plain_members_cannot_read_or_write_the_register(self):
        self.client.force_authenticate(self.member)

        self.assertEqual(self.client.get('/api/members/inventory/').status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self._register().status_code, status.HTTP_403_FORBIDDEN)


class MemberRosterSystemAccountTests(APITestCase):
    """The member roster lists the congregation, not the deployment's owner."""

    def setUp(self):
        self.admin = User.objects.create_user('roster.admin', 'roster.admin@example.com', 'AdminPass#2026')
        MemberProfile.objects.create(user=self.admin, role='admin', roles='admin')
        self.member = User.objects.create_user('roster.member', 'roster.member@example.com', 'MemberPass#2026')
        MemberProfile.objects.create(user=self.member, role='member', roles='member')
        # The owner account: a superuser, and (like the live one) it even has a
        # member profile, which is why it used to show up as an ordinary member.
        self.owner = User.objects.create_superuser('owner.account', 'owner@example.com', 'OwnerPass#2026')
        self.owner.first_name, self.owner.last_name = 'Owner', 'Account'
        self.owner.save()
        MemberProfile.objects.create(user=self.owner, role='member', roles='member')
        self.client.force_authenticate(self.admin)

    def test_users_list_leaves_out_the_superuser_account(self):
        response = self.client.get('/api/members/users/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        usernames = [row['username'] for row in response.data]
        self.assertIn('roster.member', usernames)
        self.assertIn('roster.admin', usernames)
        self.assertNotIn('owner.account', usernames)

    def test_printed_member_roster_leaves_out_the_superuser_account(self):
        # Inspect the rows the view hands to the printer rather than the PDF
        # bytes: reportlab may compress its text, which would make a search of
        # the output pass no matter who was listed.
        with patch('members.pdf_generator.generate_member_list_pdf') as generate:
            generate.return_value = b'%PDF-1.4 roster'
            response = self.client.get('/api/members/users/list-pdf/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response['Content-Type'], 'application/pdf')
        self.assertEqual(response.content, b'%PDF-1.4 roster')
        rows = generate.call_args[0][1]
        names = [row['name'] for row in rows]
        self.assertEqual(sorted(names), ['roster.admin', 'roster.member'])
        self.assertNotIn('Owner Account', names)


class DashboardAnalyticsTests(APITestCase):
    """The dashboard's church-fund analytics: officers only, and real money only."""

    URL = '/api/members/dashboard/analytics/'

    def setUp(self):
        self.treasurer = User.objects.create_user('dash.treasurer', 'dash.treasurer@example.com', 'TreasurerPass#2026')
        MemberProfile.objects.create(user=self.treasurer, role='treasurer', roles='treasurer')
        self.member = User.objects.create_user('dash.member', 'dash.member@example.com', 'MemberPass#2026')
        MemberProfile.objects.create(user=self.member, role='member', roles='member')
        self.treasury = TreasuryAccount.objects.create(name='Main Bank', account_type='bank', balance=Decimal('1234.00'))
        self.today = timezone.localdate()
        self.client.force_authenticate(self.treasurer)

    def test_plain_members_cannot_see_the_church_financial_dashboard(self):
        self.client.force_authenticate(self.member)
        self.assertEqual(self.client.get(self.URL).status_code, status.HTTP_403_FORBIDDEN)

    def test_series_counts_completed_gifts_and_recorded_cash_only(self):
        Contribution.objects.create(amount='1000.00', purpose='Tithe', status='completed', paid_at=timezone.now(), payment_method='mpesa')
        # Money that never arrived is not income.
        Contribution.objects.create(amount='500.00', purpose='Tithe', status='pending', paid_at=timezone.now(), payment_method='mpesa')
        CashContribution.objects.create(
            received_by=self.treasurer, amount=Decimal('200.00'), purpose='Combined Offering',
            received_on=self.today, payment_method='cash',
        )

        response = self.client.get(self.URL)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['giving']['window_total'], 1200.0)
        self.assertEqual(response.data['giving']['this_month'], 1200.0)
        this_week = response.data['series'][-1]
        self.assertEqual(this_week['income'], 1200.0)
        self.assertEqual(this_week['gifts'], 2)
        self.assertEqual(
            {row['label'] for row in response.data['giving']['by_account']},
            {'Tithe', 'Combined Offering'},
        )
        methods = {row['label']: row['total'] for row in response.data['giving']['by_method']}
        self.assertEqual(methods['M-Pesa'], 1000.0)
        self.assertEqual(methods['Cash'], 200.0)

    def test_expenses_and_liquidity_share_the_same_weeks(self):
        Expenditure.objects.create(
            title='Power bill', amount=Decimal('300.00'), category='utilities',
            expenditure_date=self.today, recorded_by=self.treasurer,
        )

        response = self.client.get(self.URL)

        self.assertEqual(response.data['expenditure']['this_month'], 300.0)
        self.assertEqual(response.data['series'][-1]['expense'], 300.0)
        self.assertEqual(response.data['funds']['total_liquidity'], 1234.0)
        self.assertEqual(response.data['funds']['accounts'][0]['name'], 'Main Bank')
        self.assertEqual(response.data['expenditure']['by_category'][0]['label'], 'Utilities (Water, Power, Net)')

    def test_the_window_is_twelve_weeks_and_older_money_stays_out_of_it(self):
        Contribution.objects.create(
            amount='9999.00', purpose='Tithe', status='completed',
            paid_at=timezone.now() - timedelta(weeks=20), payment_method='mpesa',
        )

        response = self.client.get(self.URL)

        self.assertEqual(len(response.data['series']), 12)
        self.assertEqual(response.data['giving']['window_total'], 0.0)
        # The year-to-date figure still counts it.
        self.assertEqual(response.data['giving']['this_year'], 9999.0)

    def test_member_counts_leave_out_system_accounts(self):
        User.objects.create_superuser('dash.owner', 'dash.owner@example.com', 'OwnerPass#2026')

        response = self.client.get(self.URL)

        self.assertEqual(response.data['members']['total'], 2)

    def test_pending_refunds_are_reported_for_the_treasurer(self):
        gift = Contribution.objects.create(amount='400.00', purpose='Tithe', status='completed', paid_at=timezone.now(), payment_method='mpesa')
        MpesaRefund.objects.create(
            contribution=gift, amount=Decimal('150.00'), phone_number='254700000000',
            status='pending', originator_conversation_id='conv-dash-1', initiated_by=self.treasurer,
        )

        response = self.client.get(self.URL)

        self.assertEqual(response.data['pending_refunds']['count'], 1)
        self.assertEqual(response.data['pending_refunds']['amount'], 150.0)

    def test_the_window_follows_the_officers_choice_and_is_clamped(self):
        Contribution.objects.create(
            amount='700.00', purpose='Tithe', status='completed',
            paid_at=timezone.now() - timedelta(weeks=20), payment_method='mpesa',
        )

        monthly = self.client.get(self.URL, {'weeks': 26})
        self.assertEqual(len(monthly.data['series']), 26)
        self.assertEqual(monthly.data['giving']['window_total'], 700.0)
        self.assertEqual(monthly.data['window_weeks'], 26)

        # A gift three weeks back sits outside the default twelve weeks.
        Contribution.objects.create(
            amount='50.00', purpose='Tithe', status='completed',
            paid_at=timezone.now() - timedelta(weeks=3), payment_method='mpesa',
        )
        self.assertEqual(self.client.get(self.URL, {'weeks': 4}).data['giving']['window_total'], 50.0)

        # A crafted or silly window is clamped, never handed to the database raw.
        self.assertEqual(self.client.get(self.URL, {'weeks': 9999}).data['window_weeks'], 26)
        self.assertEqual(self.client.get(self.URL, {'weeks': 0}).data['window_weeks'], 4)
        self.assertEqual(self.client.get(self.URL, {'weeks': 'last-year'}).data['window_weeks'], 12)

    def test_the_window_is_compared_with_the_window_before_it(self):
        Contribution.objects.create(
            amount='300.00', purpose='Tithe', status='completed',
            paid_at=timezone.now() - timedelta(weeks=14), payment_method='mpesa',
        )
        Contribution.objects.create(amount='80.00', purpose='Tithe', status='completed', paid_at=timezone.now(), payment_method='mpesa')
        Expenditure.objects.create(
            title='Older fuel', amount=Decimal('90.00'), category='operations',
            expenditure_date=self.today - timedelta(weeks=14), recorded_by=self.treasurer,
        )

        response = self.client.get(self.URL)

        self.assertEqual(response.data['giving']['window_total'], 80.0)
        self.assertEqual(response.data['previous']['income'], 300.0)
        self.assertEqual(response.data['previous']['expense'], 90.0)
        self.assertLess(response.data['previous']['end'], response.data['window_start'])

    def test_givers_are_counted_once_each_and_anonymous_giving_is_not_a_person(self):
        for amount in ('100.00', '60.00'):
            Contribution.objects.create(
                amount=amount, purpose='Tithe', status='completed', paid_at=timezone.now(),
                payment_method='mpesa', phone_number='+254 700 111 222',
            )
        Contribution.objects.create(
            amount='40.00', purpose='Tithe', status='completed', paid_at=timezone.now(),
            payment_method='bank_transfer', donor_email='Faithful@Example.com',
        )
        # The same giver twice by email is still one giver.
        Contribution.objects.create(
            amount='10.00', purpose='Tithe', status='completed', paid_at=timezone.now(),
            payment_method='bank_transfer', donor_email='faithful@example.com',
        )
        CashContribution.objects.create(
            received_by=self.treasurer, amount=Decimal('500.00'), purpose='Combined Offering',
            received_on=self.today, payment_method='cash', entry_type='anonymous',
        )

        givers = self.client.get(self.URL).data['giving']['givers']

        self.assertEqual(givers['gifts'], 5)
        self.assertEqual(givers['givers'], 2)
        self.assertEqual(givers['average'], 142.0)
        self.assertEqual(givers['largest'], 500.0)
        self.assertEqual(givers['grouped_total'], 500.0)
        self.assertEqual(givers['last_gift_on'], self.today.isoformat())

    def test_the_month_trend_covers_a_year_and_lands_gifts_in_their_month(self):
        older = timezone.now() - timedelta(days=150)
        Contribution.objects.create(
            amount='250.00', purpose='Tithe', status='completed', paid_at=older, payment_method='mpesa',
        )
        Contribution.objects.create(amount='75.00', purpose='Tithe', status='completed', paid_at=timezone.now(), payment_method='mpesa')

        months = self.client.get(self.URL).data['monthly']

        self.assertEqual(len(months), 12)
        # The first bucket and every January carry their year, so a trend that
        # crosses into a new year is readable.
        self.assertTrue(months[0]['label'].endswith(str(self.today.year - 1)[-2:]))
        self.assertTrue(all(month['label'].endswith('26') for month in months if month['month_start'].endswith('-01-01')))
        self.assertEqual(months[-1]['month_start'], self.today.replace(day=1).isoformat())
        self.assertEqual(months[-1]['income'], 75.0)
        self.assertEqual(months[-1]['gifts'], 1)
        older_month = timezone.localtime(older).date().replace(day=1).isoformat()
        self.assertEqual(
            [month for month in months if month['month_start'] == older_month][0]['income'],
            250.0,
        )
        self.assertEqual(sum(month['income'] for month in months), 325.0)

    def test_fund_composition_and_budget_track_the_real_books(self):
        TreasuryAccount.objects.create(name='Paybill', account_type='mobile_money', balance=Decimal('500.00'))
        TreasuryAccount.objects.create(name='Petty cash', account_type='cash', balance=Decimal('100.00'))
        ChurchBudget.objects.create(year=self.today.year, total_income=Decimal('9000.00'), total_expenses=Decimal('5000.00'))
        Contribution.objects.create(amount='120.00', purpose='Tithe', status='completed', paid_at=timezone.now(), payment_method='mpesa')
        Expenditure.objects.create(
            title='Water', amount=Decimal('70.00'), category='utilities', account=self.treasury,
            expenditure_date=self.today, recorded_by=self.treasurer,
        )

        response = self.client.get(self.URL)

        composition = {row['label']: row['total'] for row in response.data['funds']['by_type']}
        self.assertEqual(composition['Bank Account'], 1234.0)
        self.assertEqual(composition['Mobile Money / Paybill'], 500.0)
        self.assertEqual(composition['Cash / Petty Cash'], 100.0)

        self.assertEqual(response.data['budget']['has_budget'], True)
        self.assertEqual(response.data['budget']['income_target'], 9000.0)
        self.assertEqual(response.data['budget']['income_actual'], 120.0)
        self.assertEqual(response.data['budget']['expense_actual'], 70.0)
        self.assertEqual(response.data['expenditure']['by_account'], [{'label': 'Main Bank', 'total': 70.0}])

    def test_a_year_without_a_budget_says_so_instead_of_inventing_one(self):
        response = self.client.get(self.URL)

        self.assertEqual(response.data['budget']['has_budget'], False)
        self.assertEqual(response.data['budget']['income_target'], 0.0)
        self.assertEqual(response.data['budget']['income_actual'], 0.0)


class AccountTypeChangeTests(APITestCase):
    """Member, friend, ex-member: one three-way choice, owned in one place.

    The Users table reads two stored fields (account_type and
    is_disfellowshipped) but the switch that changes them had no endpoint at all,
    so a person could only be recorded as a friend by creating them that way.
    """

    def setUp(self):
        self.admin = User.objects.create_user('type.admin', 'type.admin@example.com', 'AdminPass#2026')
        MemberProfile.objects.create(user=self.admin, role='admin', roles='admin')
        self.person = User.objects.create_user('type.person', 'type.person@example.com', 'PersonPass#2026')
        self.person.first_name = 'Mercy'
        self.person.save()
        MemberProfile.objects.create(user=self.person, role='member', roles='member')
        self.plain = User.objects.create_user('type.plain', 'type.plain@example.com', 'PlainPass#2026')
        MemberProfile.objects.create(user=self.plain, role='member', roles='member')
        self.owner = User.objects.create_superuser('type.owner', 'type.owner@example.com', 'OwnerPass#2026')
        self.client.force_authenticate(self.admin)

    def _set_type(self, value, user=None):
        return self.client.patch(
            f'/api/members/users/{(user or self.person).id}/account-type/',
            {'account_type': value},
            format='json',
        )

    def test_a_person_can_be_moved_through_all_three_states(self):
        friend = self._set_type('friend')
        self.assertEqual(friend.status_code, status.HTTP_200_OK)
        profile = MemberProfile.objects.get(user=self.person)
        self.assertEqual(profile.account_type, 'friend')
        self.assertFalse(profile.is_disfellowshipped)

        ex_member = self._set_type('ex_member')
        self.assertEqual(ex_member.status_code, status.HTTP_200_OK)
        profile.refresh_from_db()
        self.assertTrue(profile.is_disfellowshipped)

        back_to_member = self._set_type('member')
        self.assertEqual(back_to_member.status_code, status.HTTP_200_OK)
        profile.refresh_from_db()
        self.assertEqual(profile.account_type, 'member')
        self.assertFalse(profile.is_disfellowshipped)
        self.assertIn('is now a member', back_to_member.data['detail'])

    def test_the_three_filters_the_users_screen_offers_agree_with_the_stored_state(self):
        # The screen filters on exactly these two fields, so the endpoint has to
        # leave them in a state each filter can recognise.
        self._set_type('friend')
        listed = {row['username']: row for row in self.client.get('/api/members/users/').data}
        self.assertEqual(listed['type.person']['account_type'], 'friend')
        self.assertFalse(listed['type.person']['is_disfellowshipped'])

        self._set_type('ex_member')
        listed = {row['username']: row for row in self.client.get('/api/members/users/').data}
        self.assertTrue(listed['type.person']['is_disfellowshipped'])

    def test_shifting_to_ex_member_tells_the_person(self):
        self._set_type('ex_member')

        notice = ChurchNotification.objects.filter(user=self.person).order_by('-created_at').first()
        self.assertIsNotNone(notice)
        self.assertIn('ex-member', notice.message)

    def test_only_officers_may_change_a_type(self):
        self.client.force_authenticate(self.plain)

        response = self._set_type('friend')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(MemberProfile.objects.get(user=self.person).account_type, 'member')

    def test_an_unknown_type_is_rejected_and_nothing_changes(self):
        response = self.client.patch(
            f'/api/members/users/{self.person.id}/account-type/',
            {'account_type': 'vip'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        profile = MemberProfile.objects.get(user=self.person)
        self.assertEqual(profile.account_type, 'member')
        self.assertFalse(profile.is_disfellowshipped)

    def test_a_system_account_is_not_a_church_member(self):
        response = self._set_type('friend', user=self.owner)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class MeetingInvitationTests(APITestCase):
    """Meeting invitations: the times on the form, and the words members read."""

    URL = '/api/members/board-meetings/'

    def setUp(self):
        self.clerk = User.objects.create_user('meet.clerk', 'meet.clerk@example.com', 'ClerkPass#2026')
        MemberProfile.objects.create(user=self.clerk, role='clerk', roles='clerk')

        self.board_a = User.objects.create_user('board.a', 'board.a@example.com', 'BoardPass#2026')
        self.board_a.first_name = 'Esther'
        self.board_a.save()
        MemberProfile.objects.create(user=self.board_a, role='elder', roles='elder')

        self.board_b = User.objects.create_user('board.b', 'board.b@example.com', 'BoardPass#2026')
        self.board_b.first_name = 'Samuel'
        self.board_b.save()
        MemberProfile.objects.create(user=self.board_b, role='elder', roles='elder')

        self.settings_row = ChurchSettings.objects.create(
            church_name='SDA Loma Linda, Meru',
        )
        self.client.force_authenticate(self.clerk)

    def _schedule(self, **overrides):
        payload = {
            'title': 'Q3 Executive Board Meeting',
            'meeting_date': '2026-09-19',
            'start_time': '09:00',
            'end_time': '11:30',
            'location': 'Board Room',
            'notify_sms': 'true',
            'notify_email': 'true',
        }
        payload.update(overrides)
        with self.settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend'):
            return self.client.post(self.URL, payload, format='multipart')

    def test_a_meeting_is_saved_with_the_start_and_finish_times_the_form_collected(self):
        created = self._schedule()

        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertEqual(created.data['start_time'], '09:00:00')
        self.assertEqual(created.data['end_time'], '11:30:00')
        # Readable the way members say it, not 09:00:00.
        self.assertEqual(created.data['time_range'], '9:00 AM \u2013 11:30 AM')
        self.assertEqual(BoardMeeting.objects.get().time_range_display(), '9:00 AM \u2013 11:30 AM')

    def test_a_meeting_cannot_finish_before_it_starts(self):
        response = self._schedule(start_time='15:00', end_time='14:00')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(BoardMeeting.objects.count(), 0)

    def test_each_board_member_is_greeted_by_their_own_name(self):
        from django.core import mail

        response = self._schedule()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # One message per member, each addressed on its own: the board's
        # addresses are not put on each other's To: line. The clerk who
        # scheduled the meeting sits on the board too, so three messages.
        self.assertEqual(len(mail.outbox), 3)
        self.assertEqual(sorted(len(message.to) for message in mail.outbox), [1, 1, 1])
        bodies = {message.to[0]: message.body for message in mail.outbox}
        esther = bodies['board.a@example.com']
        samuel = bodies['board.b@example.com']

        self.assertTrue(esther.startswith(eat_greeting()))
        self.assertIn('Esther', esther)
        self.assertIn('Samuel', samuel)
        self.assertNotIn('Samuel', esther)
        self.assertNotIn('{name}', esther)
        # The day, the date and both times are filled in, not left as tokens.
        self.assertIn('Saturday', esther)
        self.assertIn('19 September 2026', esther)
        self.assertIn('9:00 AM', esther)
        self.assertIn('11:30 AM', esther)
        self.assertIn('SDA Loma Linda, Meru', esther)
        self.assertNotIn('{', esther)
        # The clerk who scheduled the meeting sits on the board too.
        self.assertEqual(response.data['invitations'], {'invited': 3, 'emailed': 3})

    def test_the_message_edited_on_the_form_is_the_one_members_receive(self):
        from django.core import mail

        self._schedule(notification_message='{greeting}, {name}. Board meets {day} at {start_time} in {location}.')

        # The clerk who scheduled the meeting sits on the board too.
        self.assertEqual(len(mail.outbox), 3)
        self.assertTrue(mail.outbox[0].body.startswith(eat_greeting()))
        self.assertIn('Board meets Saturday at 9:00 AM in Board Room.', mail.outbox[0].body)

    def test_a_stray_brace_in_the_template_no_longer_cancels_the_invitation(self):
        from django.core import mail

        # str.format() raised on this, and the broadcaster swallowed the error —
        # so one typo silently cancelled every invitation it was meant to carry.
        self.settings_row.default_board_meeting_invitation_message = 'Dear {name}, see the {agenda} { attached.'
        self.settings_row.save(update_fields=['default_board_meeting_invitation_message'])

        response = self._schedule()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        # The clerk who scheduled the meeting sits on the board too.
        self.assertEqual(len(mail.outbox), 3)
        esther = next(m for m in mail.outbox if m.to == ['board.a@example.com'])
        # Unknown tokens stay as written instead of taking the message down.
        self.assertIn('{agenda}', esther.body)
        self.assertIn('Dear Esther', esther.body)

    def test_two_accounts_sharing_one_mailbox_get_one_invitation_between_them(self):
        from django.core import mail

        # The live church board has exactly this shape: the same address on two
        # accounts, which used to mean the same invitation twice in one inbox.
        self.board_b.email = self.board_a.email
        self.board_b.save(update_fields=['email'])

        response = self._schedule()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        # Esther and Samuel share a mailbox (one email between them) and the
        # clerk who scheduled the meeting sits on the board too: 3 invited,
        # 2 emails, and an in-app notice per person.
        self.assertEqual(response.data['invitations'], {'invited': 3, 'emailed': 2})
        self.assertEqual(sorted(m.to[0] for m in mail.outbox), ['board.a@example.com', 'meet.clerk@example.com'])
        self.assertEqual(ChurchNotification.objects.count(), 3)

    def test_scheduling_without_notifying_anyone_says_so_and_sends_nothing(self):
        from django.core import mail

        response = self._schedule(notify_sms='false', notify_email='false')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['invitations'], {'invited': 0, 'emailed': 0})
        self.assertEqual(len(mail.outbox), 0)
        self.assertEqual(ChurchNotification.objects.count(), 0)

    def test_the_settings_screen_is_told_the_placeholders_rendering_supports(self):
        response = self.client.get('/api/members/church-settings/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        tokens = [row['token'] for row in response.data['invitation_placeholders']]
        self.assertEqual(tokens, [f'{{{name}}}' for name, _help in PLACEHOLDERS])
        self.assertIn('{greeting}', tokens)
        self.assertTrue(all(row['description'] for row in response.data['invitation_placeholders']))


class SplitGivingTests(APITestCase):
    """One payment, several accounts.

    A giver can tick Tithe and Building Fund on the same form and enter an amount
    against each. Safaricom is asked once, for the total, and the church records
    the money as one line per account so every fund total stays right.
    """

    INITIATE_URL = '/api/members/contributions/initiate/'
    CALLBACK_URL = '/api/members/payments/mpesa/callback/'

    def _callback_payload(self, result_code=0, checkout_id='ws_CO_SPLIT'):
        payload = {
            'Body': {
                'stkCallback': {
                    'MerchantRequestID': '29115-34620561-9',
                    'CheckoutRequestID': checkout_id,
                    'ResultCode': result_code,
                }
            }
        }
        if result_code == 0:
            payload['Body']['stkCallback']['CallbackMetadata'] = {
                'Item': [
                    {'Name': 'Amount', 'Value': 1500.00},
                    {'Name': 'MpesaReceiptNumber', 'Value': 'SPL1T0001'},
                    {'Name': 'PhoneNumber', 'Value': 254712345678},
                    {'Name': 'FirstName', 'Value': 'Esther'},
                ]
            }
        return payload

    def _post_callback(self, context, result_code=0):
        token = pack_callback_context(context)
        return self.client.post(f'{self.CALLBACK_URL}?ctx={token}', self._callback_payload(result_code), format='json')

    def test_bank_giving_to_two_accounts_is_recorded_as_two_lines(self):
        response = self.client.post(self.INITIATE_URL, {
            'giving_type': 'financial',
            'payment_method': 'bank_transfer',
            'allocations': [
                {'purpose': 'Tithe', 'amount': '500.00'},
                {'purpose': 'Building Fund', 'amount': '1000.00'},
            ],
            'phone_number': '',
            'donor_name': 'Kennedy Owuor',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(response.data['contribution_ids']), 2)
        lines = {row.purpose: row for row in Contribution.objects.all()}
        self.assertEqual(lines['Tithe'].amount, Decimal('500.00'))
        self.assertEqual(lines['Building Fund'].amount, Decimal('1000.00'))
        self.assertEqual(lines['Tithe'].status, 'completed')
        # Both lines belong to the same payment, so the split can be seen as one.
        self.assertIsNotNone(lines['Tithe'].payment_group)
        self.assertEqual(lines['Tithe'].payment_group, lines['Building Fund'].payment_group)
        # Each account line can be receipted against its own amount.
        self.assertNotEqual(lines['Tithe'].mpesa_receipt_number, lines['Building Fund'].mpesa_receipt_number)

    def test_a_one_account_body_still_records_one_line_without_a_group(self):
        # Older clients (and installed PWAs mid-update) post amount + purpose.
        response = self.client.post(self.INITIATE_URL, {
            'giving_type': 'financial',
            'payment_method': 'bank_transfer',
            'amount': '700.00',
            'purpose': 'Tithe',
            'phone_number': '',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Contribution.objects.count(), 1)
        contribution = Contribution.objects.get()
        self.assertEqual(contribution.purpose, 'Tithe')
        self.assertEqual(contribution.amount, Decimal('700.00'))
        self.assertIsNone(contribution.payment_group)

    def test_the_same_account_cannot_be_chosen_twice(self):
        response = self.client.post(self.INITIATE_URL, {
            'giving_type': 'financial',
            'payment_method': 'bank_transfer',
            'allocations': [
                {'purpose': 'Tithe', 'amount': '500.00'},
                {'purpose': 'tithe', 'amount': '300.00'},
            ],
            'phone_number': '',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('chosen twice', str(response.data))
        self.assertEqual(Contribution.objects.count(), 0)

    def test_an_account_line_without_money_is_rejected(self):
        response = self.client.post(self.INITIATE_URL, {
            'giving_type': 'financial',
            'payment_method': 'bank_transfer',
            'allocations': [
                {'purpose': 'Tithe', 'amount': '500.00'},
                {'purpose': 'Building Fund', 'amount': '0'},
            ],
            'phone_number': '',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Contribution.objects.count(), 0)

    @patch('members.views.initiate_stk_push_for_context')
    def test_mpesa_asks_for_the_total_once_and_carries_the_split(self, mock_stk):
        mock_stk.return_value = {'CustomerMessage': 'Prompt sent.'}

        response = self.client.post(self.INITIATE_URL, {
            'giving_type': 'financial',
            'payment_method': 'mpesa',
            'allocations': [
                {'purpose': 'Tithe', 'amount': '500.00'},
                {'purpose': 'Building Fund', 'amount': '1000.00'},
            ],
            'phone_number': '0712345678',
            'donor_name': 'Esther Wanjiru',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # One prompt, for the whole gift — not one per account.
        mock_stk.assert_called_once()
        self.assertEqual(Decimal(str(mock_stk.call_args.kwargs['amount'])), Decimal('1500.00'))
        # Nothing is written before the money arrives.
        self.assertEqual(Contribution.objects.count(), 0)

        context = unpack_callback_context(mock_stk.call_args.kwargs['context_token'])
        self.assertEqual(
            context['allocations'],
            [
                {'purpose': 'Tithe', 'account': 'Tithe', 'amount': '500.00'},
                {'purpose': 'Building Fund', 'account': 'Building Fun', 'amount': '1000.00'},
            ],
        )
        self.assertEqual(context['amount'], '1500.00')

    def test_the_callback_credits_each_account_from_one_receipt(self):
        context = {
            'amount': '1500.00',
            'purpose': '2 accounts',
            'allocations': [
                {'purpose': 'Tithe', 'amount': '500.00'},
                {'purpose': 'Building Fund', 'amount': '1000.00'},
            ],
            'phone_number': '254712345678',
        }
        response = self._post_callback(context)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        lines = {row.purpose: row for row in Contribution.objects.all()}
        self.assertEqual(sorted(lines), ['Building Fund', 'Tithe'])
        self.assertEqual(lines['Tithe'].amount, Decimal('500.00'))
        self.assertEqual(lines['Building Fund'].amount, Decimal('1000.00'))
        # One Safaricom receipt, two ledger lines, and the lines add up to what
        # the M-Pesa statement shows for that code.
        self.assertEqual(lines['Tithe'].mpesa_receipt_number, 'SPL1T0001')
        self.assertEqual(lines['Building Fund'].mpesa_receipt_number, 'SPL1T0001')
        self.assertEqual(lines['Tithe'].payment_group, lines['Building Fund'].payment_group)
        self.assertEqual(
            sum(row.amount for row in lines.values()) + Decimal('0'),
            Decimal('1500.00'),
        )
        self.assertTrue(all(row.status == 'completed' for row in lines.values()))
        self.assertTrue(all(row.paid_at for row in lines.values()))

    def test_a_split_prompt_that_fails_leaves_one_line_per_account(self):
        context = {
            'amount': '1500.00',
            'purpose': '2 accounts',
            'allocations': [
                {'purpose': 'Tithe', 'amount': '500.00'},
                {'purpose': 'Building Fund', 'amount': '1000.00'},
            ],
            'phone_number': '254712345678',
        }
        response = self._post_callback(context, result_code=1032)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        attempts = list(Contribution.objects.all())
        self.assertEqual(len(attempts), 2)
        self.assertTrue(all(row.status == 'failed' for row in attempts))
        self.assertEqual(sum(row.amount for row in attempts), Decimal('1500.00'))
        self.assertTrue(all(row.mpesa_receipt_number is None for row in attempts))

    def test_a_retried_split_callback_is_not_recorded_twice(self):
        context = {
            'amount': '1500.00',
            'purpose': '2 accounts',
            'allocations': [
                {'purpose': 'Tithe', 'amount': '500.00'},
                {'purpose': 'Building Fund', 'amount': '1000.00'},
            ],
            'phone_number': '254712345678',
        }
        self._post_callback(context)
        self._post_callback(context)

        self.assertEqual(Contribution.objects.count(), 2)

    def test_a_context_signed_before_splits_is_still_recorded(self):
        # A push sent moments before a deploy carries no allocations list.
        response = self._post_callback({
            'amount': '250.00', 'purpose': 'Tithe', 'phone_number': '254712345678',
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        contribution = Contribution.objects.get()
        self.assertEqual(contribution.purpose, 'Tithe')
        self.assertEqual(contribution.amount, Decimal('250.00'))
        self.assertIsNone(contribution.payment_group)


class DashboardGreetingLineTests(APITestCase):
    """The dashboard's line of encouragement is the church's own, and short."""

    URL = '/api/members/church-settings/'

    def setUp(self):
        self.admin = User.objects.create_user('greet.admin', 'greet.admin@example.com', 'AdminPass#2026')
        MemberProfile.objects.create(user=self.admin, role='admin', roles='admin')
        ChurchSettings.objects.create(church_name='SDA Loma Linda, Meru')

    def test_the_shipped_default_is_a_line_a_church_would_actually_say(self):
        response = self.client.get(self.URL)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['dashboard_encouragement_line'], 'Jesus is coming again.')

    def test_the_church_can_rewrite_it_and_members_read_the_new_wording(self):
        self.client.force_authenticate(self.admin)

        saved = self.client.patch(self.URL, {'dashboard_encouragement_line': 'God is faithful.'}, format='json')

        self.assertEqual(saved.status_code, status.HTTP_200_OK)
        self.assertEqual(saved.data['dashboard_encouragement_line'], 'God is faithful.')
        # The dashboard reads it anonymously, like the rest of the greeting copy.
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(self.URL).data['dashboard_encouragement_line'], 'God is faithful.')

    def test_a_paragraph_is_refused_because_it_would_not_fit(self):
        self.client.force_authenticate(self.admin)

        response = self.client.patch(
            self.URL,
            {'dashboard_encouragement_line': 'Blessed Sabbath to every member of the household of faith ' * 4},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(ChurchSettings.objects.get().dashboard_encouragement_line, 'Jesus is coming again.')


class ReceiptAddressEnforcementTests(APITestCase):
    """A gift receipt may only go to the signed-in giver's own account email.

    The Give form hides the email field from signed-out givers and locks it for
    members, but that was a form rule: the endpoint believed whatever address a
    request named, so a crafted call could ask the church to email a receipt
    into someone else's inbox. The address is now read from the account, which
    is the only place it can be verified.
    """

    URL = '/api/members/contributions/initiate/'

    def _gift(self, **overrides):
        payload = {
            'giving_type': 'financial',
            'payment_method': 'bank_transfer',
            'amount': '500.00',
            'purpose': 'Tithe',
            'phone_number': '',
        }
        payload.update(overrides)
        return self.client.post(self.URL, payload, format='json')

    def test_a_member_receipt_ignores_an_address_named_in_the_request(self):
        member = User.objects.create_user('receipt.owner', 'owner@example.com', 'ChurchPass#2026')
        self.client.force_authenticate(member)

        response = self._gift(donor_email='someone.else@example.com')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        contribution = Contribution.objects.get()
        self.assertEqual(contribution.member, member)
        self.assertEqual(contribution.donor_email, 'owner@example.com')

    def test_the_receipt_lands_in_the_members_own_inbox(self):
        from django.core import mail

        member = User.objects.create_user('receipt.inbox', 'inbox@example.com', 'ChurchPass#2026')
        self.client.force_authenticate(member)

        with self.settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend'):
            self._gift(donor_email='someone.else@example.com')

        self.assertEqual(mail.outbox[-1].to, ['inbox@example.com'])

    def test_a_member_without_an_account_email_gets_no_receipt_address(self):
        member = User.objects.create_user('receipt.nomail', '', 'ChurchPass#2026')
        self.client.force_authenticate(member)

        response = self._gift(donor_email='typed.in@example.com')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Contribution.objects.get().donor_email, '')

    def test_a_signed_out_giver_cannot_route_a_receipt(self):
        response = self._gift(donor_email='stranger@example.com')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        contribution = Contribution.objects.get()
        self.assertIsNone(contribution.member)
        self.assertEqual(contribution.donor_email, '')

    @patch('members.views.initiate_stk_push_for_context')
    def test_the_prompt_carries_the_account_address_and_the_member(self, mock_stk):
        mock_stk.return_value = {'CustomerMessage': 'Prompt sent.'}
        member = User.objects.create_user('receipt.prompt', 'prompt@example.com', 'ChurchPass#2026')
        self.client.force_authenticate(member)

        response = self._gift(
            payment_method='mpesa', phone_number='0712345678',
            donor_email='someone.else@example.com',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        context = unpack_callback_context(mock_stk.call_args.kwargs['context_token'])
        self.assertEqual(context['donor_email'], 'prompt@example.com')
        self.assertEqual(context['member_id'], member.pk)

    @patch('members.views.initiate_stk_push_for_context')
    def test_a_signed_out_prompt_carries_no_address_at_all(self, mock_stk):
        mock_stk.return_value = {'CustomerMessage': 'Prompt sent.'}

        response = self._gift(
            payment_method='mpesa', phone_number='0712345678',
            donor_email='stranger@example.com',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        context = unpack_callback_context(mock_stk.call_args.kwargs['context_token'])
        self.assertNotIn('donor_email', context)
        self.assertNotIn('member_id', context)


class MemberEmailFromTheGivingFormTests(APITestCase):
    """A member can set or correct the email on their own account.

    Receipts are addressed from the account (see the receipt-address tests), so
    a member whose account had no address could never receive one. The giving
    form now offers that single field, and it writes to the account — which is
    why the gift that follows is receipted at the new address.
    """

    ME_URL = '/api/members/me/'
    GIVE_URL = '/api/members/contributions/initiate/'

    def test_a_member_adds_the_email_their_account_was_missing(self):
        member = User.objects.create_user('adding.member', '', 'ChurchPass#2026')
        self.client.force_authenticate(member)

        response = self.client.patch(self.ME_URL, {'email': 'added@example.com'}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['email'], 'added@example.com')
        member.refresh_from_db()
        self.assertEqual(member.email, 'added@example.com')

    def test_a_malformed_address_is_refused_and_nothing_changes(self):
        member = User.objects.create_user('careful.member', 'kept@example.com', 'ChurchPass#2026')
        self.client.force_authenticate(member)

        response = self.client.patch(self.ME_URL, {'email': 'not-an-address'}, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        member.refresh_from_db()
        self.assertEqual(member.email, 'kept@example.com')

    def test_only_the_email_changes_and_only_on_the_members_own_account(self):
        member = User.objects.create_user('narrow.member', 'old@example.com', 'ChurchPass#2026')
        other = User.objects.create_user('untouched.member', 'other@example.com', 'ChurchPass#2026')
        self.client.force_authenticate(member)

        response = self.client.patch(
            self.ME_URL,
            {'email': 'new@example.com', 'username': 'hijacked', 'first_name': 'Not', 'is_staff': True},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        member.refresh_from_db()
        other.refresh_from_db()
        self.assertEqual(member.email, 'new@example.com')
        self.assertEqual(member.username, 'narrow.member')
        self.assertEqual(member.first_name, '')
        self.assertFalse(member.is_staff)
        self.assertEqual(other.email, 'other@example.com')

    def test_signed_out_givers_cannot_write_to_an_account(self):
        response = self.client.patch(self.ME_URL, {'email': 'someone@example.com'}, format='json')

        self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_the_next_gift_is_receipted_at_the_address_just_saved(self):
        member = User.objects.create_user('newly.receipted', '', 'ChurchPass#2026')
        self.client.force_authenticate(member)

        self.client.patch(self.ME_URL, {'email': 'fresh@example.com'}, format='json')
        gift = self.client.post(self.GIVE_URL, {
            'giving_type': 'financial',
            'payment_method': 'bank_transfer',
            'amount': '300.00',
            'purpose': 'Tithe',
            'phone_number': '',
            'donor_email': 'somewhere.else@example.com',
        }, format='json')

        self.assertEqual(gift.status_code, status.HTTP_201_CREATED)
        contribution = Contribution.objects.get()
        self.assertEqual(contribution.donor_email, 'fresh@example.com')

    def test_clearing_the_address_means_sms_only_and_the_account_keeps_nothing(self):
        member = User.objects.create_user('sms.only', 'unwanted@example.com', 'ChurchPass#2026')
        self.client.force_authenticate(member)

        response = self.client.patch(self.ME_URL, {'email': ''}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        member.refresh_from_db()
        self.assertEqual(member.email, '')


class ChurchLegalDocumentsTests(APITestCase):
    """The church writes its own privacy policy and terms of use.

    The two public pages carry built-in wording; these fields are where the
    church replaces it with its own, edited in church settings like every other
    piece of church copy.
    """

    URL = '/api/members/church-settings/'

    def setUp(self):
        self.admin = User.objects.create_user('legal.admin', 'legal.admin@example.com', 'AdminPass#2026')
        MemberProfile.objects.create(user=self.admin, role='admin', roles='admin')
        ChurchSettings.objects.create(church_name='SDA Loma Linda, Meru')

    def test_the_documents_start_empty_and_are_readable_anonymously(self):
        response = self.client.get(self.URL)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['privacy_policy'], '')
        self.assertEqual(response.data['terms_of_use'], '')

    def test_the_church_writes_both_documents_and_the_public_api_serves_them(self):
        self.client.force_authenticate(self.admin)
        saved = self.client.patch(self.URL, {
            'privacy_policy': 'We keep what you give us, and nothing more.',
            'terms_of_use': 'Give cheerfully, and treat each other kindly.',
        }, format='json')

        self.assertEqual(saved.status_code, status.HTTP_200_OK)
        # The pages read the settings anonymously, like the rest of the copy.
        self.client.force_authenticate(None)
        public = self.client.get(self.URL)
        self.assertEqual(public.data['privacy_policy'], 'We keep what you give us, and nothing more.')
        self.assertEqual(public.data['terms_of_use'], 'Give cheerfully, and treat each other kindly.')

    def test_an_empty_box_clears_a_document_back_to_the_builtin_wording(self):
        self.client.force_authenticate(self.admin)
        self.client.patch(self.URL, {'privacy_policy': 'A first attempt.'}, format='json')

        cleared = self.client.patch(self.URL, {'privacy_policy': ''}, format='json')

        self.assertEqual(cleared.status_code, status.HTTP_200_OK)
        self.assertEqual(ChurchSettings.objects.get().privacy_policy, '')


class GivingAccountsFromTreasuryTests(APITestCase):
    """Treasury accounts are the giving form's one source of accounts.

    The separate giving-purpose list is retired: the form reads
    /giving-accounts/, which serves the treasury accounts in the church's
    priority order with both wordings — the description givers read, and the
    12-character account name Safaricom shows in the prompt.
    """

    URL = '/api/members/giving-accounts/'

    def test_priority_order_leads_with_tithe_offering_budget_then_camp(self):
        TreasuryAccount.objects.create(name='Choir', description='Choir Fund')
        TreasuryAccount.objects.create(name='Camporee', description='Camporee 2026')
        TreasuryAccount.objects.create(name='LCB', description='Local Church Budget')
        TreasuryAccount.objects.create(name='Combined', description='Combined Offering')
        TreasuryAccount.objects.create(name='Tithe', description='Tithe')

        rows = GivingAccountsView().get(self._dummy_request()).data

        labels = [row['label'] for row in rows]
        self.assertEqual(labels[:3], ['Tithe', 'Combined Offering', 'Local Church Budget'])
        self.assertEqual(labels[3], 'Camporee 2026')
        self.assertEqual(labels[-1], 'Choir Fund')

    def _dummy_request(self):
        from rest_framework.test import APIRequestFactory
        return APIRequestFactory().get(self.URL)

    def test_each_account_carries_both_wordings(self):
        TreasuryAccount.objects.create(name='Tithe', description='Tithe — returning to God')

        rows = GivingAccountsView().get(self._dummy_request()).data

        self.assertEqual(rows[0]['account'], 'Tithe')
        self.assertEqual(rows[0]['label'], 'Tithe — returning to God')

    def test_a_missing_description_defaults_to_the_account_name(self):
        TreasuryAccount.objects.create(name='Rent', description='')

        rows = GivingAccountsView().get(self._dummy_request()).data

        self.assertEqual(rows[0]['label'], 'Rent')

    def test_a_name_past_safaricoms_twelve_characters_is_refused(self):
        self._sign_in_finance()
        response = self.client.post('/api/members/treasury/accounts/', {
            'name': 'Adventist Men Ministry',
            'account_type': 'bank',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('12 characters', str(response.data))
        self.assertEqual(TreasuryAccount.objects.count(), 0)

    def test_a_name_at_the_cap_is_accepted_and_the_prompt_shows_it(self):
        self._sign_in_finance()
        response = self.client.post('/api/members/treasury/accounts/', {
            'name': 'AdventistMen',
            'account_type': 'bank',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        account = TreasuryAccount.objects.get()
        self.assertEqual(account.name, 'AdventistMen')
        # The description defaults from the name, so the form still reads it.
        self.assertEqual(account.description, 'AdventistMen')
        # And the M-Pesa push uses the short name as the reference.
        from .mpesa import account_reference_for_purpose
        self.assertEqual(account_reference_for_purpose(account.name), 'ADVENTISTMEN')

    def test_an_empty_name_is_refused(self):
        self._sign_in_finance()
        response = self.client.post('/api/members/treasury/accounts/', {
            'name': '   ',
            'account_type': 'bank',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def _sign_in_finance(self):
        treasurer = User.objects.create_user('giving.finance', 'gf@example.com', 'ChurchPass#2026')
        MemberProfile.objects.create(user=treasurer, role='treasurer', roles='treasurer')
        self.client.force_authenticate(treasurer)

    def test_giving_purposes_endpoint_is_gone(self):
        # The legacy purposes list was retired with its model: the giving form
        # and every newer client read /giving-accounts/, fed by treasury
        # accounts. The old endpoint must not linger half-alive.
        response = self.client.get('/api/members/giving-purposes/')

        self.assertEqual(response.status_code, 404)


class FundDriveAnnouncementsTests(APITestCase):
    """A fund drive appears in the announcements feed with its own numbers.

    Members see drives and announcements in one feed; a drive's card carries
    Give now / Pledge affordances because the API marks it as a fund drive and
    includes the drive's target, total and deadline.
    """

    URL = '/api/members/announcements/'

    def _clerk(self, name='drive.announcer'):
        user = User.objects.create_user(name, f'{name}@example.com', 'ChurchPass#2026')
        MemberProfile.objects.create(user=user, role='clerk', roles='clerk')
        return user

    def test_a_drive_backed_announcement_reports_itself_as_a_fund_drive(self):
        self.client.force_authenticate(self._clerk())
        campaign = FundraisingCampaign.objects.create(name='Camp Drive', target_amount=Decimal('50000.00'))
        response = self.client.post(self.URL, {
            'title': 'Camp Drive',
            'text': 'Help our young people reach camp.',
            'visibility': 'members',
            'campaign': campaign.id,
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['kind'], 'fund_drive')
        self.assertEqual(response.data['fund_drive']['name'], 'Camp Drive')
        self.assertEqual(Decimal(str(response.data['fund_drive']['target_amount'])), Decimal('50000.00'))
        announcement = Announcement.objects.get()
        self.assertEqual(announcement.campaign_id, campaign.id)

    def test_an_ordinary_announcement_has_no_drive(self):
        self.client.force_authenticate(self._clerk('plain.announcer'))
        response = self.client.post(self.URL, {
            'title': 'Choir practice moves',
            'text': 'Practice now meets on Thursday.',
            'visibility': 'members',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['kind'], 'announcement')
        self.assertIsNone(response.data['fund_drive'])

    def test_a_member_still_cannot_post_announcements_even_with_a_drive(self):
        member = User.objects.create_user('drive.member', 'dm@example.com', 'ChurchPass#2026')
        campaign = FundraisingCampaign.objects.create(name='Roof Fund', target_amount=Decimal('100000.00'))
        self.client.force_authenticate(member)
        response = self.client.post(self.URL, {
            'title': 'Roof Fund',
            'text': 'The roof fund drive continues.',
            'visibility': 'members',
            'campaign': campaign.id,
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(Announcement.objects.count(), 0)


class ProfileChangeApprovalTests(APITestCase):
    """An admin's profile edit waits for the member's own approval.

    The profile is the church's record of a person, and that person vouches
    for it: a clerk's edit parks as a proposal, the member is notified, and
    the record only moves when the member approves it.
    """

    def _clerk(self, name='approval.clerk'):
        user = User.objects.create_user(name, f'{name}@example.com', 'ChurchPass#2026')
        MemberProfile.objects.create(user=user, role='clerk', roles='clerk')
        return user

    def _member(self, name='approval.member', **profile_kwargs):
        user = User.objects.create_user(name, f'{name}@example.com', 'ChurchPass#2026', first_name='Jane')
        MemberProfile.objects.create(user=user, role='member', roles='member', phone_number='0710000001', **profile_kwargs)
        return user

    def test_editing_a_profile_parks_a_proposal_and_leaves_the_record_alone(self):
        self.client.force_authenticate(self._clerk())
        member = self._member()

        response = self.client.patch(f'/api/members/users/{member.id}/', {
            'phone_number': '0722000002',
            'profession': 'Carpenter',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        member.profile = MemberProfile.objects.get(user=member)
        self.assertEqual(member.profile.phone_number, '0710000001')
        proposal = ProfileChangeRequest.objects.get()
        self.assertEqual(proposal.status, 'pending')
        self.assertEqual(proposal.changes, {'phone_number': '0722000002', 'profession': 'Carpenter'})
        self.assertEqual(proposal.proposed_by.username, 'approval.clerk')
        # The member was told.
        self.assertTrue(ChurchNotification.objects.filter(user=member, title__icontains='proposed').exists())

    def test_the_member_approving_applies_the_proposed_values(self):
        self.client.force_authenticate(self._clerk())
        member = self._member()
        self.client.patch(f'/api/members/users/{member.id}/', {'phone_number': '0722000002'}, format='json')
        self.client.force_authenticate(member)

        response = self.client.post('/api/members/me/profile-changes/decide/', {'decision': 'approve'}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        member.refresh_from_db()
        profile = MemberProfile.objects.get(user=member)
        self.assertEqual(profile.phone_number, '0722000002')
        proposal = ProfileChangeRequest.objects.get()
        self.assertEqual(proposal.status, 'approved')
        self.assertIsNotNone(proposal.decided_at)

    def test_the_member_keeping_their_details_changes_nothing(self):
        self.client.force_authenticate(self._clerk())
        member = self._member()
        self.client.patch(f'/api/members/users/{member.id}/', {'phone_number': '0722000002'}, format='json')
        self.client.force_authenticate(member)

        response = self.client.post('/api/members/me/profile-changes/decide/', {'decision': 'keep'}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        profile = MemberProfile.objects.get(user=member)
        self.assertEqual(profile.phone_number, '0710000001')
        self.assertEqual(ProfileChangeRequest.objects.get().status, 'kept')

    def test_only_the_member_can_decide_their_own_proposal(self):
        self.client.force_authenticate(self._clerk())
        member = self._member()
        self.client.patch(f'/api/members/users/{member.id}/', {'phone_number': '0722000002'}, format='json')

        other = self._member('approval.other')
        self.client.force_authenticate(other)
        response = self.client.post('/api/members/me/profile-changes/decide/', {'decision': 'approve'}, format='json')

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(MemberProfile.objects.get(user=member).phone_number, '0710000001')

    def test_account_fields_land_on_the_account_when_approved(self):
        self.client.force_authenticate(self._clerk())
        member = self._member()
        self.client.patch(f'/api/members/users/{member.id}/', {'first_name': 'Janet'}, format='json')
        self.client.force_authenticate(member)

        self.client.post('/api/members/me/profile-changes/decide/', {'decision': 'approve'}, format='json')

        member.refresh_from_db()
        self.assertEqual(member.first_name, 'Janet')

    def test_an_unchanged_profile_edit_applies_nothing_and_proposes_nothing(self):
        self.client.force_authenticate(self._clerk())
        member = self._member()

        response = self.client.patch(f'/api/members/users/{member.id}/', {'phone_number': '0710000001'}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(ProfileChangeRequest.objects.count(), 0)

    def test_the_member_sees_their_pending_proposal(self):
        self.client.force_authenticate(self._clerk())
        member = self._member()
        self.client.patch(f'/api/members/users/{member.id}/', {'phone_number': '0722000002'}, format='json')
        self.client.force_authenticate(member)

        response = self.client.get('/api/members/me/profile-changes/')

        self.assertTrue(response.data['pending'])
        self.assertEqual(response.data['change_request']['changes'], {'phone_number': '0722000002'})
        self.assertEqual(response.data['change_request']['proposed_by_name'], 'approval.clerk')

    def test_role_changes_still_apply_immediately(self):
        self.client.force_authenticate(self._clerk())
        member = self._member()

        response = self.client.patch(f'/api/members/users/{member.id}/', {'roles': ['elder']}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(MemberProfile.objects.get(user=member).get_roles(), ['elder'])
        self.assertEqual(ProfileChangeRequest.objects.count(), 0)

    def test_disfellowship_is_not_a_profile_edit(self):
        self.client.force_authenticate(self._clerk())
        member = self._member()

        response = self.client.patch(f'/api/members/users/{member.id}/', {'is_disfellowshipped': True}, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(ProfileChangeRequest.objects.count(), 0)


class RoleRegisterAndAssistantTests(APITestCase):
    """Shared roles, the assistant distinction, and no Finance Team.

    Roles may be held by several people at once. What stays: an assistant flag
    rides only on a role the member holds and only where the role takes one
    (the elder roles take none).
    """

    def setUp(self):
        Group.objects.get_or_create(name='Church Leaders')
        Group.objects.get_or_create(name='Treasury')
        self.admin = User.objects.create_user('roster.admin', 'roster.admin@example.com', 'ChurchAdmin#2026')
        MemberProfile.objects.create(user=self.admin, role='admin', roles='admin')
        self.first = self._member('roster.one')
        self.second = self._member('roster.two')

    def _member(self, username):
        user = User.objects.create_user(username, f'{username}@example.com', 'MemberPass#2026', first_name=username)
        MemberProfile.objects.create(user=user, role='member', roles='member')
        return user

    def _set(self, target, roles, assistants=None):
        self.client.force_authenticate(user=self.admin)
        payload = {'roles': roles}
        if assistants is not None:
            payload['assistant_roles'] = assistants
        return self.client.patch(f'/api/members/users/{target.pk}/role/', payload, format='json')

    def _register(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get('/api/members/roles/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return {row['code']: row for row in response.data['roles']}

    def test_the_register_lists_the_churchs_own_roles(self):
        register = self._register()
        for code in (
            'first_elder', 'second_elder', 'third_elder', 'head_deacon', 'head_deaconess',
            'pm_leader', 'chaplaincy', 'children_ministry', 'health_leader', 'ambassadors_leader',
            'education_leader', 'family_life', 'pathfinders_leader', 'adventurers_leader',
            'publishing_head', 'welfare_leader', 'interest_coordinator', 'development',
            'choir_director', 'youth_leader', 'admin',
        ):
            self.assertIn(code, register, f'{code} is missing from the role list')
        self.assertNotIn('finance', register)
        self.assertEqual(register['men_ministry']['label'], 'AMM Leader')
        self.assertEqual(register['women_ministry']['label'], 'AWM Leader')
        self.assertEqual(register['elder']['label'], 'Elder')

    def test_the_elder_roles_take_no_assistant(self):
        register = self._register()
        for code in ('elder', 'first_elder', 'second_elder', 'third_elder'):
            self.assertFalse(register[code]['assistant'], f'{code} should not take an assistant')

    def test_two_people_can_hold_the_same_role(self):
        """Roles are shared — a second holder needs no permission from the first."""
        self.assertEqual(self._set(self.first, ['first_elder']).status_code, status.HTTP_200_OK)

        response = self._set(self.second, ['first_elder'])

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(MemberProfile.objects.get(user=self.second).get_roles(), ['first_elder'])
        register = self._register()['first_elder']
        # The register still names a first holder for display.
        self.assertEqual(register['leader']['id'], self.first.id)
        self.assertEqual(register['assistants'], [])

    def test_an_assistant_may_be_named_without_any_leader(self):
        """An assistant takes the work whether or not anyone else holds the role."""
        response = self._set(self.second, ['pm_leader'], assistants=['pm_leader'])

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        profile = MemberProfile.objects.get(user=self.second)
        self.assertEqual(profile.get_roles(), ['pm_leader'])
        self.assertEqual(profile.get_assistant_roles(), ['pm_leader'])
        # A sole assistant-holder is the role's first holder for display.
        self.assertEqual(self._register()['pm_leader']['leader']['id'], self.second.id)

    def test_an_assistant_is_recorded_beside_the_leader(self):
        self._set(self.first, ['pm_leader'])

        response = self._set(self.second, ['pm_leader'], assistants=['pm_leader'])

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        profile = MemberProfile.objects.get(user=self.second)
        self.assertEqual(profile.get_roles(), ['pm_leader'])
        self.assertEqual(profile.get_assistant_roles(), ['pm_leader'])
        register = self._register()['pm_leader']
        self.assertEqual(register['leader']['id'], self.first.id)
        self.assertEqual([a['id'] for a in register['assistants']], [self.second.id])

    def test_the_elder_roles_refuse_an_assistant(self):
        self._set(self.first, ['elder'])

        response = self._set(self.second, ['elder'], assistants=['elder'])

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('does not take an assistant', response.data['detail'])

    def test_an_assistant_flag_cannot_outlive_the_role(self):
        self._set(self.first, ['pm_leader'])

        response = self._set(self.second, ['member'], assistants=['pm_leader'])

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('can only be an assistant on a role', response.data['detail'])

    def test_the_role_register_is_serialized_on_the_roster(self):
        self._set(self.first, ['head_deacon'])
        self._set(self.second, ['head_deacon'], assistants=['head_deacon'])

        response = self.client.get(f'/api/members/users/{self.second.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['roles'], ['head_deacon'])
        self.assertEqual(response.data['assistant_roles'], ['head_deacon'])

    def test_the_clerk_takes_an_assistant(self):
        """The clerk is a shared office, so a second person may assist."""
        self._set(self.first, ['clerk'])

        response = self._set(self.second, ['clerk'], assistants=['clerk'])

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        register = self._register()['clerk']
        self.assertTrue(register['assistant'])
        self.assertEqual(register['leader']['id'], self.first.id)
        self.assertEqual([a['id'] for a in register['assistants']], [self.second.id])


class BoardMembershipTests(TestCase):
    """The church board is every role holder; assistants do not sit on it."""

    def _member(self, username, roles, assistants=''):
        user = User.objects.create_user(username, f'{username}@example.com', 'ChurchPass#2026')
        MemberProfile.objects.create(user=user, role=roles.split(', ')[0], roles=roles, assistant_roles=assistants)
        return user

    def test_role_holders_are_board_members_and_plain_members_are_not(self):
        from .meetings import board_audience

        elder = self._member('board.elder', 'elder')
        member = self._member('plain.member', 'member')

        audience = board_audience()
        self.assertIn(elder, audience)
        self.assertNotIn(member, audience)

    def test_an_assistant_only_holder_is_not_invited(self):
        from .meetings import board_audience

        leader = self._member('pm.leader', 'pm_leader')
        assistant = self._member('pm.assistant', 'pm_leader', assistants='pm_leader')

        audience = board_audience()
        self.assertIn(leader, audience)
        self.assertNotIn(assistant, audience)

    def test_a_holder_with_a_mixed_role_set_is_invited(self):
        """A member whose roles mix plain and assistant holdings still sits on the board."""
        from .meetings import board_audience

        mixed = self._member('mixed.holder', 'clerk, pm_leader', assistants='pm_leader')

        self.assertIn(mixed, board_audience())


class AnnouncementRightsTests(APITestCase):
    """Posting announcements is the role's ``announcements`` right, editable in church settings."""

    def _profile(self, username, roles):
        user = User.objects.create_user(username, f'{username}@example.com', 'ChurchPass#2026')
        MemberProfile.objects.create(user=user, role=roles.split(', ')[0], roles=roles)
        return user

    def test_the_clerks_announcements_right_can_be_withdrawn(self):
        clerk = self._profile('rights.clerk', 'clerk')
        self.client.force_authenticate(clerk)
        ok = self.client.post('/api/members/announcements/', {
            'title': 'Allowed', 'text': 'Default rights allow this.', 'visibility': 'members',
        }, format='json')
        self.assertEqual(ok.status_code, status.HTTP_201_CREATED)

        settings_row, _ = ChurchSettings.objects.get_or_create(pk=1)
        settings_row.role_rights = {'clerk': ['board_invitations', 'business_invitations', 'members_admin', 'requests_admin']}
        settings_row.save()

        denied = self.client.post('/api/members/announcements/', {
            'title': 'Refused', 'text': 'The right was withdrawn.', 'visibility': 'members',
        }, format='json')
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

    def test_the_treasurer_gains_the_right_when_the_church_grants_it(self):
        treasurer = self._profile('rights.treasurer', 'treasurer')
        settings_row, _ = ChurchSettings.objects.get_or_create(pk=1)
        settings_row.role_rights = {'treasurer': ['finance', 'treasury_accounts', 'reports', 'announcements']}
        settings_row.save()

        self.client.force_authenticate(treasurer)
        ok = self.client.post('/api/members/announcements/', {
            'title': 'Granted', 'text': 'The church granted this right.', 'visibility': 'members',
        }, format='json')
        self.assertEqual(ok.status_code, status.HTTP_201_CREATED)


class FundDriveTotalTests(APITestCase):
    """The drive total is the union of its M-Pesa gifts plus its manual receipts."""

    def _drive(self, **kwargs):
        defaults = dict(name='Welfare', title='Welfare', account_name='Welfare', target_amount=Decimal('10000.00'))
        defaults.update(kwargs)
        return FundraisingCampaign.objects.create(**defaults)

    def test_mpesa_gift_and_manual_receipt_both_count(self):
        """The reported defect: a visible M-Pesa gift vanished from the total
        because the cash ledger held a bigger figure and the old code took
        max(linked, purpose-matched) across the two ledgers."""
        from members.models import CashContribution

        drive = self._drive()
        giver = User.objects.create_user('drive.giver', 'drive.giver@example.com', 'ChurchPass#2026')
        MemberProfile.objects.create(user=giver, role='member', roles='member')
        treasurer = User.objects.create_user('drive.treasurer', 'drive.treasurer@example.com', 'ChurchPass#2026')
        Contribution.objects.create(
            member=giver, amount=Decimal('300.00'), giving_type='money',
            purpose='Welfare', campaign=drive, status='completed', payment_method='mpesa',
        )
        CashContribution.objects.create(
            received_on=timezone.now().date(), amount=Decimal('4500.00'),
            purpose='Welfare', entry_type='individual', donor_name='Desk giver',
            received_by=treasurer,
        )

        response = self.client.get(f'/api/members/campaigns/{drive.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['total_raised'], 4800.0)
        self.assertEqual(response.data['donor_count'], 2)

    def test_a_gift_that_both_links_and_names_the_drive_counts_once(self):
        """Linked money and purpose-named money overlap without doubling."""
        drive = self._drive()
        giver = User.objects.create_user('drive.once', 'drive.once@example.com', 'ChurchPass#2026')
        MemberProfile.objects.create(user=giver, role='member', roles='member')
        Contribution.objects.create(
            member=giver, amount=Decimal('500.00'), giving_type='money',
            purpose='Welfare', campaign=drive, status='completed', payment_method='mpesa',
        )

        response = self.client.get(f'/api/members/campaigns/{drive.id}/')
        self.assertEqual(response.data['total_raised'], 500.0)


class SabbathSchoolAccountTypeTests(APITestCase):
    """Sabbath School attendees are their own kind of record.

    They sit between friend and member: present at church every week, on the
    roll as an account of their own, and settable from the Users table's type
    combobox like every other type.
    """

    def setUp(self):
        self.admin = User.objects.create_user('ss.admin', 'ss.admin@example.com', 'AdminPass#2026')
        MemberProfile.objects.create(user=self.admin, role='admin', roles='admin')
        self.person = User.objects.create_user('ss.person', 'ss.person@example.com', 'PersonPass#2026')
        MemberProfile.objects.create(user=self.person, role='member', roles='member')
        self.client.force_authenticate(self.admin)

    def test_a_person_can_become_a_sabbath_school_attendee(self):
        response = self.client.patch(
            f'/api/members/users/{self.person.id}/account-type/',
            {'account_type': 'sabbath_school'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        profile = MemberProfile.objects.get(user=self.person)
        self.assertEqual(profile.account_type, 'sabbath_school')
        self.assertFalse(profile.is_disfellowshipped)
        self.assertIn('Sabbath School', response.data['detail'])

    def test_the_users_list_reports_the_sabbath_school_type(self):
        MemberProfile.objects.filter(user=self.person).update(account_type='sabbath_school')

        listed = {row['username']: row for row in self.client.get('/api/members/users/').data}

        self.assertEqual(listed['ss.person']['account_type'], 'sabbath_school')


class YaLessonResolverTests(TestCase):
    """The Young Adult lesson is the InVerse series.

    Inverse serves each quarter from a JavaScript app that reads the Adventech
    content API, so this week's lesson page is resolved from that API rather
    than scraped out of the HTML shell. These tests pin the resolution rules to
    the shape that API actually returns.
    """

    QUARTERLIES = [
        {
            'id': '2026-03',
            'quarterly_group': {'name': 'Standard Adult'},
            'start_date': '27/06/2026',
            'end_date': '25/09/2026',
        },
        {
            'id': '2026-03-cq',
            'quarterly_group': {'name': 'InVerse'},
            'start_date': '28/06/2026',
            'end_date': '26/09/2026',
        },
        {
            'id': '2026-04-cq',
            'quarterly_group': {'name': 'InVerse'},
            'start_date': '27/09/2026',
            'end_date': '26/12/2026',
        },
    ]

    LESSONS = [
        {'id': '12', 'start_date': '13/09/2026', 'end_date': '19/09/2026'},
        {'id': '13', 'start_date': '20/09/2026', 'end_date': '26/09/2026'},
    ]

    def _respond_with(self, mock_get, *payloads):
        mock_get.return_value.status_code = 200
        mock_get.return_value.raise_for_status.return_value = None
        mock_get.return_value.json.side_effect = list(payloads)

    @patch('members.views.requests.get')
    def test_resolves_the_lesson_page_for_the_week_containing_today(self, mock_get):
        self._respond_with(mock_get, self.QUARTERLIES, {'quarterly': {'id': '2026-03-cq'}, 'lessons': self.LESSONS})

        with patch('members.views.timezone.localdate', return_value=date(2026, 9, 25)):
            resolved = current_ya_lesson_url()

        self.assertEqual(resolved, 'https://inverse.sspmadventist.org/en/2026-03-cq/13')

    @patch('members.views.requests.get')
    def test_picks_the_inverse_quarterly_not_the_adult_one_sharing_the_language(self, mock_get):
        """Both series sit in one list; only the InVerse quarterlies are the YA lesson."""
        self._respond_with(mock_get, self.QUARTERLIES, {'quarterly': {'id': '2026-03-cq'}, 'lessons': self.LESSONS})

        with patch('members.views.timezone.localdate', return_value=date(2026, 9, 25)):
            resolved = current_ya_lesson_url()

        self.assertEqual(mock_get.call_args_list[1][0][0], 'https://sabbath-school.adventech.io/api/v2/en/quarterlies/2026-03-cq/index.json')
        self.assertIn('/2026-03-cq/13', resolved)

    @patch('members.views.requests.get')
    def test_serves_the_quarterly_page_when_no_lesson_has_started_yet(self, mock_get):
        self._respond_with(mock_get, self.QUARTERLIES, {'quarterly': {'id': '2026-04-cq'}, 'lessons': []})

        with patch('members.views.timezone.localdate', return_value=date(2026, 9, 27)):
            resolved = current_ya_lesson_url()

        self.assertEqual(resolved, 'https://inverse.sspmadventist.org/en/2026-04-cq')

    @patch('members.views.requests.get')
    def test_falls_back_to_the_study_page_when_no_quarterly_covers_today(self, mock_get):
        self._respond_with(mock_get, self.QUARTERLIES)

        with patch('members.views.timezone.localdate', return_value=date(2026, 6, 1)):
            resolved = current_ya_lesson_url()

        self.assertEqual(resolved, YA_LESSON_URL)
        self.assertEqual(mock_get.call_count, 1)


class YaLessonWeeklyCacheTests(APITestCase):
    """The resolved lesson page is stored for its week, then resolved again.

    A flat N-day cache would outlive the lesson week it was resolved in and keep
    sending readers to the previous week's lesson, so the stored page is reused
    only inside the Sunday-to-Saturday week it belongs to.
    """

    url = '/api/members/lesson-reading/ya/'

    def _store(self, url, resolved_at):
        ExternalResourceLink.objects.create(key='ya_lesson', url=url, resolved_at=resolved_at)

    def test_sends_readers_to_the_lesson_stored_for_this_week(self):
        self._store('https://inverse.sspmadventist.org/en/2026-03-cq/13', timezone.now())

        with patch('members.views.current_ya_lesson_url') as resolver:
            response = self.client.get(self.url)

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response['Location'], 'https://inverse.sspmadventist.org/en/2026-03-cq/13')
        resolver.assert_not_called()

    def test_resolves_again_once_the_lesson_week_has_moved_on(self):
        self._store('https://inverse.sspmadventist.org/en/2026-03-cq/12', timezone.now() - timedelta(days=8))

        with patch('members.views.current_ya_lesson_url', return_value='https://inverse.sspmadventist.org/en/2026-03-cq/13'):
            response = self.client.get(self.url)

        self.assertEqual(response['Location'], 'https://inverse.sspmadventist.org/en/2026-03-cq/13')
        self.assertEqual(
            ExternalResourceLink.objects.get(key='ya_lesson').url,
            'https://inverse.sspmadventist.org/en/2026-03-cq/13',
        )

    def test_falls_back_to_the_study_page_when_the_content_api_cannot_be_reached(self):
        with patch('members.views.current_ya_lesson_url', side_effect=Exception('content API unavailable')):
            response = self.client.get(self.url)

        self.assertEqual(response['Location'], YA_LESSON_URL)
