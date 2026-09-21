from datetime import date, timedelta
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
from django.contrib.auth.models import Group, User
from django.utils import timezone

from .models import Contribution, EnrollmentRequest, Invitation, MemberProfile, Testimony


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
        self.assertIn(str(invitation.token), mock_send.call_args[0][1])

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

        lookup = self.client.get(f'/api/members/auth/invitation/verify/?token={invitation.token}')
        self.assertEqual(lookup.status_code, status.HTTP_200_OK)
        self.assertEqual(lookup.data['email'], 'invitee@example.com')
        self.assertEqual(lookup.data['roles'], ['admin'])

        accepted = self.client.post('/api/members/auth/invitation/accept/', {
            'token': str(invitation.token),
            'username': 'grace.wanjiku',
            'password': 'SabbathRest#2026',
            'confirm_password': 'SabbathRest#2026',
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
            'token': str(invitation.token),
            'username': 'someone.else',
            'password': 'AnotherPass#2026',
            'confirm_password': 'AnotherPass#2026',
        }, format='json')
        self.assertEqual(reuse.status_code, status.HTTP_400_BAD_REQUEST)

    def test_accept_guards_against_bad_input(self):
        invitation = self._invitation()
        mismatch = self.client.post('/api/members/auth/invitation/accept/', {
            'token': str(invitation.token),
            'username': 'grace.wanjiku',
            'password': 'SabbathRest#2026',
            'confirm_password': 'Something#Else1',
        }, format='json')
        self.assertEqual(mismatch.status_code, status.HTTP_400_BAD_REQUEST)

        taken = self.client.post('/api/members/auth/invitation/accept/', {
            'token': str(invitation.token),
            'username': 'plain.member',
            'password': 'SabbathRest#2026',
            'confirm_password': 'SabbathRest#2026',
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
                'token': str(expired.token), 'username': 'late.comer',
                'password': 'SabbathRest#2026', 'confirm_password': 'SabbathRest#2026',
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
            self.client.get(f'/api/members/auth/invitation/verify/?token={revoked.token}').status_code,
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
            'token': str(self.invitation.token),
            'username': username,
            'password': password,
            'confirm_password': password,
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
    """Every email names the church the same way: SDA Loma Linda Meru."""

    CHURCH = 'SDA Loma Linda Meru'

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
        self.assertEqual(subject, f'You are invited to {self.CHURCH}')
        self.assertIn(self.CHURCH, sender)
        # Straight after "Hello Grace," the church is the one doing the inviting.
        greeting, first_sentence = body.split('\n\n')[:2]
        self.assertEqual(greeting, 'Hello Grace,')
        self.assertTrue(first_sentence.startswith(f'{self.CHURCH} has invited you'), first_sentence)
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
        self.assertEqual(subject, f'Verify your {self.CHURCH} account')
        self.assertIn(f'join {self.CHURCH} as a church account', body)
        self.assertIn(f'Warm regards,\n{self.CHURCH}', body)
        self.assertNotIn('Loma Linda SDA Church', body)

    def test_password_reset_email_uses_the_same_name(self):
        User.objects.create_user('branding.user', 'branding3@example.com', 'MemberPass#2026')
        with patch('members.views.send_mail') as mock_send:
            self.client.post('/api/members/auth/password-reset/', {'email': 'branding3@example.com'}, format='json')

        subject, body = mock_send.call_args[0][0], mock_send.call_args[0][1]
        self.assertEqual(subject, f'Reset your {self.CHURCH} password')
        self.assertIn(self.CHURCH, body)

    def test_a_renamed_church_wins_over_the_default(self):
        """The office can rename the church in Church Settings without a code change."""
        from .models import ChurchSettings

        ChurchSettings.objects.create(church_name='SDA Milimani, Meru')
        self.client.force_authenticate(user=self.admin_user)
        with patch('members.views.send_mail') as mock_send:
            self.client.post('/api/members/invitations/', {
                'email': 'renamed@example.com', 'first_name': 'Grace', 'roles': ['member'],
            }, format='json')
        self.assertEqual(mock_send.call_args[0][0], 'You are invited to SDA Milimani, Meru')
