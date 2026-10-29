from django.db import migrations


def remove_children_unit_pages(apps, schema_editor):
    """Keep child classes as record labels, not Children Ministry sub-pages."""
    Department = apps.get_model("members", "Department")
    Department.objects.filter(code="children").update(units="")


class Migration(migrations.Migration):

    dependencies = [
        ("members", "0244_alter_churchsettings_church_name"),
    ]

    operations = [
        migrations.RunPython(remove_children_unit_pages, migrations.RunPython.noop),
    ]
