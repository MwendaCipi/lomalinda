from django.db import migrations


class Migration(migrations.Migration):
    """Live services are gone: the page, its links and its two settings.

    A church that wants a stream points members at its own link instead, and
    the weekly gatherings keep their own times and meeting links.
    """

    dependencies = [
        ('members', '0142_department_group_and_units'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='churchsettings',
            name='live_service_active',
        ),
        migrations.RemoveField(
            model_name='churchsettings',
            name='live_service_link',
        ),
    ]
