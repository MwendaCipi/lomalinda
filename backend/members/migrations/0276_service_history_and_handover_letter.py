"""Give the record its past, and the release letter its handover ask.

Two things the church already has but the app had not written down:

* the people who are serving in a ministry's office *today* — their stretch
  opens here so their profile can say what they serve and from when, dated
  from the day the church seated them; and
* the release letter's new wording — the exiting holder is told who takes
  the seat up and asked to hand the office's things over. The old sentence
  is swapped for {successor_line}, which reads correctly whether or not
  someone follows them, and the handover paragraph is added where a church
  kept the default wording.
"""

from django.db import migrations

OLD_SENTENCE = '{successor} now takes up the role.'
NEW_SENTENCE = '{successor_line}'
HANDOVER = (
    '\n\nAs you step down, please prepare and hand over everything the office '
    'holds — its records, keys, equipment and any other items — so that '
    'whoever takes the seat up next has what they need to run it well.'
)
HANDOVER_MARK = 'hand over everything the office holds'


def forwards(apps, schema_editor):
    DepartmentAssignment = apps.get_model('members', 'DepartmentAssignment')
    DepartmentServiceHistory = apps.get_model('members', 'DepartmentServiceHistory')
    ChurchSettings = apps.get_model('members', 'ChurchSettings')

    for assignment in DepartmentAssignment.objects.select_related('department', 'role', 'member'):
        if not assignment.member_id or not assignment.role_id:
            continue
        DepartmentServiceHistory.objects.get_or_create(
            member_id=assignment.member_id,
            department_code=assignment.department.code,
            department_name=assignment.department.name,
            role_name=assignment.role.name,
            unit=assignment.unit or '',
            ended_at__isnull=True,
            defaults={'kind': assignment.kind, 'started_at': assignment.created_at},
        )

    for settings_row in ChurchSettings.objects.all():
        text = settings_row.default_release_thank_you_message or ''
        if OLD_SENTENCE in text:
            text = text.replace(OLD_SENTENCE, NEW_SENTENCE)
        if text and HANDOVER_MARK not in text:
            # Slip the handover ask in before the church's signature line.
            signature = '{church}'
            if signature in text:
                head, _, _tail = text.rpartition(signature)
                text = f'{head.rstrip()}{HANDOVER}\n\n{signature}'
            else:
                text = f'{text.rstrip()}{HANDOVER}'
        if text != (settings_row.default_release_thank_you_message or ''):
            settings_row.default_release_thank_you_message = text
            settings_row.save(update_fields=['default_release_thank_you_message'])


def backwards(apps, schema_editor):
    DepartmentServiceHistory = apps.get_model('members', 'DepartmentServiceHistory')
    DepartmentServiceHistory.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0275_alter_churchsettings_default_release_thank_you_message_and_more'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
