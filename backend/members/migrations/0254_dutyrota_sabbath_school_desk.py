"""The Sabbath School keeps a rota of its own, beside the four that exist.

Its study groups rotate the duties of the hour — who leads the lesson, who
keeps the register, who reads the mission story — and the desk had nowhere to
write them. Existing lines keep their own desks; only the set of desks the
table accepts grows.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0253_family_life_categories'),
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
                    ('sabbath_school', 'Sabbath School duty rota'),
                ],
                default='deaconate',
                help_text='Which desk keeps this line: the deaconate duty rota, the pulpit team, music duties, the eldership, or Sabbath School',
                max_length=20,
            ),
        ),
    ]
