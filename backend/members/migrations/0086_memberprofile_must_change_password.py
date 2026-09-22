from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('members', '0085_delete_pending_mpesa_contributions'),
    ]

    operations = [
        migrations.AddField(
            model_name='memberprofile',
            name='must_change_password',
            field=models.BooleanField(default=False, help_text='Require a password change at the next login'),
        ),
    ]
