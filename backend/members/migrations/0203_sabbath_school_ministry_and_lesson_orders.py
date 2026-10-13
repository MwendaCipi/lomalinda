from django.db import migrations, models


def ensure_sabbath_school_ministry(apps, schema_editor):
    Department = apps.get_model("members", "Department")
    DepartmentRole = apps.get_model("members", "DepartmentRole")

    school, _created = Department.objects.get_or_create(
        code="sabbath_school",
        defaults={
            "name": "Sabbath School",
            "group": "ministry",
            "sort_order": 21,
            "description": (
                "The church's Sabbath School: the classes, the teachers and "
                "the lesson study that opens the Sabbath."
            ),
        },
    )
    if school.group != "ministry":
        school.group = "ministry"
        school.save(update_fields=["group"])

    # Ensure default roles exist for Sabbath School (Leader/Superintendent, Secretary, Treasurer)
    for index, (role_name, assistant) in enumerate((("Leader", True), ("Secretary", False), ("Treasurer", False))):
        DepartmentRole.objects.get_or_create(
            department=school,
            name=role_name,
            defaults={"has_assistant": assistant, "sort_order": index},
        )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("members", "0202_memberprofile_photo_alter_contribution_relationship_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="lessonrequest",
            name="quantity",
            field=models.PositiveIntegerField(default=1, help_text="Number of copies ordered."),
        ),
        migrations.AlterField(
            model_name="lessonrequest",
            name="status",
            field=models.CharField(
                choices=[("pending", "Pending"), ("delivered", "Delivered"), ("served", "Delivered")],
                default="pending",
                max_length=20,
            ),
        ),
        migrations.RunPython(ensure_sabbath_school_ministry, noop_reverse),
    ]
