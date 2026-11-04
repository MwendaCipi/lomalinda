"""Expunge the accounts the receipt desk minted for givers who never signed up.

``ensure_giver_profile`` stood an active ``friend.<phone>`` account up for every
name the treasury receipted, whether or not that person had ever asked for one.
Nobody ever signed in to them — unusable password, no sign-in, no gifts — yet
they were counted in the directory, reached by "all users" announcements, and
could keep the person out later, because every join path refuses an email that
already holds an account.

Only the untouched ones go. An account is expunged when all of this holds:

* its username starts ``friend.`` — the desk's own naming, not a person's;
* its password is unusable and it has never signed in (a giver who reset the
  password or logged in claimed it, and is a real friend now);
* its profile is a friend's and its address was never confirmed;
* no contribution points at it (that link is PROTECT, and a gift tied to the
  account means somebody is actually giving through it).

Anything else stays, including every member, officer and genuine friend. The
ledger does not move: cash receipts keep the name, phone and address they were
written with, and digital gifts keep their donor name. The reverse of this
migration cannot bring the accounts back — the people they described were
never on the roll, and what the desk knew about them lives on the receipts.
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
    """The minted, never-claimed friend accounts."""
    return (
        User.objects
        .filter(username__startswith=GHOST_USERNAME_PREFIX)
        .filter(password__startswith=UNUSABLE_PASSWORD_PREFIX)
        .filter(is_staff=False, is_superuser=False)
        .filter(last_login__isnull=True)
        .filter(
            member_profile__account_type='friend',
            member_profile__email_verified_at__isnull=True,
        )
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
            f'Expunged {expunged} minted friend account(s); '
            f'left {kept} that were still referenced.'
        )


class Migration(migrations.Migration):
    dependencies = [
        ('members', '0258_announcement_options_and_schedule'),
        # The account table this pass deletes from, wherever the user model lives.
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RunPython(expunge_ghost_accounts, migrations.RunPython.noop),
    ]
