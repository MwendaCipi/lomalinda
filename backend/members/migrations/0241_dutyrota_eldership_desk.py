"""The Eldership keeps a rota of its own, separate from the deaconate's.

Existing lines keep their existing desks; only the set of desks accepted by
DutyRota grows.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0240_withdrawal_treasurer_approval'),
    ]

    operations = [
        migrations.AlterField(
            model_name='dutyrota',
            name='desk',
            field=models.CharField(
                choices=[
                    ('deaconate', 'Deaconate duty rota'),
                    ('pulpit', 'Pulpit team'),
                    ('music', 'Music duties'),
                    ('eldership', 'Eldership duty rota'),
                ],
                default='deaconate',
                help_text='Which desk keeps this line: the deaconate duty rota, the pulpit team, music duties, or the eldership',
                max_length=20,
            ),
        ),
    ]
