from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0194_add_givingrequest_amount_purpose'),
    ]

    operations = [
        migrations.AddField(
            model_name='memberprofile',
            name='declared_relationships',
            field=models.JSONField(blank=True, default=list, help_text='People this member is related to, with the relationship for each'),
        ),
    ]
