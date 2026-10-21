"""A programme typed at the desk, not only one uploaded as a file.

The add-event form used to be the only place a programme could be attached:
the file picker sat inside it, so a programme could only be known at the
moment the event was written. An event filed in a hurry carried none, and
there was no way back to give it one.

These rows carry the programme the desk types instead. Each entry is one
session of the order of service — Sabbath School from 8:00 to 10:00, say —
with the hours it runs, what it is, the people facilitating it under their
roles, and the events held inside it: the opening song, the mission reading,
each with its own hours and facilitator. The congregation reads the same
rows from the church calendar, on the sheet the desk typed them into. Empty
for every existing event, which is the state they are already in: nothing
has to be rewritten.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0219_giving_change_request'),
    ]

    operations = [
        migrations.AddField(
            model_name='departmentevent',
            name='program_items',
            field=models.JSONField(blank=True, default=list, help_text='The typed programme: sessions, the events inside each, their hours and facilitators'),
        ),
    ]
