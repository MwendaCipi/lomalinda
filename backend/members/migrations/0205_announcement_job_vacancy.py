from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("members", "0204_children_department_classes_units"),
    ]

    operations = [
        migrations.AlterField(
            model_name="announcement",
            name="announcement_type",
            field=models.CharField(
                choices=[
                    ("awareness", "Awareness"),
                    ("web_conference", "Web conference"),
                    ("promotion", "Promotion / Contribution"),
                    ("opinion", "Opinion poll"),
                    ("job_vacancy", "Job vacancy"),
                ],
                default="awareness",
                help_text="Awareness is a plain notice; web conference carries a link; promotion invites support for an account; opinion poll asks for responses; job vacancy announces career openings",
                max_length=30,
            ),
        ),
    ]
