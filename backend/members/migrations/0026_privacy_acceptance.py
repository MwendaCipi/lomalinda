from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('members', '0025_remove_visitation_location_description'),
    ]

    operations = [
        migrations.AddField(
            model_name='enrollmentrequest',
            name='privacy_accepted_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='membershiptransferrequest',
            name='privacy_accepted_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
