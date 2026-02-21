from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta, datetime, time

from checklists.models import ChecklistTemplate, ChecklistInstance, InstanceItem, Team


class Command(BaseCommand):
    help = 'Generate pending checklist instances for templates scheduled in the next hour'

    def handle(self, *args, **options):
        now = timezone.now()

        # Look ahead window: scheduled times between now+60min and now+75min.
        # Cron runs every 15 minutes, so the 15-min window ensures each
        # scheduled time is caught by exactly one cron run.
        window_start = now + timedelta(minutes=60)
        window_end = now + timedelta(minutes=75)

        templates = ChecklistTemplate.objects.filter(
            is_hidden=False,
            schedule__isnull=False,
            schedule__is_active=True
        ).select_related('schedule', 'team__outlet').prefetch_related('items')

        created = 0
        skipped = 0

        for template in templates:
            schedule = template.schedule
            scheduled_time = schedule.time_of_day or time(8, 0)

            # Check today and tomorrow — window may span midnight
            for delta_days in [0, 1]:
                check_date = now.date() + timedelta(days=delta_days)

                if schedule.frequency == 'daily':
                    pass  # fires every day

                elif schedule.frequency in ('weekly', 'bi_weekly'):
                    if check_date.weekday() != schedule.day_of_week:
                        continue

                elif schedule.frequency == 'monthly':
                    if schedule.day_of_month and check_date.day != schedule.day_of_month:
                        continue

                else:
                    continue

                # Build timezone-aware scheduled datetime
                scheduled_dt = datetime.combine(check_date, scheduled_time)
                scheduled_dt = timezone.make_aware(scheduled_dt, timezone.get_current_timezone())

                if not (window_start <= scheduled_dt <= window_end):
                    continue

                date_label = check_date.strftime('%Y-%m-%d')

                # Skip if an instance already exists for this template + team + date
                if ChecklistInstance.objects.filter(
                    template=template,
                    team=template.team,
                    date_label=date_label
                ).exists():
                    skipped += 1
                    self.stdout.write(
                        f'Skipped "{template.title}" on {date_label} — already exists'
                    )
                    continue

                # Resolve supervisor team if required
                supervisor_team = None
                if template.requires_supervisor:
                    supervisor_team = Team.objects.filter(
                        team_type='supervisor',
                        outlet=template.team.outlet
                    ).first()
                    if not supervisor_team:
                        self.stdout.write(
                            self.style.WARNING(
                                f'Skipped "{template.title}" — requires supervisor but no supervisor team found for outlet "{template.team.outlet}"'
                            )
                        )
                        continue

                # Create the instance
                instance = ChecklistInstance.objects.create(
                    template=template,
                    team=template.team,
                    date_label=date_label,
                    created_by='SYSTEM',
                    status='pending',
                    supervisor_team=supervisor_team,
                    validity_window_hours=template.validity_window_hours,
                    supervisor_validity_window_hours=template.supervisor_validity_window_hours,
                    scheduled_time=scheduled_time,
                )

                for item in template.items.all():
                    InstanceItem.objects.create(
                        instance=instance,
                        template_item_id=item.id,
                        item_text=item.text,
                        response_type=item.response_type,
                        is_checked=False
                    )

                created += 1
                self.stdout.write(
                    f'Created: "{template.title}" for {date_label} (team: {template.team.name})'
                )

        self.stdout.write(self.style.SUCCESS(f'Done: {created} created, {skipped} skipped'))
