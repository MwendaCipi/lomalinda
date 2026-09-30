from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0148_eldership_is_three_elders'),
    ]

    operations = [
        migrations.CreateModel(
            name='ChurchEvent',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(help_text='The event and its day, e.g. Baptism 3rd October 2026', max_length=200)),
                ('description', models.TextField(blank=True, default='')),
                ('happened_on', models.DateField(help_text='The day the event happened; orders the albums, newest first', null=True)),
                ('posted_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='church_events', to=settings.AUTH_USER_MODEL)),
                ('published', models.BooleanField(default=True, help_text='Unpublished albums stay behind the desk until the office lets them out')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'ordering': ['-happened_on', '-created_at'],
            },
        ),
        migrations.CreateModel(
            name='ChurchEventMedia',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('file', models.FileField(upload_to='church-event-media/')),
                ('event', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='media', to='members.churchevent')),
                ('uploaded_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='church_event_media', to=settings.AUTH_USER_MODEL)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'ordering': ['created_at'],
            },
        ),
    ]
