from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0056_cashcontribution_giver_email_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='churchsettings',
            name='default_business_meeting_invitation_message',
            field=models.TextField(
                blank=True,
                default="Dear member, you are warmly invited to our upcoming Church Business Meeting: '{title}' on {meeting_date} at {location}. Your presence and active participation are highly valued!"
            ),
        ),
        migrations.AddField(
            model_name='churchsettings',
            name='default_board_meeting_invitation_message',
            field=models.TextField(
                blank=True,
                default="Dear Church Board Member, you are hereby invited to attend the Church Board Meeting: '{title}' scheduled for {meeting_date} at {location}. Please review the agendas and attached documents."
            ),
        ),
        migrations.AddField(
            model_name='churchsettings',
            name='board_roles',
            field=models.JSONField(
                blank=True,
                default=list,
                help_text='List of role keys that belong to the church board'
            ),
        ),
        migrations.AddField(
            model_name='boardmeeting',
            name='meeting_time',
            field=models.CharField(blank=True, default='5:00 PM', max_length=80),
        ),
        migrations.AddField(
            model_name='boardmeeting',
            name='location',
            field=models.CharField(blank=True, default='Board Room / Main Sanctuary', max_length=160),
        ),
        migrations.AddField(
            model_name='boardmeeting',
            name='notify_sms',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='boardmeeting',
            name='notify_email',
            field=models.BooleanField(default=True),
        ),
        migrations.AlterField(
            model_name='boardmeeting',
            name='agenda',
            field=models.TextField(blank=True, help_text='Meeting agenda summary'),
        ),
        migrations.AddField(
            model_name='businessmeeting',
            name='meeting_time',
            field=models.CharField(blank=True, default='2:00 PM', max_length=80),
        ),
        migrations.AddField(
            model_name='businessmeeting',
            name='notify_sms',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='businessmeeting',
            name='notify_email',
            field=models.BooleanField(default=True),
        ),
        migrations.CreateModel(
            name='BoardMeetingAgenda',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=200)),
                ('description', models.TextField(blank=True, default='')),
                ('order', models.PositiveIntegerField(default=1)),
                ('document', models.FileField(blank=True, null=True, upload_to='board-meeting-docs/')),
                ('document_name', models.CharField(blank=True, default='', max_length=160)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('meeting', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='agendas', to='members.boardmeeting')),
            ],
            options={
                'ordering': ['order', 'id'],
            },
        ),
    ]
