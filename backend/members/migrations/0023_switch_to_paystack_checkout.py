from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('members', '0022_contribution_card_checkout'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='contribution',
            name='stripe_session_id',
        ),
        migrations.AddField(
            model_name='contribution',
            name='paystack_reference',
            field=models.CharField(blank=True, max_length=100, null=True, unique=True),
        ),
    ]
