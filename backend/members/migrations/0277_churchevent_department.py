from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0276_service_history_and_handover_letter'),
    ]

    operations = [
        migrations.AddField(
            model_name='churchevent',
            name='department',
            field=models.CharField(
                blank=True,
                db_index=True,
                default='',
                help_text="The area whose desk keeps this album; blank for the church's own wall",
                max_length=100,
            ),
        ),
    ]
