"""The music desk keeps its own line on the rota table.

The music department rosters who plays, sings and leads on a day exactly the
way the deaconate rosters who serves and the Personal Ministries desk rosters
its pulpit team — so it is the same table with one more desk to file its lines
under. Every existing line keeps the desk it always had.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0224_announcement_giving_actions'),
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
                ],
                default='deaconate',
                help_text='Which desk keeps this line: the deaconate duty rota, the pulpit team, or music duties',
                max_length=20,
            ),
        ),
    ]
