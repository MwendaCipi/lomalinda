from django.db import migrations


def remove_amr_giving_purpose(apps, schema_editor):
    GivingPurpose = apps.get_model('members', 'GivingPurpose')
    GivingPurpose.objects.filter(name__icontains='Adventist Muslim').update(active=False)


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0053_businessmeeting_alter_announcement_is_popup_and_more'),
    ]

    operations = [
        migrations.RunPython(remove_amr_giving_purpose, migrations.RunPython.noop),
    ]
