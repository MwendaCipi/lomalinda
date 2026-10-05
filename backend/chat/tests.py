from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

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


class ChatContactTests(APITestCase):
    def test_contacts_list_everyone_but_the_caller_and_search_narrows_it(self):
        self.alice = make_member('alice')
        make_member('bob')
        self.client.force_authenticate(self.alice)
        everyone = self.client.get('/api/members/chat/contacts/').data['contacts']
        self.assertEqual({person['username'] for person in everyone}, {'bob'})
        self.assertEqual(self.client.get('/api/members/chat/contacts/?search=bo').data['contacts'][0]['username'], 'bob')
