from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0193_add_contribution_honoree_phone'),
    ]

    operations = [
        migrations.AddField(
            model_name='givingrequest',
            name='amount',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
        ),
        migrations.AddField(
            model_name='givingrequest',
            name='purpose',
            field=models.CharField(blank=True, max_length=160),
        ),
    ]
