"""What the Emails desk promises, checked.

Four suites, one per layer, so a failure says which promise broke:

* **parsing** — a raw letter becomes readable fields, whatever charset or
  nesting the sender used;
* **ingestion** — a letter is stored once, in the thread it belongs to, and
  thread counters stay true;
* **sync** — the poller advances its cursor, survives a rebuilt folder, skips a
  letter that vanishes, reports a refused login, and closes its connection;
* **API** — only elders, clerks and the administrator get in; read marks are
  per officer; a reply leaves as ``info@`` carrying the headers that keep the
  conversation threaded.

The IMAP tests run against a fake client with imaplib's exact surface, so the
whole poll — cursor, idempotence, cleanup — is exercised with no server.
"""

import imaplib
import tempfile
from datetime import timedelta
from email.header import Header
from email.message import EmailMessage as MimeEmail
from email.utils import format_datetime

from django.contrib.auth.models import User
from django.core import mail
from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from members.models import MemberProfile

from . import services
from .imap_sync import ImapSession, ImapSyncError, sync
from .models import MailMessage, MailThread, MailboxCursor
from .parsing import parse, references_of, subject_key

FAKE_IMAP = {
    'IMAP_HOST': 'imap.example.test',
    'IMAP_PORT': '993',
    'IMAP_USER': 'info@sdalomalinda.or.ke',
    'IMAP_PASSWORD': 'app-password',
    'IMAP_MAILBOX': 'INBOX',
    # Read and write are both configured here; without a send host the desk
    # would honestly report itself as not ready.
    'EMAIL_HOST': 'smtp.example.test',
}


def make_user(username, role='member', **kwargs):
    """A plain account with the profile the roles are read from."""
    user = User.objects.create_user(username=username, password='secure-password', **kwargs)
    MemberProfile.objects.create(user=user, role=role)
    return user


def raw_letter(*, message_id='<one@example.test>', subject='Sabbath programme',
               from_addr='Jane Mwangi <jane@example.test>',
               to='info@sdalomalinda.or.ke', body='The programme is attached.',
               in_reply_to='', references='', html=None, attachments=(), when=None):
    """Build one RFC 5322 message as bytes, exactly as a mail client would."""
    message = MimeEmail()
    message['Message-ID'] = message_id
    message['Subject'] = subject
    message['From'] = from_addr
    message['To'] = to
    message['Date'] = format_datetime(when or timezone.now())
    if in_reply_to:
        message['In-Reply-To'] = in_reply_to
    if references:
        message['References'] = references
    message.set_content(body)
    if html:
        message.add_alternative(html, subtype='html')
    for filename, content in attachments:
        message.add_attachment(content, maintype='application', subtype='octet-stream',
                               filename=filename)
    return message.as_bytes()


def text_letter(**headers_and_body):
    """One letter built from explicit header lines — exact bytes, no encoding
    surprises, for the two cases where the header itself is the test."""
    body = headers_and_body.pop('body', 'The body.')
    lines = [f'{name}: {value}' for name, value in headers_and_body.items() if value]
    return ('\r\n'.join(lines) + '\r\n\r\n' + body).encode()


class FakeImapClient:
    """imaplib's surface and nothing else — a mailbox made of a dict."""

    def __init__(self, mail=None, uid_validity=1000, refuse_login=False, lose=None):
        self.mail = dict(mail or {})
        self.uid_validity = uid_validity
        self.refuse_login = refuse_login
        self.lose = set(lose or ())  # UIDs that vanish between SEARCH and FETCH
        self.logged_in = False
        self.logged_out = False
        self.selected = None

    def login(self, user, password):
        if self.refuse_login:
            raise imaplib.IMAP4.error('Authentication failed.')
        self.logged_in = True
        return ('OK', [b'Logged in'])

    def select(self, mailbox, readonly=True):
        self.selected = (mailbox, readonly)
        highest = max(self.mail, default=0)
        return ('OK', [f'{len(self.mail)} (UIDVALIDITY {self.uid_validity} UIDNEXT {highest + 1})'.encode()])

    def uid(self, command, *args):
        command = str(command).upper()
        if command == 'SEARCH':
            first = int(str(args[-1]).split()[-1].split(':')[0])
            uids = sorted(uid for uid in self.mail if uid >= first)
            return ('OK', [' '.join(str(uid) for uid in uids).encode()] if uids else [b''])
        if command == 'FETCH':
            uid = int(args[0])
            if uid in self.lose:
                return ('OK', [None])
            raw = self.mail.get(uid)
            if raw is None:
                return ('NO', [b'No such message'])
            return ('OK', [(f'1 (RFC822 {{{len(raw)}}}'.encode(), raw), b')'])
        raise AssertionError(f'unexpected IMAP command {command}')

    def response(self, name):
        return ('OK', [str(self.uid_validity).encode()])

    def logout(self):
        self.logged_out = True
        return ('OK', [b'Logged out'])


def session_for(client):
    """An ``ImapSession`` factory wired to one fake mailbox."""
    def factory(config):
        return ImapSession(config, client_factory=lambda cfg: client)
    return factory


# ── Parsing ──────────────────────────────────────────────────────────────────

class MailParsingTests(SimpleTestCase):
    def test_a_plain_letter_reads_as_a_letter(self):
        parsed = parse(raw_letter(body='Please pray for us.'))
        self.assertEqual(parsed['subject'], 'Sabbath programme')
        self.assertEqual(parsed['from_name'], 'Jane Mwangi')
        self.assertEqual(parsed['from_email'], 'jane@example.test')
        self.assertEqual(parsed['to_header'], 'info@sdalomalinda.or.ke')
        self.assertIn('Please pray for us.', parsed['body_text'])
        self.assertEqual(parsed['attachments'], [])

    def test_an_encoded_subject_header_is_decoded(self):
        # RFC 2047 encoded words are how clients carry non-ASCII subjects.
        encoded = Header('Sabbath programme ☀', 'utf-8').encode()
        raw = raw_letter().replace(
            'Subject: Sabbath programme'.encode(), f'Subject: {encoded}'.encode()
        )
        parsed = parse(raw)
        self.assertEqual(parsed['subject'], 'Sabbath programme ☀')

    def test_html_is_kept_as_html_and_still_yields_a_preview(self):
        parsed = parse(raw_letter(body='The programme is attached.',
                                  html='<p>The <b>programme</b> is attached.</p>'))
        self.assertIn('<b>programme</b>', parsed['body_html'])
        self.assertIn('The programme is attached.', parsed['body_text'])
        self.assertEqual(services.preview_of(parsed['body_text'], parsed['body_html']),
                         'The programme is attached.')

    def test_an_html_only_letter_still_has_readable_text_to_show(self):
        parsed = parse(raw_letter(body='', html='<div>Hello&nbsp;<i>friend</i></div>'))
        self.assertTrue(parsed['body_html'])
        # No plain part was sent, so the text is derived — the desk never shows
        # a blank letter and never renders a stranger's markup.
        self.assertEqual(parsed['body_text'], 'Hello friend')
        self.assertEqual(services.preview_of(parsed['body_text'], parsed['body_html']),
                         'Hello friend')

    def test_script_in_an_html_body_never_survives_into_the_text(self):
        parsed = parse(raw_letter(
            body='',
            html='<p>Welcome</p><script>alert(1)</script><p>Come on Sabbath</p>',
        ))
        self.assertNotIn('alert', parsed['body_text'])
        self.assertIn('Welcome', parsed['body_text'])
        self.assertIn('Come on Sabbath', parsed['body_text'])

    def test_attachments_are_extracted_with_their_bytes(self):
        parsed = parse(raw_letter(attachments=[('programme.pdf', b'%PDF-1.4 fake')]))
        self.assertEqual(len(parsed['attachments']), 1)
        attachment = parsed['attachments'][0]
        self.assertEqual(attachment['filename'], 'programme.pdf')
        self.assertEqual(attachment['content_type'], 'application/octet-stream')
        self.assertEqual(attachment['content'], b'%PDF-1.4 fake')

    def test_a_letter_without_a_date_still_gets_an_aware_timestamp(self):
        parsed = parse(text_letter(**{
            'Message-ID': '<nodate@example.test>',
            'Subject': 'No date at all',
            'From': 'Jane <jane@example.test>',
            'To': 'info@sdalomalinda.or.ke',
        }))
        self.assertIsNotNone(parsed['date'].tzinfo)

    def test_the_reference_chain_reads_both_headers(self):
        parsed = parse(raw_letter(
            in_reply_to='<parent@example.test>',
            references='<root@example.test> <parent@example.test>',
        ))
        # Bracketed, exactly as a ``Message-ID`` is stored — see references_of.
        self.assertEqual(references_of(parsed),
                         ['<parent@example.test>', '<root@example.test>'])

    def test_a_reply_whose_reference_dropped_its_brackets_still_finds_its_parent(self):
        parsed = parse(raw_letter(
            message_id='<child@example.test>',
            in_reply_to='parent@example.test',
            references='root@example.test parent@example.test',
        ))
        self.assertEqual(references_of(parsed),
                         ['parent@example.test', 'root@example.test'])

    def test_subject_matching_ignores_the_reply_prefixes(self):
        self.assertEqual(subject_key('Re: Re: Fwd: Sabbath programme'),
                         subject_key('SABBATH PROGRAMME'))


# ── Ingestion ────────────────────────────────────────────────────────────────

class MailIngestionTests(TestCase):
    def test_the_first_letter_starts_a_thread(self):
        message, created = services.ingest(parse(raw_letter()))
        self.assertTrue(created)
        thread = message.thread
        self.assertEqual(thread.subject, 'Sabbath programme')
        self.assertEqual(thread.correspondent_email, 'jane@example.test')
        self.assertEqual(thread.correspondent_name, 'Jane Mwangi')
        self.assertEqual(thread.message_count, 1)
        self.assertEqual(thread.preview, 'The programme is attached.')
        self.assertFalse(thread.archived)

    def test_the_same_letter_twice_stores_one_row(self):
        raw = raw_letter()
        services.ingest(parse(raw))
        message, created = services.ingest(parse(raw))
        self.assertFalse(created)
        self.assertEqual(MailMessage.objects.count(), 1)
        self.assertEqual(MailThread.objects.count(), 1)
        self.assertEqual(message.thread.message_count, 1)

    def test_a_reply_joins_the_thread_it_references(self):
        services.ingest(parse(raw_letter(message_id='<root@example.test>', from_addr='Elder <e@x.test>')))
        message, created = services.ingest(parse(raw_letter(
            message_id='<reply@example.test>',
            in_reply_to='<root@example.test>',
            references='<root@example.test>',
            from_addr='Elder <e@x.test>',
            subject='Re: Sabbath programme',
            body='Thank you.',
        )))
        self.assertTrue(created)
        self.assertEqual(MailThread.objects.count(), 1)
        self.assertEqual(message.thread.message_count, 2)

    def test_a_reply_whose_reference_dropped_its_brackets_joins_the_thread(self):
        # A different subject on purpose: only the reference chain can put this
        # letter where it belongs, so this fails if the brackets are mishandled.
        services.ingest(parse(raw_letter(message_id='<root@example.test>')))
        message, created = services.ingest(parse(raw_letter(
            message_id='<child@example.test>',
            in_reply_to='root@example.test',
            references='root@example.test',
            subject='Thank you for the rota',
            body='Received, with thanks.',
        )))
        self.assertTrue(created)
        self.assertEqual(MailThread.objects.count(), 1)
        self.assertEqual(message.thread.message_count, 2)

    def test_an_unrelated_letter_gets_its_own_thread(self):
        services.ingest(parse(raw_letter(message_id='<a@example.test>', subject='Sabbath programme')))
        services.ingest(parse(raw_letter(message_id='<b@example.test>', subject='Tithes for October',
                                         from_addr='Treasury <t@x.test>')))
        self.assertEqual(MailThread.objects.count(), 2)

    def test_the_thread_summary_follows_the_newest_letter(self):
        older = timezone.now() - timedelta(days=1)
        services.ingest(parse(raw_letter(when=older, body='First.')))
        message, _ = services.ingest(parse(
            raw_letter(message_id='<two@example.test>', body='Second and longer.', when=timezone.now())
        ))
        thread = message.thread
        self.assertEqual(thread.preview, 'Second and longer.')
        self.assertEqual(thread.message_count, 2)
        self.assertGreater(thread.last_message_at, older)

    @override_settings(MEDIA_ROOT=None)
    def test_an_attachment_is_stored_on_the_message(self):
        with tempfile.TemporaryDirectory() as media, override_settings(MEDIA_ROOT=media):
            message, _ = services.ingest(parse(raw_letter(attachments=[('rota.pdf', b'%PDF-1.4 rota')])))
            attachment = message.attachments.get()
            self.assertEqual(attachment.filename, 'rota.pdf')
            self.assertEqual(attachment.size, 13)
            self.assertTrue(attachment.file.name.endswith('rota.pdf'))


# ── Sync ─────────────────────────────────────────────────────────────────────

@override_settings(**FAKE_IMAP)
class MailboxSyncTests(TestCase):
    def test_a_first_poll_stores_every_letter_and_remembers_the_cursor(self):
        client = FakeImapClient({
            1: raw_letter(message_id='<1@example.test>', subject='One'),
            2: raw_letter(message_id='<2@example.test>', subject='Two'),
        })
        summary = sync(session_factory=session_for(client))
        self.assertTrue(summary['ok'], summary)
        self.assertEqual(summary['fetched'], 2)
        self.assertEqual(summary['stored'], 2)
        self.assertEqual(MailMessage.objects.count(), 2)
        self.assertEqual(MailboxCursor.objects.get().last_uid, 2)
        self.assertTrue(client.logged_out)

    def test_a_second_poll_fetches_nothing_new(self):
        client = FakeImapClient({1: raw_letter(message_id='<1@example.test>')})
        sync(session_factory=session_for(client))
        again = sync(session_factory=session_for(client))
        self.assertTrue(again['ok'], again)
        self.assertEqual(again['fetched'], 0)
        self.assertEqual(again['stored'], 0)
        self.assertEqual(MailMessage.objects.count(), 1)

    def test_a_rebuilt_folder_refetches_and_stores_each_letter_once(self):
        client = FakeImapClient({1: raw_letter(message_id='<1@example.test>')})
        sync(session_factory=session_for(client))
        # Same letters, a folder the server has rebuilt: the cursor must start
        # over, and starting over must not duplicate anything.
        client.uid_validity = 9999
        summary = sync(session_factory=session_for(client))
        self.assertEqual(summary['fetched'], 1)
        self.assertEqual(summary['stored'], 0)
        self.assertEqual(summary['duplicates'], 1)
        self.assertEqual(MailMessage.objects.count(), 1)
        self.assertEqual(MailboxCursor.objects.get().uid_validity, 9999)

    def test_only_letters_after_the_cursor_are_fetched(self):
        client = FakeImapClient({1: raw_letter(message_id='<1@example.test>')})
        sync(session_factory=session_for(client))
        client.mail[2] = raw_letter(message_id='<2@example.test>', subject='New')
        summary = sync(session_factory=session_for(client))
        self.assertEqual(summary['fetched'], 1)
        self.assertEqual(summary['stored'], 1)
        self.assertEqual(MailMessage.objects.count(), 2)

    def test_a_rebuilt_folder_resets_the_cursor_rather_than_skipping_mail(self):
        client = FakeImapClient({1: raw_letter(message_id='<1@example.test>')})
        sync(session_factory=session_for(client))
        # The server rebuilds the folder: same UIDs, different letters.
        client.uid_validity = 9999
        client.mail = {1: raw_letter(message_id='<2@example.test>', subject='After rebuild')}
        summary = sync(session_factory=session_for(client))
        self.assertEqual(summary['stored'], 1)
        self.assertEqual(MailMessage.objects.count(), 2)
        self.assertEqual(MailboxCursor.objects.get().uid_validity, 9999)

    def test_a_letter_that_vanishes_is_skipped_and_the_poll_continues(self):
        client = FakeImapClient({
            1: raw_letter(message_id='<1@example.test>', subject='Kept'),
            2: raw_letter(message_id='<2@example.test>', subject='Vanished'),
            3: raw_letter(message_id='<3@example.test>', subject='Also kept'),
        }, lose={2})
        summary = sync(session_factory=session_for(client))
        self.assertTrue(summary['ok'], summary)
        self.assertEqual(summary['stored'], 2)
        self.assertEqual(summary['failed'], 1)
        # The cursor still passes the missing letter so the poll cannot stall.
        self.assertEqual(MailboxCursor.objects.get().last_uid, 3)

    @override_settings(IMAP_HOST='', IMAP_USER='', IMAP_PASSWORD='')
    def test_an_unconfigured_mailbox_reports_itself_instead_of_raising(self):
        summary = sync(session_factory=session_for(FakeImapClient()))
        self.assertFalse(summary['ok'])
        self.assertEqual(summary['reason'], 'not-configured')

    def test_a_refused_login_is_reported_with_a_reason_an_officer_can_act_on(self):
        client = FakeImapClient(refuse_login=True)
        summary = sync(session_factory=session_for(client))
        self.assertFalse(summary['ok'])
        self.assertIn('refused the IMAP login', summary['reason'])
        self.assertIn('IMAP Access', summary['reason'])

    def test_the_session_is_read_only_and_logged_out(self):
        client = FakeImapClient({1: raw_letter(message_id='<1@example.test>')})
        sync(session_factory=session_for(client))
        self.assertEqual(client.selected, ('INBOX', True))
        self.assertTrue(client.logged_out)

    @override_settings(IMAP_HOST='', IMAP_USER='', IMAP_PASSWORD='')
    def test_an_unconfigured_session_refuses_to_open(self):
        with self.assertRaises(ImapSyncError):
            with ImapSession():
                pass  # pragma: no cover - entering is what raises


# ── API ──────────────────────────────────────────────────────────────────────

@override_settings(**FAKE_IMAP)
class MailboxApiTests(APITestCase):
    def setUp(self):
        self.elder = make_user('elder1', role='elder')
        self.other_elder = make_user('elder2', role='elder')
        self.clerk = make_user('clerk1', role='clerk')
        self.admin = make_user('boss', role='admin', is_staff=True, is_superuser=True)
        self.member = make_user('member1', role='member')

        self.thread = services.ingest(parse(raw_letter(
            message_id='<api1@example.test>',
            subject='Baptism service',
            body='Could we schedule a baptism?',
        )))[0].thread

    # -- who gets in --------------------------------------------------------
    def test_a_plain_member_cannot_open_the_desk(self):
        self.client.force_authenticate(self.member)
        response = self.client.get('/api/mailbox/threads/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_elders_clerks_and_the_administrator_get_in(self):
        for user in (self.elder, self.clerk, self.admin):
            self.client.force_authenticate(user)
            response = self.client.get('/api/mailbox/threads/')
            self.assertEqual(response.status_code, status.HTTP_200_OK, user.username)

    def test_an_officer_arriving_unauthenticated_is_refused(self):
        response = self.client.get('/api/mailbox/threads/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    # -- reading ------------------------------------------------------------
    def test_the_thread_list_shows_the_conversation(self):
        self.client.force_authenticate(self.elder)
        response = self.client.get('/api/mailbox/threads/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        threads = response.data['threads']
        self.assertEqual(len(threads), 1)
        self.assertEqual(threads[0]['subject'], 'Baptism service')
        self.assertEqual(threads[0]['unread_count'], 1)
        self.assertEqual(response.data['unread'], 1)

    def test_search_finds_a_letter_by_its_body(self):
        self.client.force_authenticate(self.elder)
        found = self.client.get('/api/mailbox/threads/?q=baptism')
        missing = self.client.get('/api/mailbox/threads/?q=harvest')
        self.assertEqual(len(found.data['threads']), 1)
        self.assertEqual(len(missing.data['threads']), 0)

    def test_an_unknown_folder_is_refused(self):
        self.client.force_authenticate(self.elder)
        response = self.client.get('/api/mailbox/threads/?folder=nowhere')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_the_detail_returns_every_letter_in_order(self):
        second = services.ingest(parse(raw_letter(
            message_id='<api2@example.test>',
            in_reply_to='<api1@example.test>',
            references='<api1@example.test>',
            subject='Re: Baptism service',
            from_addr='Elder <e@x.test>',
            body='Saturday works.',
        )))[0]
        self.client.force_authenticate(self.elder)
        response = self.client.get(f'/api/mailbox/threads/{self.thread.pk}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['messages']), 2)
        self.assertEqual(response.data['messages'][0]['direction'], 'in')
        self.assertEqual(response.data['messages'][1]['body_text'], 'Saturday works.')
        self.assertIsNotNone(second.pk)

    # -- read state is per officer -----------------------------------------
    def test_reading_a_thread_marks_it_for_that_officer_only(self):
        self.client.force_authenticate(self.elder)
        self.assertEqual(self.client.get('/api/mailbox/threads/').data['unread'], 1)
        response = self.client.post(f'/api/mailbox/threads/{self.thread.pk}/state/',
                                    {'read': True}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['unread_count'], 0)

        # The other elder's desk is untouched: nobody else read it for them.
        self.client.force_authenticate(self.other_elder)
        self.assertEqual(self.client.get('/api/mailbox/threads/').data['unread'], 1)

    def test_a_thread_can_be_handed_back_as_unread(self):
        self.client.force_authenticate(self.elder)
        self.client.post(f'/api/mailbox/threads/{self.thread.pk}/state/', {'read': True}, format='json')
        response = self.client.post(f'/api/mailbox/threads/{self.thread.pk}/state/',
                                    {'read': False}, format='json')
        self.assertEqual(response.data['unread_count'], 1)

    def test_the_detail_reports_this_officers_own_read_marks(self):
        self.client.force_authenticate(self.other_elder)
        self.client.post(f'/api/mailbox/threads/{self.thread.pk}/state/', {'read': True}, format='json')

        self.client.force_authenticate(self.elder)
        response = self.client.get(f'/api/mailbox/threads/{self.thread.pk}/')
        self.assertFalse(response.data['messages'][0]['is_read'])
        self.assertEqual(response.data['unread_count'], 1)

    # -- the flags the desk shares ------------------------------------------
    def test_starring_is_shared_while_read_state_is_not(self):
        self.client.force_authenticate(self.elder)
        self.client.post(f'/api/mailbox/threads/{self.thread.pk}/state/',
                         {'starred': True}, format='json')

        self.client.force_authenticate(self.other_elder)
        starred = self.client.get('/api/mailbox/threads/?folder=starred')
        self.assertEqual(len(starred.data['threads']), 1)
        # Still unread for the other elder: starring is the desk's, reading is mine.
        self.assertEqual(starred.data['threads'][0]['unread_count'], 1)

    def test_an_archived_thread_leaves_the_inbox_and_returns(self):
        self.client.force_authenticate(self.elder)
        self.client.post(f'/api/mailbox/threads/{self.thread.pk}/state/',
                         {'archived': True}, format='json')
        self.assertEqual(self.client.get('/api/mailbox/threads/').data['threads'], [])
        self.assertEqual(len(self.client.get('/api/mailbox/threads/?folder=archived').data['threads']), 1)
        self.client.post(f'/api/mailbox/threads/{self.thread.pk}/state/',
                         {'archived': False}, format='json')
        self.assertEqual(len(self.client.get('/api/mailbox/threads/').data['threads']), 1)

    def test_a_state_change_with_nothing_to_change_is_refused(self):
        self.client.force_authenticate(self.elder)
        response = self.client.post(f'/api/mailbox/threads/{self.thread.pk}/state/', {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # -- writing ------------------------------------------------------------
    def test_a_reply_leaves_the_desk_as_the_human_address_and_keeps_threading(self):
        self.client.force_authenticate(self.elder)
        response = self.client.post(f'/api/mailbox/threads/{self.thread.pk}/reply/',
                                    {'body': 'Saturday at 10am works for us.'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

        self.assertEqual(len(mail.outbox), 1)
        sent = mail.outbox[0]
        self.assertEqual(sent.from_email, services.sender_for(services.HUMAN))
        self.assertIn('info@sdalomalinda.or.ke', sent.from_email)
        self.assertEqual(sent.to, ['jane@example.test'])
        self.assertTrue(
            sent.subject.lower().startswith('re:'), sent.subject
        )
        # The reply carries the chain, so the recipient (and the poller) thread it.
        headers = {key.lower(): value for key, value in sent.extra_headers.items()}
        self.assertIn('in-reply-to', headers)
        self.assertIn('<api1@example.test>', headers['in-reply-to'])
        self.assertIn('references', headers)

        outbound = MailMessage.objects.filter(direction=MailMessage.DIRECTION_OUTBOUND).get()
        self.assertEqual(outbound.thread_id, self.thread.pk)
        self.assertEqual(outbound.in_reply_to, '<api1@example.test>')

        # And when the Sent copy comes back down the poller, it is not new mail.
        message, created = services.ingest(parse(sent.message().as_bytes()))
        self.assertFalse(created)
        self.assertEqual(MailMessage.objects.filter(direction=MailMessage.DIRECTION_OUTBOUND).count(), 1)
        self.assertEqual(message.thread_id, self.thread.pk)
        self.assertEqual(MailThread.objects.count(), 1)

    def test_a_reply_needs_a_body(self):
        self.client.force_authenticate(self.elder)
        response = self.client.post(f'/api/mailbox/threads/{self.thread.pk}/reply/',
                                    {'body': '   '}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(len(mail.outbox), 0)

    def test_a_new_letter_needs_an_address_a_subject_and_a_body(self):
        self.client.force_authenticate(self.elder)
        cases = [
            ({'subject': 'x', 'body': 'y'}, 'Add the address you are writing to.'),
            ({'to': 'jane@example.test', 'body': 'y'}, 'Give the letter a subject.'),
            ({'to': 'jane@example.test', 'subject': 'x'}, 'Write the letter first.'),
        ]
        for payload, expected in cases:
            response = self.client.post('/api/mailbox/compose/', payload, format='json')
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, payload)
            self.assertEqual(response.data['detail'], expected)
        self.assertEqual(len(mail.outbox), 0)

    def test_a_composed_letter_sends_from_the_desk_and_starts_a_thread(self):
        self.client.force_authenticate(self.elder)
        response = self.client.post('/api/mailbox/compose/', {
            'to': 'jane@example.test, elder@conference.test',
            'subject': 'You are invited',
            'body': 'Please come on Sabbath.',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(len(mail.outbox), 1)
        sent = mail.outbox[0]
        self.assertIn('info@sdalomalinda.or.ke', sent.from_email)
        self.assertEqual(sent.to, ['jane@example.test', 'elder@conference.test'])

        thread = MailThread.objects.get(pk=response.data['thread_id'])
        self.assertEqual(thread.subject, 'You are invited')
        self.assertEqual(thread.correspondent_email, 'jane@example.test')
        self.assertEqual(thread.messages.filter(direction=MailMessage.DIRECTION_OUTBOUND).count(), 1)

    # -- summary and sync ---------------------------------------------------
    def test_the_summary_counts_only_this_officers_unread(self):
        self.client.force_authenticate(self.other_elder)
        self.client.post(f'/api/mailbox/threads/{self.thread.pk}/state/', {'read': True}, format='json')

        self.client.force_authenticate(self.elder)
        payload = self.client.get('/api/mailbox/summary/').data
        self.assertEqual(payload['unread'], 1)
        self.assertEqual(payload['threads'], 1)
        self.assertTrue(payload['transport']['send_from'])
        self.assertTrue(payload['transport']['configured'])

    @override_settings(IMAP_HOST='')
    def test_the_sync_endpoint_says_why_it_could_not_reach_the_mailbox(self):
        self.client.force_authenticate(self.elder)
        response = self.client.post('/api/mailbox/sync/')
        # 502, not a bare failure: the officer is owed the reason, not just a code.
        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY, response.data)
        self.assertFalse(response.data['ok'])
        self.assertEqual(response.data['reason'], 'not-configured')

    def test_an_officer_cannot_sync_or_read_without_the_role(self):
        self.client.force_authenticate(self.member)
        self.assertEqual(self.client.post('/api/mailbox/sync/').status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get('/api/mailbox/summary/').status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            self.client.post(f'/api/mailbox/threads/{self.thread.pk}/reply/',
                             {'body': 'hi'}, format='json').status_code,
            status.HTTP_403_FORBIDDEN,
        )


class MailboxPermissionTests(TestCase):
    def test_the_gate_is_exactly_elders_clerks_and_the_administrator(self):
        allowed = [make_user('e', role='elder'), make_user('c', role='clerk'), make_user('a', role='admin')]
        refused = [make_user('m', role='member'), make_user('d', role='deacon'), make_user('t', role='treasurer')]
        for user in allowed:
            self.assertTrue(services.can_use_mailbox(user), user.username)
        for user in refused:
            self.assertFalse(services.can_use_mailbox(user), user.username)
        staff = make_user('root', role='member', is_staff=True)
        self.assertTrue(services.can_use_mailbox(staff))
        self.assertFalse(services.can_use_mailbox(User(username='anonymous')))
