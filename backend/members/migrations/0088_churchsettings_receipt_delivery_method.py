from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('members', '0087_policy_consent_versions'),
    ]

    operations = [
        migrations.AddField(
            model_name='churchsettings',
            name='receipt_delivery_method',
            field=models.CharField(
                choices=[('email', 'Email'), ('sms', 'SMS')],
                default='email',
                max_length=10,
            ),
        ),
    ]
