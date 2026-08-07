from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ('members', '0024_membership_details'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='visitationrequest',
            name='location_description',
        ),
    ]
