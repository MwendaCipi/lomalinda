from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0277_churchevent_department'),
    ]

    operations = [
        migrations.AddField(
            model_name='enrollmentrequest',
            name='notified_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
