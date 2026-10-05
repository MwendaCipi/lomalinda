"""The announcement channels become the groups they served.

Chat used to give every area two rooms — a flat group everyone on the roll
talked in, and a channel only its leaders posted to. The church now keeps one
flat group per area, so a channel's words move into the group's room rather
than going quiet: each message is re-homed with its sender, its timestamp and
its readers' read marks intact, an empty channel simply closes, and a channel
whose group never existed becomes a group in its place. The church-wide
``church:announce`` channel likewise merges into ``church:family``.
"""

from django.db import migrations, models


def channel_target_key(channel):
    """The flat group a channel's words belong to, by its key."""
    key = channel.key or ''
    if key == 'church:announce':
        return 'church:family'
    if key.startswith('dept:'):
        if key.endswith(':announce'):
            return key[: -len(':announce')]
        return key
    return None


def migrate_existing_channels(apps, schema_editor):
    Conversation = apps.get_model('chat', 'Conversation')
    Participant = apps.get_model('chat', 'Participant')
    Department = apps.get_model('members', 'Department')

    for channel in Conversation.objects.filter(kind='channel').order_by('id'):
        target_key = channel_target_key(channel)
        if target_key is None:
            # A shape the app never made: keep the room and its words by
            # turning it into the plain group its participants already share.
            channel.kind = 'group'
            channel.save(update_fields=['kind'])
            continue

        target = Conversation.objects.filter(kind='group', key=target_key).first()
        if target is None:
            title = 'Church Family' if target_key == 'church:family' else (channel.title or '')
            if channel.department_id is not None:
                department = Department.objects.filter(pk=channel.department_id).first()
                if department is not None:
                    title = department.name
            target = Conversation.objects.create(
                kind='group',
                key=target_key,
                department_id=channel.department_id,
                title=title,
            )

        # The words move whole: sender, body and timestamps travel with them,
        # so the group's history reads as if it had always been the one room.
        channel.messages.all().update(conversation=target)

        latest = target.messages.order_by('-created_at', '-id').values('created_at').first()
        stamp = latest['created_at'] if latest else channel.last_message_at
        if stamp and (target.last_message_at is None or stamp > target.last_message_at):
            target.last_message_at = stamp
            target.save(update_fields=['last_message_at'])

        # The people move too. A member the group never had joins it; one it
        # already held keeps their row, with the newer read mark and the old
        # moderator flag carried over.
        seated = {row.member_id: row for row in target.participants.all()}
        for row in channel.participants.all():
            place = seated.get(row.member_id)
            if place is None:
                Participant.objects.create(
                    conversation=target,
                    member_id=row.member_id,
                    is_moderator=row.is_moderator,
                    joined_at=row.joined_at,
                    last_read_at=row.last_read_at,
                    muted=row.muted,
                )
                continue
            updates = []
            if row.is_moderator and not place.is_moderator:
                place.is_moderator = True
                updates.append('is_moderator')
            if row.last_read_at and (place.last_read_at is None or row.last_read_at > place.last_read_at):
                place.last_read_at = row.last_read_at
                updates.append('last_read_at')
            if updates:
                place.save(update_fields=updates)

        # The channel itself closes; its participants went with the room.
        channel.delete()


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(migrate_existing_channels, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='conversation',
            name='kind',
            field=models.CharField(
                choices=[
                    ('dm', 'Direct message'),
                    ('group', 'Area group'),
                    ('office', 'Office thread'),
                ],
                max_length=16,
            ),
        ),
    ]
