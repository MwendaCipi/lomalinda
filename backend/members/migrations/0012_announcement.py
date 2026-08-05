from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('members', '0011_enrollmentrequest_alter_memberprofile_role'),
    ]

    operations = [
        migrations.CreateModel(
            name='Announcement',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=160)),
                ('text', models.TextField()),
                ('detail', models.TextField(blank=True)),
                ('href', models.CharField(blank=True, max_length=255)),
                ('visibility', models.CharField(choices=[('public', 'Public'), ('members', 'Members only')], default='public', max_length=20)),
                ('published', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={'ordering': ['-created_at']},
        ),
    ]
