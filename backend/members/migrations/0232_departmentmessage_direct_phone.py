from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0231_reshape_historical_split_assignments'),
    ]

    operations = [
        migrations.AddField(
            model_name='departmentmessage',
            name='direct_phone',
            field=models.CharField(
                blank=True,
                default='',
                help_text='The one number texted outside the roll; blank when the roll itself was addressed',
                max_length=30,
            ),
        ),
    ]
