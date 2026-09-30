"""The church's week becomes records instead of three settings strings.

The order matters: the new table is created, the meetings the church already
had are written into it from the settings it was keeping them in, and only
then are those settings dropped. A church that had edited its times keeps
them; a church that never touched them keeps the defaults it was seeing.

The four fields were ``midweek_vespers_time``, ``midweek_vespers_link``,
``friday_vespers_time`` and ``sabbath_time`` — three "Day · 8:00 PM – 9:00 PM"
strings and one meeting link, edited from the clerk's settings page.
"""

import datetime
import re

from django.db import migrations, models
from django.utils import timezone


WEEKDAYS = {
    'monday': 0,
    'tuesday': 1,
    'wednesday': 2,
    'thursday': 3,
    'friday': 4,
    'saturday': 5,
    'sunday': 6,
}

#: Each retired string, and what it meant when the church never edited it.
#: ``(title, default text, default weekday, default start, default end,
#: online, place)`` — the fallbacks are the field defaults the model carried.
RETIRED_GATHERINGS = [
    ('Midweek Vespers', 'Wednesday · 8:00 PM – 9:00 PM', 2, (20, 0), (21, 0), True, ''),
    ('Friday Vespers', 'Friday · 5:30 PM – 6:30 PM', 4, (17, 30), (18, 30), False, 'Church sanctuary'),
    ('Sabbath Worship', 'Saturday · 8:00 AM – 4:00 PM', 5, (8, 0), (16, 0), False, 'Church grounds'),
]


def _clocks(text):
    """Every "8:00 PM" in a settings string, as (hour, minute), in order."""
    found = []
    for hour_text, minute_text, meridiem in re.findall(
        r'(\d{1,2}):(\d{2})\s*([AP]M)', text or '', re.IGNORECASE
    ):
        hour = int(hour_text) % 12
        if meridiem.upper() == 'PM':
            hour += 12
        found.append((hour, int(minute_text)))
    return found


def _weekday(text, fallback):
    match = re.match(r'\s*([A-Za-z]+)', text or '')
    return WEEKDAYS.get((match.group(1) if match else '').lower(), fallback)


def seed_weekly_meetings(apps, schema_editor):
    ChurchSettings = apps.get_model('members', 'ChurchSettings')
    WeeklyMeeting = apps.get_model('members', 'WeeklyMeeting')

    settings_row = ChurchSettings.objects.first()
    if settings_row is None:
        return

    sources = [
        (settings_row.midweek_vespers_time, settings_row.midweek_vespers_link),
        (settings_row.friday_vespers_time, ''),
        (settings_row.sabbath_time, ''),
    ]

    for order, (entry, (stored_text, stored_link)) in enumerate(zip(RETIRED_GATHERINGS, sources)):
        title, default_text, default_day, default_start, default_end, online, place = entry
        text = stored_text or default_text
        clocks = _clocks(text)
        start = clocks[0] if clocks else default_start
        end = clocks[1] if len(clocks) > 1 else default_end
        WeeklyMeeting.objects.create(
            title=title,
            weekday=_weekday(text, default_day),
            start_time=datetime.time(start[0], start[1]),
            end_time=datetime.time(end[0], end[1]),
            place='' if online else place,
            online=online,
            meeting_link=(stored_link or '') if online else '',
            is_active=True,
            sort_order=(order + 1) * 10,
            created_at=timezone.now(),
        )


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0143_remove_churchsettings_live_service_fields'),
    ]

    operations = [
        migrations.CreateModel(
            name='WeeklyMeeting',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=120)),
                ('weekday', models.PositiveSmallIntegerField(choices=[(0, 'Monday'), (1, 'Tuesday'), (2, 'Wednesday'), (3, 'Thursday'), (4, 'Friday'), (5, 'Saturday'), (6, 'Sunday')])),
                ('start_time', models.TimeField()),
                ('end_time', models.TimeField()),
                ('place', models.CharField(blank=True, help_text='Where it meets, e.g. "Church sanctuary"; blank when it meets online', max_length=160)),
                ('online', models.BooleanField(default=False, help_text='Meets over a web conference rather than in person')),
                ('meeting_link', models.URLField(blank=True, help_text='Where members join when the meeting is online')),
                ('notes', models.CharField(blank=True, max_length=255)),
                ('is_active', models.BooleanField(default=True, help_text='Unticked to retire a meeting without losing its history')),
                ('sort_order', models.PositiveIntegerField(default=100)),
                ('created_at', models.DateTimeField(default=timezone.now)),
            ],
            options={
                'ordering': ('weekday', 'start_time', 'title'),
            },
        ),
        migrations.RunPython(seed_weekly_meetings, migrations.RunPython.noop),
        migrations.RemoveField(model_name='churchsettings', name='midweek_vespers_link'),
        migrations.RemoveField(model_name='churchsettings', name='midweek_vespers_time'),
        migrations.RemoveField(model_name='churchsettings', name='friday_vespers_time'),
        migrations.RemoveField(model_name='churchsettings', name='sabbath_time'),
    ]
