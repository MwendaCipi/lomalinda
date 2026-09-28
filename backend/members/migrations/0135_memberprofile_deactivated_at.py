from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0134_remove_churchsettings_dashboard_encouragement_line'),
    ]

    operations = [
        migrations.AddField(
            model_name='memberprofile',
            name='deactivated_at',
            field=models.DateTimeField(
                blank=True,
                help_text='When an officer deactivated this account; null if never deactivated',
                null=True,
            ),
        ),
    ]
