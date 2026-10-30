# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0246_treasuryperiod'),
    ]

    operations = [
        migrations.AddField(
            model_name='departmentletterrequest',
            name='letter_date',
            field=models.CharField(blank=True, default='', max_length=40),
        ),
        migrations.AddField(
            model_name='departmentletterrequest',
            name='recipient_address',
            field=models.CharField(blank=True, default='', max_length=255),
        ),
    ]
