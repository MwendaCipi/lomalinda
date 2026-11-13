from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0278_enrollmentrequest_notified_at'),
    ]

    operations = [
        migrations.AddField(
            model_name='enrollmentrequest',
            name='reminded_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
