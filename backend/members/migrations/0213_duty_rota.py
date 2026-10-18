"""The deaconate's duty rota becomes the church's record of who serves when.

The rota was the last desk page still living in the browser: the deaconate
page kept its duties in a React array, so a shift scheduled for next Sabbath
was gone with the next reload, and nothing the desk wrote could be read back
by anyone else — the Head Deaconess's rota and the church's were two
different lists, neither of them kept.

These are the church's rows instead. A line names the duty, its date, the
shift, the kind of duty and the officers rostered on it as the names the desk
listed (a deacon serving a shift need not hold an account in the app), and it
remembers who scheduled it. Reading and writing are gated in the view by
`members.views.can_manage_deaconate`, so this migration carries no data and
nothing to roll back beyond the table it creates.
"""

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0212_seed_education_ministry'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='DutyRota',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=200)),
                ('duty_date', models.DateField()),
                ('shift', models.CharField(blank=True, default='', max_length=80)),
                ('duty_type', models.CharField(blank=True, default='', max_length=80)),
                ('assigned_team', models.JSONField(blank=True, default=list)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='duty_rota_entries', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['duty_date', 'id'],
            },
        ),
    ]
