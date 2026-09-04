from django.db import migrations
from django.utils import timezone

def seed_vesper_announcement(apps, schema_editor):
    Announcement = apps.get_model('members', 'Announcement')
    today = timezone.now().date()
    Announcement.objects.get_or_create(
        title="Sabbath Welcome Vesper Service",
        defaults={
            "text": "Join us this evening at 5:30 PM for our Sabbath Welcome Vesper Service as we open the holy Sabbath hours together in song, prayer, and fellowship.",
            "detail": "Location: Main Sanctuary & Online Live Stream. Speaker: Church Elder. All members and visitors are warmly welcome to begin the Sabbath together.",
            "href": "/calendar",
            "visibility": "public",
            "action_type": "acknowledge",
            "is_popup": True,
            "action_prompt": "Please confirm that you have read the Vesper service announcement.",
            "published": True,
            "expires_at": today,
        }
    )

def remove_vesper_announcement(apps, schema_editor):
    Announcement = apps.get_model('members', 'Announcement')
    Announcement.objects.filter(title="Sabbath Welcome Vesper Service").delete()

class Migration(migrations.Migration):

    dependencies = [
        ('members', '0041_announcement_action_prompt_announcement_action_type_and_more'),
    ]

    operations = [
        migrations.RunPython(seed_vesper_announcement, remove_vesper_announcement),
    ]
