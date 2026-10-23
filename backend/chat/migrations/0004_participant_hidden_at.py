from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0003_message_attachment'),
    ]

    operations = [
        migrations.AddField(
            model_name='participant',
            name='hidden_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
