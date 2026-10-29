from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0242_withdrawal_pastor_elder_treasurer_chain'),
    ]

    operations = [
        migrations.AddField(
            model_name='churchsettings',
            name='letterhead',
            field=models.ImageField(blank=True, upload_to='letterhead/'),
        ),
    ]
