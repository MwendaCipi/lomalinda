"""Drop the "Pr" title from the pastor's name.

The name under a signature is the person's own, not their pulpit address: the
papers and letters read "George Mwenda", not "Pr George Mwenda". The record was
seeded with the title in the first name, so this strips it — for the pastor the
church seats, and for the named account even where the role flag was never
granted.
"""

import re

from django.conf import settings
from django.db import migrations
from django.db.models import Q


def drop_pastor_title(apps, schema_editor):
    User = apps.get_model(*settings.AUTH_USER_MODEL.split('.'))
    MemberProfile = apps.get_model('members', 'MemberProfile')

    pastor_ids = list(
        MemberProfile.objects.filter(
            Q(role='pastor') | Q(roles__icontains='pastor')
        ).values_list('user_id', flat=True)
    )
    pastors = User.objects.filter(
        Q(pk__in=pastor_ids)
        | Q(first_name__iexact='Pr George', last_name__iexact='Mwenda')
    )
    for user in pastors:
        first_name = (user.first_name or '').strip()
        renamed = re.sub(r'^(?:pr\.?|pastor)\s+', '', first_name, flags=re.IGNORECASE).strip()
        if renamed and renamed != first_name:
            user.first_name = renamed
            user.save(update_fields=['first_name'])


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0261_pastorate_seat_grants_pastor_role'),
    ]

    operations = [
        migrations.RunPython(drop_pastor_title, migrations.RunPython.noop),
    ]
