from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('members', '0020_externalresourcelink'),
    ]

    operations = [
        migrations.AddField(
            model_name='prayerrequest',
            name='phone_number',
            field=models.CharField(blank=True, max_length=40),
        ),
        migrations.AddField(
            model_name='testimony',
            name='phone_number',
            field=models.CharField(blank=True, max_length=40),
        ),
    ]
