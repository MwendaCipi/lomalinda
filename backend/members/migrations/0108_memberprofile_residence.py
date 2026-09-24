"""Members carry a residence, like the rest of their contact details.

Where a member lives is part of who the office keeps on the roll — the
visitation team asks for it, and the roster shows it next to their phone
number. It is optional and free-form: an estate, a street, a town.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0107_merge_20260924_0252'),
    ]

    operations = [
        migrations.AddField(
            model_name='memberprofile',
            name='residence',
            field=models.CharField(blank=True, default='', help_text="Where the member lives — estate, street or town", max_length=160),
        ),
    ]
