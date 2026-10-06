from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


DEFAULT_CHILDREN_GROUPS = (
    ('beginners', 'Beginners', 0, 3, 1, "Cradle Roll / Beginners (0–3 yrs)"),
    ('kindergarten', 'Kindergarten', 4, 6, 2, "Kindergarten (4–6 yrs)"),
    ('primary', 'Primary', 7, 9, 3, "Primary (7–9 yrs)"),
    ('junior', 'Junior', 10, 12, 4, "Junior (10–12 yrs)"),
    ('teens', 'Teens', 13, 15, 5, "Teens (13–15 yrs)"),
    ('pathfinders', 'Pathfinders', 10, 15, 6, "Pathfinder Club (10–15 yrs)"),
)

def seed_children_groups(apps, schema_editor):
    ChildrenGroup = apps.get_model('members', 'ChildrenGroup')

    for code, name, min_age, max_age, sort, desc in DEFAULT_CHILDREN_GROUPS:
        ChildrenGroup.objects.get_or_create(
            code=code,
            defaults={
                'name': name,
                'min_age': min_age,
                'max_age': max_age,
                'sort_order': sort,
                'description': desc,
                'is_active': True,
            },
        )

    # This migration once also wrote the band list into Children's ``units``.
    # That was wrong: 0167 had already made the bands (Beginners,
    # Kindergarten, Primary, Junior, Teens) departments of their own and taken
    # them off Children's units, leaving only the Pathfinders — the one band
    # with no desk of its own. Re-listing them made every band show twice, as
    # a department and as a sub-unit. It is not re-added here, and 0177 takes
    # the duplicated bands back off the desks that already got them.


def unseed_children_groups(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0167_member_profile_areas'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='ChildrenGroup',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=80, unique=True)),
                ('code', models.SlugField(max_length=60, unique=True)),
                ('min_age', models.PositiveSmallIntegerField(default=0)),
                ('max_age', models.PositiveSmallIntegerField(default=18)),
                ('description', models.CharField(blank=True, max_length=240)),
                ('sort_order', models.PositiveIntegerField(default=0)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
            ],
            options={
                'ordering': ('sort_order', 'min_age', 'id'),
            },
        ),
        migrations.CreateModel(
            name='ChildRecord',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('first_name', models.CharField(max_length=80)),
                ('last_name', models.CharField(blank=True, max_length=80)),
                ('gender', models.CharField(blank=True, choices=[('male', 'Male'), ('female', 'Female'), ('other', 'Other')], max_length=10)),
                ('date_of_birth', models.DateField(blank=True, null=True)),
                ('age', models.PositiveSmallIntegerField(blank=True, help_text='Age in years if exact birth date is unknown', null=True)),
                ('unit', models.CharField(blank=True, help_text='Sub-unit or category name e.g. Beginners, Kindergarten, Primary, Teens, Pathfinders', max_length=60)),
                ('guardian_name', models.CharField(blank=True, max_length=120)),
                ('guardian_phone', models.CharField(blank=True, max_length=30)),
                ('guardian_email', models.EmailField(blank=True, max_length=254)),
                ('notes', models.TextField(blank=True, help_text='Special needs, dietary, or medical notes')),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('group', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='children', to='members.childrengroup')),
                ('parent', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='children_records', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ('first_name', 'last_name', 'id'),
            },
        ),
        migrations.CreateModel(
            name='Pathfinder',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('first_name', models.CharField(max_length=80)),
                ('last_name', models.CharField(blank=True, max_length=80)),
                ('pathfinder_class', models.CharField(choices=[('friend', 'Friend (10 yrs / Grade 5)'), ('companion', 'Companion (11 yrs / Grade 6)'), ('explorer', 'Explorer (12 yrs / Grade 7)'), ('ranger', 'Ranger (13 yrs / Grade 8)'), ('voyager', 'Voyager (14 yrs / Grade 9)'), ('guide', 'Guide (15 yrs / Grade 10)'), ('master_guide', 'Master Guide (16+ yrs)')], default='friend', max_length=20)),
                ('rank', models.CharField(blank=True, help_text='Club rank or office e.g. Captain, Scribe', max_length=60)),
                ('guardian_name', models.CharField(blank=True, max_length=120)),
                ('guardian_phone', models.CharField(blank=True, max_length=30)),
                ('enrolled_at', models.DateField(default=django.utils.timezone.now)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('child', models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='pathfinder_profile', to='members.childrecord')),
                ('member', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='pathfinder_memberships', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ('first_name', 'last_name', 'id'),
            },
        ),
        migrations.RunPython(seed_children_groups, unseed_children_groups),
    ]
