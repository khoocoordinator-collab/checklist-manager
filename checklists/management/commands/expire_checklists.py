from django.core.management.base import BaseCommand
from checklists.models import ChecklistInstance


class Command(BaseCommand):
    help = 'Mark overdue checklist instances as expired'

    def handle(self, *args, **options):
        candidates = ChecklistInstance.objects.filter(
            status__in=['draft', 'pending']
        ).select_related('template__schedule')

        count = 0
        for instance in candidates:
            if instance.check_and_update_expired():
                count += 1

        self.stdout.write(f'Expired {count} checklist(s)')
