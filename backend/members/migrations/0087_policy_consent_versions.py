from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('members', '0086_memberprofile_must_change_password'),
    ]

    operations = [
        migrations.AddField(
            model_name='memberprofile',
            name='privacy_accepted_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='memberprofile',
            name='privacy_policy_version',
            field=models.CharField(blank=True, default='', max_length=20),
        ),
        migrations.AddField(
            model_name='memberprofile',
            name='terms_accepted_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='memberprofile',
            name='terms_of_use_version',
            field=models.CharField(blank=True, default='', max_length=20),
        ),
        migrations.AddField(
            model_name='enrollmentrequest',
            name='privacy_policy_version',
            field=models.CharField(blank=True, default='', max_length=20),
        ),
        migrations.AddField(
            model_name='enrollmentrequest',
            name='terms_accepted_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='enrollmentrequest',
            name='terms_of_use_version',
            field=models.CharField(blank=True, default='', max_length=20),
        ),
    ]
