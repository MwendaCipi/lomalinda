from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("members", "0165_clear_head_deacon_seat"),
    ]

    operations = [
        migrations.AddField(
            model_name="prayerrequest",
            name="audience",
            field=models.CharField(
                choices=[("elders", "Elders Desk"), ("pastor", "Pastor"), ("church", "The Church")],
                default="elders",
                max_length=20,
            ),
        ),
    ]
