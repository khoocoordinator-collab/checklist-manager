from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta

from checklists.models import ChecklistInstance


class Command(BaseCommand):
    help = 'Delete checklist instances older than 90 days'

    def handle(self, *args, **options):
        cutoff = timezone.now() - timedelta(days=90)
        qs = ChecklistInstance.objects.filter(created_at__lt=cutoff)
        count = qs.count()
        qs.delete()
        self.stdout.write(self.style.SUCCESS(f'Deleted {count} instance(s) older than 90 days'))
