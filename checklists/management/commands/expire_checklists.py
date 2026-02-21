from datetime import datetime, time, timedelta
from django.core.management.base import BaseCommand
from django.db.models import F, Q, ExpressionWrapper, DateTimeField, Case, When, Value
from django.db.models.functions import Cast, Concat
from django.utils import timezone
from checklists.models import ChecklistInstance


class Command(BaseCommand):
    help = 'Mark overdue checklist instances as expired'

    def handle(self, *args, **options):
        now = timezone.now()

        # Build a queryset that identifies expired instances using SQL-level filtering.
        # An instance is expired when:
        #   now > (base_datetime + validity_window_hours)
        # where base_datetime depends on whether scheduled_time is set.
        #
        # Because date_label is a CharField (not DateField), and combining it with
        # scheduled_time in pure SQL across all DB backends is complex, we use a
        # hybrid approach: batch-fetch candidates with a coarse SQL filter, then
        # do the precise deadline check in Python, and bulk-update in one query.

        candidates = ChecklistInstance.objects.filter(
            status__in=['draft', 'pending'],
        ).exclude(
            # Skip instances with unlimited validity (0 or null without template)
            validity_window_hours=0,
        ).select_related('template__schedule')

        # Collect IDs to expire
        ids_to_expire = []
        for instance in candidates.iterator(chunk_size=500):
            if instance.is_expired():
                ids_to_expire.append(instance.pk)

        if ids_to_expire:
            count = ChecklistInstance.objects.filter(
                pk__in=ids_to_expire
            ).update(status='expired')
        else:
            count = 0

        self.stdout.write(f'Expired {count} checklist(s)')
