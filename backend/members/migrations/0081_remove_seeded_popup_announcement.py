# Generated manually on 2026-09-21

from django.db import migrations
from django.utils import timezone

# What migration 0042 seeded. Kept here so the removal can be undone, and so the
# words are still recoverable if the church ever wants the vesper notice back.
SEEDED = {
    "text": (
        "Join us this evening at 5:30 PM for our Sabbath Welcome Vesper Service as we open the "
        "holy Sabbath hours together in song, prayer, and fellowship."
    ),
    "detail": (
        "Location: Main Sanctuary & Online Live Stream. Speaker: Church Elder. All members and "
        "visitors are warmly welcome to begin the Sabbath together."
    ),
    "href": "/calendar",
    "visibility": "public",
    "action_type": "acknowledge",
    "sharing_option": "site",
    "is_popup": True,
    "action_prompt": "Please confirm that you have read the Vesper service announcement.",
    "published": True,
}
SEEDED_TITLE = "Sabbath Welcome Vesper Service"


def remove_popup_announcements(apps, schema_editor):
    """No announcement interrupts a visitor: the church's site opens cleanly.

    Migration 0042 seeded a vesper notice flagged as a pop-up, so every visitor
    to the website met a modal demanding acknowledgement before they could read
    anything. That was demo content, not a church decision, and the office can
    still publish a pop-up announcement whenever they actually want one.
    """
    Announcement = apps.get_model('members', 'Announcement')
    Announcement.objects.filter(is_popup=True).delete()


def restore_the_seeded_popup(apps, schema_editor):
    Announcement = apps.get_model('members', 'Announcement')
    Announcement.objects.get_or_create(
        title=SEEDED_TITLE,
        defaults={**SEEDED, 'expires_at': timezone.now().date()},
    )


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0080_church_named_sda_loma_linda'),
    ]

    operations = [
        migrations.RunPython(remove_popup_announcements, restore_the_seeded_popup),
    ]
