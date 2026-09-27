# The enrollment verification code, added after the fact.
#
# The first cut added the column NOT NULL with a '' default and a unique
# index in one step, which worked in development but failed on production
# data: every pre-existing enrollment row was backfilled '' and the unique
# index refused the duplicates. The column is now nullable — Postgres treats
# NULLs as distinct in a unique index — and the index only arrives after
# existing rows have been set to NULL. from_code() matches on a hash, never
# on NULL, so legacy rows simply hold no code until the office issues them
# a fresh one.

from django.db import migrations, models


def null_legacy_empty_codes(apps, schema_editor):
    EnrollmentRequest = apps.get_model('members', 'EnrollmentRequest')
    EnrollmentRequest.objects.filter(code='').update(code=None)


def restore_empty_codes(apps, schema_editor):
    EnrollmentRequest = apps.get_model('members', 'EnrollmentRequest')
    EnrollmentRequest.objects.filter(code__isnull=True).update(code='')


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0129_announcement_announcement_type_and_more'),
    ]

    operations = [
        # The column first — nullable from the start (the '' backfill is
        # placeholder data, and the null-out below must be legal), WITHOUT
        # the unique index.
        migrations.AddField(
            model_name='enrollmentrequest',
            name='code',
            field=models.CharField(blank=True, default='', editable=False, help_text='SHA-256 hash of the short verification code emailed to the person', max_length=64, null=True),
        ),
        # Rows that predate codes have none — their '' is "no code", so store
        # it as NULL before the unique index lands.
        migrations.RunPython(null_legacy_empty_codes, restore_empty_codes),
        # The final shape, matching the model: unique and nullable, so new
        # codes never collide and history holds no fake ones.
        migrations.AlterField(
            model_name='enrollmentrequest',
            name='code',
            field=models.CharField(blank=True, editable=False, help_text='SHA-256 hash of the short verification code emailed to the person', max_length=64, null=True, unique=True),
        ),
    ]
