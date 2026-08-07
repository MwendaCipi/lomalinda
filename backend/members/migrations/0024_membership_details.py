from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('members', '0023_switch_to_paystack_checkout'),
    ]

    operations = [
        migrations.AddField(
            model_name='enrollmentrequest',
            name='joining_mode',
            field=models.CharField(choices=[('baptism', 'Baptism'), ('membership_transfer', 'Membership transfer')], default='baptism', max_length=30),
        ),
        migrations.AddField(
            model_name='enrollmentrequest',
            name='id_number',
            field=models.CharField(blank=True, max_length=40),
        ),
        migrations.AddField(
            model_name='enrollmentrequest',
            name='education_level',
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name='enrollmentrequest',
            name='profession',
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name='enrollmentrequest',
            name='date_of_birth',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='enrollmentrequest',
            name='county_of_birth',
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name='membershiptransferrequest',
            name='email',
            field=models.EmailField(blank=True, max_length=254),
        ),
    ]
