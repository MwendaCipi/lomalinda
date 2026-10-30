from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0248_departmentletter_recipient_pieces'),
    ]

    operations = [
        migrations.AddField(
            model_name='departmentletterrequest',
            name='share_token',
            field=models.UUIDField(blank=True, null=True, unique=True),
        ),
        migrations.AddField(
            model_name='departmentletterrequest',
            name='recipient_response',
            field=models.CharField(
                blank=True, choices=[('', 'Not yet answered'), ('accepted', 'Accepted'), ('turned_down', 'Turned down')],
                default='', max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='departmentletterrequest',
            name='recipient_comment',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='departmentletterrequest',
            name='responded_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
