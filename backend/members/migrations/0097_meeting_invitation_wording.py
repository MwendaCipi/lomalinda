"""Bring the stored invitation templates up to the new wording.

The two meeting templates existed in the settings table but nobody had edited
them, so they still held the old defaults — and a stored default beats the model
default for every meeting that uses it. Rows that were customised are left alone;
only the untouched old defaults are replaced.

Placeholders now filled per recipient: {greeting}, {name}, {church}, {title},
{day}, {date}, {start_time}, {end_time}, {meeting_time}, {location}.
"""
from django.db import migrations

OLD_BOARD_MESSAGE = (
    "Dear Church Board Member, you are hereby invited to attend the Church Board Meeting: "
    "'{title}' scheduled for {meeting_date} at {location}. Please review the agendas and "
    "attached documents."
)
NEW_BOARD_MESSAGE = (
    "{greeting}, {name}. {church} is inviting you to a board meeting scheduled for "
    "{day}, {date} from {start_time} to {end_time}. God bless you as you purpose to attend."
)
OLD_BUSINESS_MESSAGE = (
    "Dear member, you are warmly invited to our upcoming Church Business Meeting: "
    "'{title}' on {meeting_date} at {location}. Your presence and active participation "
    "are highly valued!"
)
NEW_BUSINESS_MESSAGE = (
    "{greeting}, {name}. {church} is inviting you to a church business meeting scheduled "
    "for {day}, {date} at {meeting_time}, {location}. God bless you as you purpose to attend."
)


def apply_new_wording(apps, schema_editor):
    ChurchSettings = apps.get_model('members', 'ChurchSettings')
    for settings_row in ChurchSettings.objects.all():
        changed = []
        if (settings_row.default_board_meeting_invitation_message or '').strip() == OLD_BOARD_MESSAGE:
            settings_row.default_board_meeting_invitation_message = NEW_BOARD_MESSAGE
            changed.append('default_board_meeting_invitation_message')
        if (settings_row.default_business_meeting_invitation_message or '').strip() == OLD_BUSINESS_MESSAGE:
            settings_row.default_business_meeting_invitation_message = NEW_BUSINESS_MESSAGE
            changed.append('default_business_meeting_invitation_message')
        if changed:
            settings_row.save(update_fields=changed)


def restore_old_wording(apps, schema_editor):
    ChurchSettings = apps.get_model('members', 'ChurchSettings')
    for settings_row in ChurchSettings.objects.all():
        changed = []
        if settings_row.default_board_meeting_invitation_message == NEW_BOARD_MESSAGE:
            settings_row.default_board_meeting_invitation_message = OLD_BOARD_MESSAGE
            changed.append('default_board_meeting_invitation_message')
        if settings_row.default_business_meeting_invitation_message == NEW_BUSINESS_MESSAGE:
            settings_row.default_business_meeting_invitation_message = OLD_BUSINESS_MESSAGE
            changed.append('default_business_meeting_invitation_message')
        if changed:
            settings_row.save(update_fields=changed)


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0096_board_meeting_times'),
    ]

    operations = [
        migrations.RunPython(apply_new_wording, restore_old_wording),
    ]
