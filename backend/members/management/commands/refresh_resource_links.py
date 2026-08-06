from django.core.management.base import BaseCommand
from django.utils import timezone

from members.models import ExternalResourceLink
from members.views import current_adult_lesson_url, current_adult_pdf_url, first_children_lesson_url, first_mission_story_url


class Command(BaseCommand):
    help = 'Resolve and store the current Sabbath School lessons and mission story links.'

    def handle(self, *args, **options):
        jobs = {
            'adult_lesson': current_adult_lesson_url,
            'adult_pdf_lesson': lambda: current_adult_pdf_url('lesson'),
            'adult_pdf_teachers': lambda: current_adult_pdf_url('teachers'),
            'mission_adults': lambda: first_mission_story_url('adults'),
            'mission_children': lambda: first_mission_story_url('children'),
        }
        for division in ('beginner', 'kindergarten', 'primary', 'junior'):
            for audience in ('students', 'teachers'):
                jobs[f'children_{division}_{audience}'] = lambda division=division, audience=audience: first_children_lesson_url(division, audience)

        success = 0
        for key, resolver in jobs.items():
            try:
                url = resolver()
                ExternalResourceLink.objects.update_or_create(key=key, defaults={'url': url, 'resolved_at': timezone.now()})
                self.stdout.write(self.style.SUCCESS(f'{key}: {url}'))
                success += 1
            except Exception as error:
                self.stderr.write(self.style.ERROR(f'{key}: {error}'))
        self.stdout.write(f'Resolved {success} of {len(jobs)} resource links.')
