from unittest import mock

from asgiref.sync import async_to_sync
from channels.testing import WebsocketCommunicator
from django.contrib.auth.models import User
from django.test import TransactionTestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient, APITestCase
from rest_framework_simplejwt.tokens import AccessToken

from config.asgi import application

from . import realtime, views

from members.models import (
    Department,
    DepartmentAssignment,
    DepartmentMembership,
    DepartmentRole,
    MemberProfile,
)

from . import services
from .models import Conversation, Message, Participant


def make_member(username, role='member'):
    """A plain account with the profile the roles are read from."""
    user = User.objects.create_user(username=username, password='secure-password')
    MemberProfile.objects.create(user=user, role=role)
    return user


class ChatDirectMessageTests(APITestCase):
    def setUp(self):
        self.alice = make_member('alice')
        self.bob = make_member('bob')
        self.carol = make_member('carol')
        self.client.force_authenticate(self.alice)

    def test_opening_the_same_direct_message_twice_returns_one_room(self):
        first = self.client.post('/api/members/chat/conversations/', {'kind': 'dm', 'member_id': self.bob.id}, format='json')
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        second = self.client.post('/api/members/chat/conversations/', {'kind': 'dm', 'member_id': self.bob.id}, format='json')
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        self.assertEqual(first.data['id'], second.data['id'])
        self.assertEqual(Conversation.objects.filter(kind='dm').count(), 1)
        self.assertEqual(Participant.objects.filter(conversation_id=first.data['id']).count(), 2)

    def test_a_member_cannot_message_themselves(self):
        response = self.client.post('/api/members/chat/conversations/', {'kind': 'dm', 'member_id': self.alice.id}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_a_third_member_cannot_read_someone_elses_direct_message(self):
        room_id = self.client.post('/api/members/chat/conversations/', {'kind': 'dm', 'member_id': self.bob.id}, format='json').data['id']
        self.client.force_authenticate(self.carol)
        response = self.client.get(f'/api/members/chat/conversations/{room_id}/messages/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_a_sent_message_reads_in_both_rooms_and_leaves_an_unread_mark(self):
        room_id = self.client.post('/api/members/chat/conversations/', {'kind': 'dm', 'member_id': self.bob.id}, format='json').data['id']
        sent = self.client.post(f'/api/members/chat/conversations/{room_id}/messages/', {'body': 'Are you coming to vespers?'}, format='json')
        self.assertEqual(sent.status_code, status.HTTP_201_CREATED)

        # Alice wrote it, so she has nothing unread; she is still the room's.
        alice_list = self.client.get('/api/members/chat/conversations/').data['conversations']
        self.assertEqual(alice_list[0]['unread_count'], 0)
        self.assertTrue(alice_list[0]['can_post'])
        # Bob has not read it, and the room reads as Alice to him.
        self.client.force_authenticate(self.bob)
        bob_list = self.client.get('/api/members/chat/conversations/').data['conversations']
        self.assertEqual(bob_list[0]['unread_count'], 1)
        self.assertEqual(bob_list[0]['title'], 'alice')

    def test_marking_a_room_read_clears_the_count(self):
        room_id = self.client.post('/api/members/chat/conversations/', {'kind': 'dm', 'member_id': self.bob.id}, format='json').data['id']
        self.client.post(f'/api/members/chat/conversations/{room_id}/messages/', {'body': 'One question.'}, format='json')
        self.client.force_authenticate(self.bob)
        read = self.client.post(f'/api/members/chat/conversations/{room_id}/read/')
        self.assertEqual(read.status_code, status.HTTP_200_OK)
        listed = self.client.get('/api/members/chat/conversations/').data['conversations']
        self.assertEqual(listed[0]['unread_count'], 0)


class ChatOfficeThreadTests(APITestCase):
    def setUp(self):
        self.member = make_member('member')
        self.elder = make_member('elder', role='elder')
        self.other = make_member('other')

    def test_an_office_thread_is_read_by_the_office_not_by_other_members(self):
        self.client.force_authenticate(self.member)
        opened = self.client.post('/api/members/chat/conversations/', {'kind': 'office'}, format='json')
        self.assertEqual(opened.status_code, status.HTTP_201_CREATED)
        room_id = opened.data['id']

        self.client.force_authenticate(self.elder)
        self.assertEqual(self.client.get(f'/api/members/chat/conversations/{room_id}/messages/').status_code, status.HTTP_200_OK)

        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(f'/api/members/chat/conversations/{room_id}/messages/').status_code, status.HTTP_403_FORBIDDEN)

    def test_the_office_sees_every_members_thread(self):
        self.client.force_authenticate(self.member)
        self.client.post('/api/members/chat/conversations/', {'kind': 'office'}, format='json')
        self.client.force_authenticate(self.elder)
        rooms = self.client.get('/api/members/chat/conversations/').data['conversations']
        self.assertTrue(any(room['kind'] == 'office' for room in rooms))


class ChatAreaRoomTests(APITestCase):
    def setUp(self):
        # A fresh code: the seeded departments are already in the test database.
        self.code = 'test_area'
        self.department = Department.objects.create(code=self.code, name='Test Area', group='ministry')
        self.role = DepartmentRole.objects.create(department=self.department, name='Leader')
        self.member = make_member('member')
        DepartmentMembership.objects.create(member=self.member, department=self.code)
        self.leader = make_member('leader')
        DepartmentAssignment.objects.create(department=self.department, role=self.role, member=self.leader)
        self.outsider = make_member('outsider')

    def test_asking_for_an_area_room_creates_its_group_and_channel(self):
        self.client.force_authenticate(self.leader)
        self.client.post('/api/members/chat/conversations/', {'kind': 'group', 'department': self.code}, format='json')
        self.assertEqual(Conversation.objects.filter(department=self.department).count(), 2)
        self.assertTrue(Conversation.objects.filter(kind='group', key=f'dept:{self.code}').exists())
        self.assertTrue(Conversation.objects.filter(kind='channel', key=f'dept:{self.code}:announce').exists())

    def test_a_member_on_the_roll_is_in_the_area_group(self):
        self.client.force_authenticate(self.member)
        group_id = self.client.post('/api/members/chat/conversations/', {'kind': 'group', 'department': self.code}, format='json').data['id']
        self.assertEqual(services.access_to(self.member, Conversation.objects.get(pk=group_id)), True)
        self.client.post(f'/api/members/chat/conversations/{group_id}/messages/', {'body': 'See you all on Sabbath.'}, format='json')
        self.assertEqual(Message.objects.filter(conversation_id=group_id).count(), 1)

    def test_the_channel_is_read_by_the_area_but_posted_by_its_leaders(self):
        self.client.force_authenticate(self.leader)
        channel_id = self.client.post('/api/members/chat/conversations/', {'kind': 'channel', 'department': self.code}, format='json').data['id']

        # The roll reads it.
        self.client.force_authenticate(self.member)
        self.assertEqual(self.client.get(f'/api/members/chat/conversations/{channel_id}/messages/').status_code, status.HTTP_200_OK)
        # But may not post.
        self.assertEqual(
            self.client.post(f'/api/members/chat/conversations/{channel_id}/messages/', {'body': 'Hello'}, format='json').status_code,
            status.HTTP_403_FORBIDDEN,
        )
        # The leader may.
        self.client.force_authenticate(self.leader)
        self.assertEqual(
            self.client.post(f'/api/members/chat/conversations/{channel_id}/messages/', {'body': 'Choir practice moved.'}, format='json').status_code,
            status.HTTP_201_CREATED,
        )

    def test_a_member_outside_the_area_is_not_in_its_group(self):
        self.client.force_authenticate(self.leader)
        group_id = self.client.post('/api/members/chat/conversations/', {'kind': 'group', 'department': self.code}, format='json').data['id']
        self.client.force_authenticate(self.outsider)
        self.assertEqual(self.client.get(f'/api/members/chat/conversations/{group_id}/messages/').status_code, status.HTTP_403_FORBIDDEN)


class ChatDefaultRoomTests(APITestCase):
    def setUp(self):
        self.code = 'test_default'
        self.department = Department.objects.create(code=self.code, name='Default Area', group='ministry')
        self.member = make_member('member')
        DepartmentMembership.objects.create(member=self.member, department=self.code)

    def _rooms(self, user):
        self.client.force_authenticate(user)
        return self.client.get('/api/members/chat/conversations/').data['conversations']

    def test_the_list_gives_a_member_the_church_rooms_and_their_areas(self):
        rooms = self._rooms(self.member)
        seen = {(room['kind'], room['title']) for room in rooms}
        self.assertIn(('group', 'Church Family'), seen)
        self.assertIn(('channel', 'Church Announcements'), seen)
        # The area the member is on the roll of gets both of its rooms too.
        self.assertIn(('group', 'Default Area'), seen)
        self.assertIn(('channel', 'Default Area announcements'), seen)

    def test_the_church_channel_is_read_by_all_but_posted_by_the_office(self):
        channel = next(
            room for room in self._rooms(self.member)
            if room['kind'] == 'channel' and room['title'] == 'Church Announcements'
        )
        self.assertFalse(channel['can_post'])
        self.assertEqual(
            self.client.post(
                f"/api/members/chat/conversations/{channel['id']}/messages/",
                {'body': 'Hello'},
                format='json',
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        elder = make_member('elder', role='elder')
        self._rooms(elder)
        self.assertEqual(
            self.client.post(
                f"/api/members/chat/conversations/{channel['id']}/messages/",
                {'body': 'Vespers at six.'},
                format='json',
            ).status_code,
            status.HTTP_201_CREATED,
        )

    def test_the_church_group_is_open_to_every_member(self):
        group = next(
            room for room in self._rooms(self.member)
            if room['kind'] == 'group' and room['title'] == 'Church Family'
        )
        self.assertTrue(group['can_post'])
        self.assertEqual(
            self.client.post(
                f"/api/members/chat/conversations/{group['id']}/messages/",
                {'body': 'Good morning, church.'},
                format='json',
            ).status_code,
            status.HTTP_201_CREATED,
        )

    def test_reading_the_list_twice_does_not_duplicate_the_rooms(self):
        self._rooms(self.member)
        self._rooms(self.member)
        self.assertEqual(Conversation.objects.filter(key__startswith='church:').count(), 2)
        self.assertEqual(
            Participant.objects.filter(conversation__key='church:family', member=self.member).count(),
            1,
        )


#: A handshake as a browser sends it: an Origin the church allows (the
#: validator refuses a socket with none) and a Host the tenant lookup can read.
WEBSOCKET_HEADERS = [(b'origin', b'http://localhost'), (b'host', b'localhost')]


class ChatSocketTests(TransactionTestCase):
    """The live transport: sockets on a room, fed by the socket and by REST."""

    def setUp(self):
        self.alice = make_member('alice')
        self.bob = make_member('bob')
        self.carol = make_member('carol')
        self.room = services.open_dm(self.alice, self.bob)
        self.alice_token = str(AccessToken.for_user(self.alice))
        self.bob_token = str(AccessToken.for_user(self.bob))

    def _socket(self, user, token=None):
        token = token if token is not None else str(AccessToken.for_user(user))
        return WebsocketCommunicator(
            application,
            f'/ws/chat/{self.room.id}/?token={token}',
            headers=WEBSOCKET_HEADERS,
        )

    @staticmethod
    async def _ready(communicator):
        """Connect and swallow the ready frame every accepted socket gets."""
        connected, _ = await communicator.connect()
        if connected:
            await communicator.receive_json_from(timeout=5)
        return connected

    @staticmethod
    async def _until(communicator, kind, attempts=6):
        """The next event of one type, skipping the activity nudges around it."""
        for _ in range(attempts):
            event = await communicator.receive_json_from(timeout=5)
            if event.get('type') == kind:
                return event
        raise AssertionError(f'no {kind} event arrived')

    def test_a_message_sent_over_the_socket_reaches_the_other_member(self):
        async def scenario():
            alice = self._socket(self.alice, self.alice_token)
            bob = self._socket(self.bob, self.bob_token)
            try:
                self.assertTrue(await self._ready(alice))
                self.assertTrue(await self._ready(bob))
                await alice.send_json_to({'type': 'message', 'body': 'Are you coming to vespers?'})
                heard = await self._until(bob, 'message')
                self.assertEqual(heard['message']['body'], 'Are you coming to vespers?')
                # Bob's badge is nudged too, without a second socket on the room.
                await self._until(bob, 'activity')
                # And the writer's own socket hears the room's echo.
                echo = await self._until(alice, 'message')
                self.assertEqual(echo['message']['body'], 'Are you coming to vespers?')
            finally:
                await alice.disconnect()
                await bob.disconnect()

        async_to_sync(scenario)()
        self.assertEqual(Message.objects.filter(conversation=self.room).count(), 1)

    def test_a_bad_token_is_refused(self):
        async def scenario():
            communicator = WebsocketCommunicator(
                application,
                f'/ws/chat/{self.room.id}/?token=not-a-token',
                headers=WEBSOCKET_HEADERS,
            )
            connected, code = await communicator.connect()
            self.assertFalse(connected)
            self.assertEqual(code, 4401)

        async_to_sync(scenario)()

    def test_a_member_outside_the_room_cannot_open_it(self):
        async def scenario():
            communicator = self._socket(self.carol)
            connected, code = await communicator.connect()
            self.assertFalse(connected)
            self.assertEqual(code, 4403)

        async_to_sync(scenario)()

    def test_a_post_through_the_api_broadcasts_to_the_room(self):
        """The REST send goes live too, not only a socket send."""
        client = APIClient()
        client.force_authenticate(self.alice)
        with mock.patch.object(views, 'realtime') as fake:
            response = client.post(
                f'/api/members/chat/conversations/{self.room.id}/messages/',
                {'body': 'Sent from the API'},
                format='json',
            )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        fake.broadcast_message.assert_called_once()
        conversation, message = fake.broadcast_message.call_args[0]
        self.assertEqual(conversation.id, self.room.id)
        self.assertEqual(message.body, 'Sent from the API')

    def test_the_broadcast_helper_sends_to_the_room_and_each_reader(self):
        sent = []

        class FakeLayer:
            async def group_send(self, group, event):
                sent.append((group, event))

        message = services.post_message(self.room, self.alice, 'Straight to the layer')
        with mock.patch.object(realtime, 'get_channel_layer', return_value=FakeLayer()):
            realtime.broadcast_message(self.room, message)

        groups = [group for group, _event in sent]
        self.assertIn(realtime.room_group(self.room.id), groups)
        self.assertIn(realtime.user_group(self.alice.id), groups)
        self.assertIn(realtime.user_group(self.bob.id), groups)
        room_event = next(event for group, event in sent if group == realtime.room_group(self.room.id))
        self.assertEqual(room_event['type'], 'chat.message')
        self.assertEqual(room_event['message']['body'], 'Straight to the layer')


class ChatContactTests(APITestCase):
    def test_contacts_list_everyone_but_the_caller_and_search_narrows_it(self):
        self.alice = make_member('alice')
        make_member('bob')
        self.client.force_authenticate(self.alice)
        everyone = self.client.get('/api/members/chat/contacts/').data['contacts']
        self.assertEqual({person['username'] for person in everyone}, {'bob'})
        self.assertEqual(self.client.get('/api/members/chat/contacts/?search=bo').data['contacts'][0]['username'], 'bob')
