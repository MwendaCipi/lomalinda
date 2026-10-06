from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0002_merge_announcement_channels'),
    ]

    operations = [
        migrations.AddField(
            model_name='message',
            name='attachment',
            field=models.FileField(blank=True, null=True, upload_to='chat/%Y/%m/'),
        ),
    ]
