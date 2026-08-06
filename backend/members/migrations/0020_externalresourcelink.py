from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('members', '0019_visitationrequest'),
    ]

    operations = [
        migrations.CreateModel(
            name='ExternalResourceLink',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('key', models.CharField(max_length=100, unique=True)),
                ('url', models.URLField(max_length=500)),
                ('resolved_at', models.DateTimeField()),
            ],
        ),
    ]
