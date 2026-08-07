from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('members', '0021_prayerrequest_phone_number_testimony_phone_number'),
    ]

    operations = [
        migrations.AddField(
            model_name='contribution',
            name='payment_method',
            field=models.CharField(choices=[('mpesa', 'M-Pesa'), ('card', 'Card')], default='mpesa', max_length=20),
        ),
        migrations.AddField(
            model_name='contribution',
            name='stripe_session_id',
            field=models.CharField(blank=True, max_length=255, null=True, unique=True),
        ),
    ]
