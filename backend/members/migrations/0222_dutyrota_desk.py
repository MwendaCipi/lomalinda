"""Two desks keep a rota: the deaconate's, and the pulpit team's.

The pulpit team rosters who preaches, plays, reads and leads on a Sabbath the
same way the deaconate rosters who serves the service — names, a day, a shift
— so it is the same table with a new column saying which desk owns the line.
Every existing line is the deaconate's, and stays that way.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0221_duty_sms_templates'),
    ]

    operations = [
        migrations.AddField(
            model_name='dutyrota',
            name='desk',
            field=models.CharField(
                choices=[
                    ('deaconate', 'Deaconate duty rota'),
                    ('pulpit', 'Pulpit team'),
                ],
                default='deaconate',
                help_text='Which desk keeps this line: the deaconate duty rota, or the pulpit team',
                max_length=20,
            ),
        ),
    ]
