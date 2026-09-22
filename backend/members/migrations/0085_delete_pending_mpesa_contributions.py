from django.db import migrations


def delete_pending_mpesa_contributions(apps, schema_editor):
    """Remove pending M-Pesa contributions left by the old initiate-time row.

    The giving flow now creates the Contribution only when Safaricom's
    callback confirms the money arrived. Rows still sitting in `pending`
    were prompts that were cancelled, timed out or never called back —
    money the church never received — so they are deleted rather than
    left cluttering the treasury records.
    """
    Contribution = apps.get_model('members', 'Contribution')
    Contribution.objects.filter(status='pending', payment_method='mpesa').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0084_remove_churchsettings_invitation_link_lifetime_days_and_more'),
    ]

    operations = [
        migrations.RunPython(delete_pending_mpesa_contributions, migrations.RunPython.noop),
    ]
