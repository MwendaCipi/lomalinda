"""Ministry self-declaration and the forced profile update.

The church wants four details — sex, gifts, ministry and disability —
confirmed by every member at their next login, so the profile gains a
``ministry`` choice list (Adventist Men, Adventist Women, Young Adults,
Ambassadors) and a ``profile_update_pending`` flag the sign-in response
surfaces. Employment status leaves the record entirely: it was collected
but never used, and the migration drops the column along with its data.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0105_delete_givingpurpose'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='memberprofile',
            name='employment_status',
        ),
        migrations.AddField(
            model_name='memberprofile',
            name='ministry',
            field=models.CharField(
                blank=True,
                choices=[
                    ('adventist_men', 'Adventist Men'),
                    ('adventist_women', 'Adventist Women'),
                    ('young_adults', 'Young Adults'),
                    ('ambassadors', 'Ambassadors'),
                ],
                help_text='Ministry the member belongs to, self-declared at profile update',
                max_length=30,
            ),
        ),
        migrations.AddField(
            model_name='memberprofile',
            name='profile_update_pending',
            field=models.BooleanField(
                default=False,
                help_text='Require sex, gifts, ministry and disability to be completed at the next login',
            ),
        ),
    ]
