from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0135_memberprofile_deactivated_at'),
    ]

    operations = [
        migrations.AddField(
            model_name='announcementresponse',
            name='pledge_due_date',
            field=models.DateField(
                blank=True,
                help_text='The day this pledge was promised to be redeemed by',
                null=True,
            ),
        ),
        migrations.AddField(
            model_name='announcementresponse',
            name='pledge_redeemed_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='announcementresponse',
            name='pledge_redeemed_via',
            field=models.CharField(
                blank=True,
                choices=[
                    ('giving', 'Matched to their giving'),
                    ('member', 'Ticked off by the member'),
                    ('office', 'Marked by the office'),
                ],
                default='',
                max_length=10,
            ),
        ),
        migrations.AddField(
            model_name='announcementresponse',
            name='pledge_reminder_sent_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
