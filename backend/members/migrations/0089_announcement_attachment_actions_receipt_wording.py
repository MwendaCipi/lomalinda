from django.db import migrations, models


OLD_RECEIPT_MESSAGES = [
    "Thank you, {name}, for contributing {amount} towards {purpose}. May God bless you abundantly!",
    "Thank you, {name}, for contributing {amount} towards {account}. May God bless you abundantly!",
]
NEW_RECEIPT_MESSAGE = "your contribution of {amount} has been received. Thank you, and may God bless you abundantly"


def update_receipt_message(apps, schema_editor):
    ChurchSettings = apps.get_model("members", "ChurchSettings")
    ChurchSettings.objects.filter(default_receipt_message__in=OLD_RECEIPT_MESSAGES).update(
        default_receipt_message=NEW_RECEIPT_MESSAGE
    )


def normalize_announcement_actions(apps, schema_editor):
    Announcement = apps.get_model("members", "Announcement")
    Announcement.objects.filter(action_type="acknowledge").update(action_type="none")
    Announcement.objects.filter(action_type="pledge").update(action_type="combined_offering")


class Migration(migrations.Migration):
    dependencies = [
        ("members", "0088_churchsettings_receipt_delivery_method"),
    ]

    operations = [
        migrations.AddField(
            model_name="announcement",
            name="attachment",
            field=models.FileField(blank=True, null=True, upload_to="announcement-attachments/"),
        ),
        migrations.AlterField(
            model_name="announcement",
            name="action_type",
            field=models.CharField(
                choices=[
                    ("none", "None"),
                    ("tithe", "Tithe"),
                    ("combined_offering", "Combined Offering"),
                    ("13th_sabbath", "13th Sabbath"),
                    ("camp_expenses", "Camp Expenses"),
                    ("camp_goal", "Camp Goal"),
                    ("local_church_budget", "Local Church Budget"),
                    ("respond", "Response"),
                ],
                default="none",
                max_length=40,
            ),
        ),
        migrations.AlterField(
            model_name="announcement",
            name="visibility",
            field=models.CharField(
                choices=[("members", "Members"), ("public", "Public"), ("all", "All")],
                default="public",
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="announcementresponse",
            name="action_type",
            field=models.CharField(
                choices=[
                    ("none", "None"),
                    ("tithe", "Tithe"),
                    ("combined_offering", "Combined Offering"),
                    ("13th_sabbath", "13th Sabbath"),
                    ("camp_expenses", "Camp Expenses"),
                    ("camp_goal", "Camp Goal"),
                    ("local_church_budget", "Local Church Budget"),
                    ("respond", "Response"),
                ],
                max_length=40,
            ),
        ),
        migrations.AlterField(
            model_name="churchsettings",
            name="default_receipt_message",
            field=models.TextField(blank=True, default=NEW_RECEIPT_MESSAGE),
        ),
        migrations.RunPython(update_receipt_message, migrations.RunPython.noop),
        migrations.RunPython(normalize_announcement_actions, migrations.RunPython.noop),
    ]
