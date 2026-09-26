from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0122_backfill_role_history'),
    ]

    operations = [
        migrations.AddField(
            model_name='churchsettings',
            name='split_receipt_message',
            field=models.TextField(
                blank=True,
                default=(
                    'Dear {name},\n\n'
                    'Your contribution of {amount} has been received and distributed accordingly as follows\n\n'
                    '{distribution}\n\n'
                    'Thank you, and may God bless you abundantly'
                ),
            ),
        ),
    ]
