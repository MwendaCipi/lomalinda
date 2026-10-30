from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0247_departmentletter_letter_date_recipient_address'),
    ]

    operations = [
        migrations.AddField(
            model_name='departmentletterrequest',
            name='recipient_name',
            field=models.CharField(blank=True, default='', max_length=120),
        ),
        migrations.AddField(
            model_name='departmentletterrequest',
            name='recipient_town',
            field=models.CharField(blank=True, default='', max_length=80),
        ),
        migrations.AddField(
            model_name='departmentletterrequest',
            name='recipient_phone',
            field=models.CharField(blank=True, default='', max_length=40),
        ),
        migrations.AddField(
            model_name='departmentletterrequest',
            name='recipient_email',
            field=models.CharField(blank=True, default='', max_length=120),
        ),
    ]
