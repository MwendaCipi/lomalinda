"""Expunge the minted friend accounts the first pass could not see.

Migration 0259 asked for a profile whose address had never been confirmed, and
migration 0256 had already stamped every profile then on record as confirmed.
That guard therefore excluded every account on the church's database and the
pass removed nothing, while the minted ``friend.*`` accounts sat there still.

What actually tells a minted account from a person's own is use, and each test
below stands alone: an unusable password (nobody ever set one), no sign-in, no
gift pointing at it, and no office. The account type is not asked about — the
desk wrote the same placeholder under more than one type — and neither is the
confirmed address, which says nothing about a person when a migration stamped
it on everyone.

Accounts that fail any test stay: a giver who reset the password or signed in
claimed theirs, and a minted account carrying gifts is the link a real giver's
digital giving resolves through (that FK is PROTECT, so it could not go anyway).
The ledger does not move: cash receipts keep the name, phone and address they
were written with, and the people themselves can now join with their own email,
which the placeholder used to refuse.
"""

from django.conf import settings
from django.db import migrations
from django.db.models.deletion import ProtectedError

#: The desk's own prefix for an account it minted: ``friend.<phone|email|name>``.
GHOST_USERNAME_PREFIX = 'friend.'

#: What ``set_unusable_password()`` writes. Checked in SQL because a historical
#: model (which is what a data migration sees) carries no ``has_usable_password``.
UNUSABLE_PASSWORD_PREFIX = '!'


def ghost_accounts(User):
    """Minted accounts nobody has ever used."""
    return (
        User.objects
        .filter(username__startswith=GHOST_USERNAME_PREFIX)
        .filter(password__startswith=UNUSABLE_PASSWORD_PREFIX)
        .filter(is_staff=False, is_superuser=False)
        .filter(last_login__isnull=True)
        .exclude(contributions__isnull=False)
    )


def expunge_ghost_accounts(apps, schema_editor):
    User = apps.get_model(*settings.AUTH_USER_MODEL.split('.'))
    expunged = 0
    kept = 0
    for user in ghost_accounts(User):
        try:
            user.delete()
        except ProtectedError:
            # Something else still points here; leave it for a person to read.
            kept += 1
            continue
        expunged += 1
    if expunged or kept:
        print(
            f'Expunged {expunged} unused minted friend account(s); '
            f'left {kept} that were still referenced.'
        )


class Migration(migrations.Migration):
    dependencies = [
        ('members', '0259_expunge_minted_friend_accounts'),
        # The account table this pass deletes from, wherever the user model lives.
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RunPython(expunge_ghost_accounts, migrations.RunPython.noop),
    ]
