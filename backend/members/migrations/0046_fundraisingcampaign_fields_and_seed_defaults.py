from django.db import migrations, models
import django.utils.timezone


def seed_default_giving_purposes(apps, schema_editor):
    GivingPurpose = apps.get_model('members', 'GivingPurpose')
    default_purposes = [
        'Tithe',
        'Offering',
        '13th Sabbath',
        'Camp Meeting Expenses',
        'Msamaria Mwema',
        'Camp Meeting Goals',
        'Local Church Budget (LCB)',
        'Church Development',
        'Missions',
    ]
    for name in default_purposes:
        GivingPurpose.objects.get_or_create(name=name, defaults={'active': True})


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0045_alter_churchsettings_church_name_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='fundraisingcampaign',
            name='account_name',
            field=models.CharField(blank=True, help_text='M-Pesa / Giving account reference name (e.g. CAMP2026)', max_length=60),
        ),
        migrations.AddField(
            model_name='fundraisingcampaign',
            name='is_temporary',
            field=models.BooleanField(default=True, help_text='Designates whether this is a temporary campaign with a specific timeline'),
        ),
        migrations.AddField(
            model_name='fundraisingcampaign',
            name='member_message',
            field=models.TextField(blank=True, help_text='Broadcast notification message sent to church members'),
        ),
        migrations.AddField(
            model_name='fundraisingcampaign',
            name='schedule_message',
            field=models.BooleanField(default=False, help_text='Whether to schedule the member message for automatic dispatch'),
        ),
        migrations.AddField(
            model_name='fundraisingcampaign',
            name='scheduled_at',
            field=models.DateTimeField(blank=True, help_text='Scheduled date and time to broadcast to members', null=True),
        ),
        migrations.AddField(
            model_name='fundraisingcampaign',
            name='message_frequency',
            field=models.CharField(choices=[('once', 'One-time broadcast'), ('daily', 'Daily reminder'), ('weekly', 'Weekly (Every Sabbath)'), ('biweekly', 'Bi-weekly reminder')], default='once', max_length=20),
        ),
        migrations.AddField(
            model_name='fundraisingcampaign',
            name='message_sent',
            field=models.BooleanField(default=False, help_text='Whether the campaign message has been broadcast'),
        ),
        migrations.AddField(
            model_name='fundraisingcampaign',
            name='last_message_sent_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name='fundraisingcampaign',
            name='name',
            field=models.CharField(help_text='Campaign name, also used as default giving purpose', max_length=120, unique=True),
        ),
        migrations.RunPython(seed_default_giving_purposes, migrations.RunPython.noop),
    ]
