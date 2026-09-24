"""The church's real role list: officer roles, assistants, and no Finance Team.

Two things change for the people already in the database.

The elder holds stay where they are: ``elder`` keeps its code and every existing
holder is simply an Elder (the three numbered elder roles are separate, and the
church designates one when it wants to). ``men_ministry`` and ``women_ministry``
keep their codes too — they are what every permission check in the app names —
so the ministry leaders keep their access and only the label they are shown
changes.

The ``finance`` role goes. Nobody holds it here, but another installation might,
and the role is gone from the list: the treasurer carries the finance desk, so
anyone who was both keeps the treasurer role, and anyone who held finance alone
keeps their membership only. Its Django group is renamed to ``Treasury`` —
preserving the permissions the treasurer's group grants, with the retired name
gone from the church's vocabulary.
"""

from django.db import migrations, models

RETIRED_ROLE = 'finance'
RETAINED_ROLE = 'treasurer'
OLD_FINANCE_GROUP = 'Finance Team'
NEW_FINANCE_GROUP = 'Treasury'


def retire_finance_role(apps, schema_editor):
    MemberProfile = apps.get_model('members', 'MemberProfile')
    Group = apps.get_model('auth', 'Group')

    for profile in MemberProfile.objects.all():
        codes = [c.strip() for c in (profile.roles or '').split(',') if c.strip()]
        if RETIRED_ROLE not in codes:
            continue
        remaining = [code for code in codes if code != RETIRED_ROLE]
        if RETAINED_ROLE in remaining:
            replacement = remaining
        else:
            remaining.append(RETAINED_ROLE)
            replacement = remaining
        profile.roles = ', '.join(replacement)
        profile.role = replacement[0]
        profile.save(update_fields=['roles', 'role'])

    # Rename the permission bundle the treasurer's role grants.
    old = Group.objects.filter(name=OLD_FINANCE_GROUP).first()
    if old and not Group.objects.filter(name=NEW_FINANCE_GROUP).exists():
        old.name = NEW_FINANCE_GROUP
        old.save(update_fields=['name'])


def restore_finance_role(apps, schema_editor):
    Group = apps.get_model('auth', 'Group')
    group = Group.objects.filter(name=NEW_FINANCE_GROUP).first()
    if group and not Group.objects.filter(name=OLD_FINANCE_GROUP).exists():
        group.name = OLD_FINANCE_GROUP
        group.save(update_fields=['name'])


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0105_delete_givingpurpose'),
    ]

    operations = [
        migrations.AddField(
            model_name='memberprofile',
            name='assistant_roles',
            field=models.CharField(
                blank=True,
                default='',
                help_text="Comma-separated role codes held as an assistant to the role's leader",
                max_length=250,
            ),
        ),
        migrations.AlterField(
            model_name='memberprofile',
            name='role',
            field=models.CharField(
                choices=[
                    ('member', 'Member'),
                    ('clerk', 'Church Clerk'),
                    ('elder', 'Elder'),
                    ('first_elder', 'First Elder'),
                    ('second_elder', 'Second Elder'),
                    ('third_elder', 'Third Elder'),
                    ('head_deacon', 'Head Deacon'),
                    ('head_deaconess', 'Head Deaconess'),
                    ('treasurer', 'Treasurer'),
                    ('pm_leader', 'PM Leader'),
                    ('men_ministry', 'APM Leader'),
                    ('women_ministry', 'AWM Leader'),
                    ('youth_leader', 'Youth Leader'),
                    ('chaplaincy', 'Chaplaincy Leader'),
                    ('children_ministry', 'Children Leader'),
                    ('health_leader', 'Health Leader'),
                    ('ambassadors_leader', 'Ambassadors Leader'),
                    ('education_leader', 'Education Leader'),
                    ('family_life', 'Family Life'),
                    ('pathfinders_leader', 'Pathfinders Leader'),
                    ('adventurers_leader', 'Adventurers Leader'),
                    ('publishing_head', 'Publishing Head'),
                    ('welfare_leader', 'Welfare Leader'),
                    ('interest_coordinator', 'Interest Coordinator'),
                    ('development', 'Development'),
                    ('choir_director', 'Choir Director'),
                    ('admin', 'Administrator'),
                ],
                default='member',
                help_text="Primary/legacy role kept in sync with 'roles'",
                max_length=30,
            ),
        ),
        migrations.RunPython(retire_finance_role, restore_finance_role),
    ]
