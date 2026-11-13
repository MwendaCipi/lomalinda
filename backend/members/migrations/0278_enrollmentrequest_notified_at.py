from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0277_churchevent_department'),
    ]

    operations = [
        migrations.AddField(
            model_name='enrollmentrequest',
            name='notified_at',
            field=models.DateTimeField(
                blank=True,
                help_text='When the office was first told this request was made',
                null=True,
            ),
        ),
    ]
