"""Add department field to DutyRota.

Allows pulpit team and duty rota lines to be associated with specific ministries
or departments (e.g. youth, women, personal_ministries) so that each department
can keep its own pulpit team, while the Personal Ministries desk retains church-wide
visibility and management over all of them.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0256_memberprofile_email_verified_at'),
    ]

    operations = [
        migrations.AddField(
            model_name='dutyrota',
            name='department',
            field=models.CharField(
                blank=True,
                default='',
                help_text='Which ministry or department this duty line was created under',
                max_length=60,
            ),
        ),
    ]
