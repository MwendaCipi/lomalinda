"""The music desk's own rostering wording, editable on the church settings.

Music's notices used to speak the deaconate's words — "notify the duty desk",
which names no desk and sends a singer nowhere. They speak the desk's own
from now on, and the church can write its own, the way the receipts and the
meeting invitations already may.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0225_dutyrota_music_desk'),
    ]

    operations = [
        migrations.AddField(
            model_name='churchsettings',
            name='default_music_assignment_message',
            field=models.TextField(
                blank=True,
                default=(
                    '{greeting}, {name}.\n\n'
                    'You have been rostered for {duty} on {day}, {date} at {shift}. '
                    'Your part: {role}.\n\n'
                    'If you cannot make it for that day, please contact the music desk. {church}'
                ),
            ),
        ),
    ]
