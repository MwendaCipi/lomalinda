from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0184_department_event_enhanced_fields'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='fundraisingcampaign',
            name='approval_status',
            field=models.CharField(
                choices=[
                    ('pending', 'Pending treasurer approval'),
                    ('approved', 'Approved'),
                    ('rejected', 'Rejected'),
                ],
                db_index=True,
                default='approved',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='fundraisingcampaign',
            name='review_note',
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name='fundraisingcampaign',
            name='reviewed_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='fundraisingcampaign',
            name='reviewed_by',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='reviewed_fund_drives',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name='fundraisingcampaign',
            name='source_account',
            field=models.ForeignKey(
                blank=True,
                help_text='Treasury account this drive raises into.',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='fundraising_campaigns',
                to='members.treasuryaccount',
            ),
        ),
    ]
