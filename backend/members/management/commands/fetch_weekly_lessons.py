from django.core.management.base import BaseCommand
from members.views import fetch_and_cache_sabbath_school_lesson


class Command(BaseCommand):
    help = 'Pre-fetch and cache Sabbath School weekly lessons for in-app reading.'

    def add_arguments(self, parser):
        parser.add_argument('--quarter', type=str, default='', help='Quarterly ID, e.g. 2026-04')
        parser.add_argument('--lesson', type=str, default='', help='Lesson ID, e.g. 08')

    def handle(self, *args, **options):
        quarter = options.get('quarter') or None
        lesson = options.get('lesson') or None
        self.stdout.write(f'Fetching Sabbath School lesson (quarter={quarter}, lesson={lesson})...')
        try:
            data = fetch_and_cache_sabbath_school_lesson(quarter_id=quarter, lesson_id=lesson)
            quarterly = data.get('quarterly', {})
            lesson_info = data.get('lesson', {})
            days = data.get('days', [])
            self.stdout.write(
                self.style.SUCCESS(
                    f"Successfully cached {quarterly.get('title')} - {lesson_info.get('title')} ({len(days)} days)"
                )
            )
        except Exception as err:
            self.stderr.write(self.style.ERROR(f'Failed to fetch lesson: {err}'))
