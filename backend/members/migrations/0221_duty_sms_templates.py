from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0220_departmentevent_program_items'),
    ]

    operations = [
        migrations.AddField(
            model_name='churchsettings',
            name='default_duty_assignment_message',
            field=models.TextField(
                blank=True,
                default=(
                    '{greeting}, {name}.\n\n'
                    'You have been rostered for {duty} on {day}, {date} at {shift}. '
                    'Your part: {role}.\n\n'
                    'If you cannot serve that day, notify the duty desk. {church}'
                ),
            ),
        ),
        migrations.AddField(
            model_name='churchsettings',
            name='default_duty_reminder_message',
            field=models.TextField(
                blank=True,
                default=(
                    '{greeting}, {name}. Tomorrow, {date}, at {shift} you are rostered for '
                    '{duty}. Your part: {role}. God bless you as you serve. {church}'
                ),
            ),
        ),
    ]
