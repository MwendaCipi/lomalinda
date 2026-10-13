"""The reconciliation desk is the treasury desk: rename it end to end.

The word "reconciliation" named the record, its table, its date column and the
desk's own path. The church reads all of it as the treasury, so the record
moves with the page: ``RenameModel`` renames the table and the field rename
renames the column, so nothing is copied and no row is lost. Notifications
already sent name the desk's old path, and a bell that lands on a gone page is
an ask the office cannot answer, so the stored links move too.
"""

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
from django.db.models import Value
from django.db.models.functions import Replace

OLD_PATH = '/administration/reconciliation'
NEW_PATH = '/administration/treasury'


def move_stored_links(apps, schema_editor):
    ChurchNotification = apps.get_model('members', 'ChurchNotification')
    ChurchNotification.objects.filter(link__contains=OLD_PATH).update(
        link=Replace('link', Value(OLD_PATH), Value(NEW_PATH))
    )


def restore_stored_links(apps, schema_editor):
    ChurchNotification = apps.get_model('members', 'ChurchNotification')
    ChurchNotification.objects.filter(link__contains=NEW_PATH).update(
        link=Replace('link', Value(NEW_PATH), Value(OLD_PATH))
    )


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0199_blank_invented_giver_emails'),
    ]

    operations = [
        migrations.RenameModel(
            old_name='ContributionReconciliation',
            new_name='ContributionTreasury',
        ),
        migrations.RenameField(
            model_name='contributiontreasury',
            old_name='reconciliation_date',
            new_name='treasury_date',
        ),
        migrations.AlterModelOptions(
            name='contributiontreasury',
            options={'ordering': ['-treasury_date']},
        ),
        migrations.AlterField(
            model_name='contributiontreasury',
            name='reconciled_by',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='contribution_treasuries',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.RunPython(move_stored_links, restore_stored_links),
    ]
