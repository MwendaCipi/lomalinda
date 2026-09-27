from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('members', '0126_churchsettings_vapid_private_key_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='memberprofile',
            name='announce_email',
            field=models.BooleanField(default=True, help_text='Receive announcement broadcasts by email'),
        ),
        migrations.AddField(
            model_name='memberprofile',
            name='announce_push',
            field=models.BooleanField(default=True, help_text='Receive announcements as phone/browser notifications'),
        ),
    ]
