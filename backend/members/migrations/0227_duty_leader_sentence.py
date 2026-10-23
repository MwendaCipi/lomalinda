"""Every duty notice points the officer at the desk's own leader.

Three things move at once:

* the \"cannot serve\" sentence in all four shipped wordings — the rostering
  notice and the day-before reminder, for every desk — now reads
  ``notify the {desk} ... through here {leader_chat_link} or contact the
  leader on {leader_phone}`` instead of a dead-end \"notify the duty desk\";
* music's wording stops saying \"if you cannot make it ... contact the music
  desk\" and reads the same sentence the other desks read;
* the fields' model defaults catch up to that wording, so a settings row
  written from now on writes it too — and any stored row that still carries
  the old shipped wording verbatim (that is, a church that never edited the
  templates itself) is refreshed onto the new one. A row the church has
  worded itself is left alone: those are the church's words, not ours.

The leader's chat link is a deep link into the church's chat (``/chat?dm=``),
and the phone comes off the leader's profile; see ``members.duty.desk_leader``.
"""

from django.db import migrations, models

OLD_DEFAULTS = (
    (
        'default_duty_assignment_message',
        (
            '{greeting}, {name}.\n\n'
            'You have been rostered for {duty} on {day}, {date} at {shift}. '
            'Your part: {role}.\n\n'
            'If you cannot serve that day, notify the duty desk. {church}'
        ),
    ),
    (
        'default_duty_reminder_message',
        (
            '{greeting}, {name}. Tomorrow, {date}, at {shift} you are rostered for '
            '{duty}. Your part: {role}. God bless you as you serve. {church}'
        ),
    ),
    (
        'default_pulpit_assignment_message',
        (
            '{greeting}, {name}.\n\n'
            'You have been rostered for {duty} on {day}, {date} at {shift}. '
            'Your part: {role}.\n\n'
            'If you cannot serve that day, please notify the PM desk. {church}'
        ),
    ),
    (
        'default_music_assignment_message',
        (
            '{greeting}, {name}.\n\n'
            'You have been rostered for {duty} on {day}, {date} at {shift}. '
            'Your part: {role}.\n\n'
            'If you cannot make it for that day, please contact the music desk. {church}'
        ),
    ),
)

DESTINATION_WORDING = (
    'If you cannot serve that day, please notify the {desk} by sending a '
    'message through here {leader_chat_link} or contact the leader on '
    '{leader_phone}. {church}'
)


def assignment_default():
    return (
        '{greeting}, {name}.\n\n'
        'You have been rostered for {duty} on {day}, {date} at {shift}. '
        'Your part: {role}.\n\n'
        + DESTINATION_WORDING
    )


def reminder_default():
    return (
        '{greeting}, {name}. Tomorrow, {date}, at {shift} you are rostered for '
        '{duty}. Your part: {role}. If you cannot serve that day, notify the '
        '{desk} on {leader_chat_link} or call the leader on {leader_phone}. '
        'God bless you as you serve. {church}'
    )


NEW_DEFAULTS = {
    'default_duty_assignment_message': assignment_default(),
    'default_duty_reminder_message': reminder_default(),
    'default_pulpit_assignment_message': assignment_default(),
    'default_music_assignment_message': assignment_default(),
}


def refresh_shipped_wording(apps, schema_editor):
    """Move rows still on the shipped wording onto the new shipped wording.

    Only an exact match of the previous default is rewritten. A church that
    wrote its own duty wording keeps it — the placeholders it does not know
    simply stay unfilled (``render_message`` leaves unknown ones standing)
    until the church adopts them on its settings screen.
    """
    ChurchSettings = apps.get_model('members', 'ChurchSettings')
    for field, old in OLD_DEFAULTS:
        ChurchSettings.objects.filter(**{field: old}).update(**{field: NEW_DEFAULTS[field]})


def restore_shipped_wording(apps, schema_editor):
    """Undo only what ``refresh_shipped_wording`` wrote: new default -> old."""
    ChurchSettings = apps.get_model('members', 'ChurchSettings')
    for field, old in OLD_DEFAULTS:
        ChurchSettings.objects.filter(**{field: NEW_DEFAULTS[field]}).update(**{field: old})


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0226_churchsettings_music_assignment_message'),
    ]

    operations = [
        migrations.AlterField(
            model_name='churchsettings',
            name='default_duty_assignment_message',
            field=models.TextField(
                blank=True,
                default=(
                    '{greeting}, {name}.\n\n'
                    'You have been rostered for {duty} on {day}, {date} at {shift}. '
                    'Your part: {role}.\n\n'
                    'If you cannot serve that day, please notify the {desk} by sending a '
                    'message through here {leader_chat_link} or contact the leader on '
                    '{leader_phone}. {church}'
                ),
            ),
        ),
        migrations.AlterField(
            model_name='churchsettings',
            name='default_duty_reminder_message',
            field=models.TextField(
                blank=True,
                default=(
                    '{greeting}, {name}. Tomorrow, {date}, at {shift} you are rostered for '
                    '{duty}. Your part: {role}. If you cannot serve that day, notify the '
                    '{desk} on {leader_chat_link} or call the leader on {leader_phone}. '
                    'God bless you as you serve. {church}'
                ),
            ),
        ),
        migrations.AlterField(
            model_name='churchsettings',
            name='default_pulpit_assignment_message',
            field=models.TextField(
                blank=True,
                default=(
                    '{greeting}, {name}.\n\n'
                    'You have been rostered for {duty} on {day}, {date} at {shift}. '
                    'Your part: {role}.\n\n'
                    'If you cannot serve that day, please notify the {desk} by sending a '
                    'message through here {leader_chat_link} or contact the leader on '
                    '{leader_phone}. {church}'
                ),
            ),
        ),
        migrations.AlterField(
            model_name='churchsettings',
            name='default_music_assignment_message',
            field=models.TextField(
                blank=True,
                default=(
                    '{greeting}, {name}.\n\n'
                    'You have been rostered for {duty} on {day}, {date} at {shift}. '
                    'Your part: {role}.\n\n'
                    'If you cannot serve that day, please notify the {desk} by sending a '
                    'message through here {leader_chat_link} or contact the leader on '
                    '{leader_phone}. {church}'
                ),
            ),
        ),
        migrations.RunPython(refresh_shipped_wording, restore_shipped_wording),
    ]
