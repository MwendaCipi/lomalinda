"""Separate a membership transfer from a plain church-member request.

The join form now offers both: "A church member" asks nothing further, while
"Membership transfer" is leaving a named church and has to say which. The two
were the same value before, so the label of the older one moves to what the
form has always called it.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0136_announcementresponse_pledge_dates'),
    ]

    operations = [
        migrations.AlterField(
            model_name='enrollmentrequest',
            name='joining_mode',
            field=models.CharField(
                choices=[
                    ('baptism', 'Baptism'),
                    ('membership_transfer', 'A church member'),
                    ('transfer_in', 'Membership transfer'),
                    ('friend', 'Friend of SDA Loma Linda'),
                    ('sabbath_school', 'Sabbath School'),
                ],
                default='baptism',
                max_length=30,
            ),
        ),
    ]
