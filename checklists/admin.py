import json
import logging

from django.contrib import admin
from django.conf import settings
from django.db import models, transaction
from django.utils import timezone
from django.utils.html import format_html
from django.urls import path, reverse
from django.shortcuts import get_object_or_404, redirect, render
from django.contrib import messages
from django import forms
from django.forms import Textarea, ModelForm, ValidationError, ChoiceField
from django.contrib.auth.admin import GroupAdmin as BaseGroupAdmin
from django.contrib.auth.models import Group
from urllib.parse import urlencode
from .models import Outlet, Team, ChecklistTemplate, TemplateItem, Schedule, ChecklistInstance, InstanceItem, Signature, FlaggedItem, GroupOutletScope, LibraryTemplate, LibraryTask

logger = logging.getLogger(__name__)


# ─── Outlet scoping helper ────────────────────────────────────────────────────

def get_user_outlets(user):
    """
    Return the Outlets a Django admin user may access.
    - Superusers → all outlets.
    - Users in a group with NO GroupOutletScope rows → all outlets (global admin).
    - Everyone else → union of outlets from their group scopes.
    """
    if user.is_superuser:
        return Outlet.objects.all()
    groups = user.groups.all()
    if not groups.exists():
        return Outlet.objects.none()
    for group in groups:
        if not group.outlet_scopes.exists():
            return Outlet.objects.all()
    outlet_ids = GroupOutletScope.objects.filter(
        group__in=groups
    ).values_list('outlet_id', flat=True)
    return Outlet.objects.filter(id__in=outlet_ids)


class OutletScopedMixin:
    """
    Mixin for ModelAdmin classes that should be scoped to the user's outlet(s).
    Subclasses must define `outlet_filter_path` — the ORM lookup to Outlet from
    the admin's model, e.g. 'outlet', 'team__outlet', or
    'instance_item__instance__team__outlet'.
    For OutletAdmin itself set `outlet_filter_path = None` (filter on pk).
    """
    outlet_filter_path = None  # override in each subclass

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        outlets = get_user_outlets(request.user)
        if outlets.count() == Outlet.objects.count():
            return qs  # global access — no filter needed
        if self.outlet_filter_path is None:
            return qs.filter(pk__in=outlets)
        return qs.filter(**{f'{self.outlet_filter_path}__in': outlets})

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        outlets = get_user_outlets(request.user)
        if outlets.count() < Outlet.objects.count():
            if db_field.name == 'outlet':
                kwargs['queryset'] = outlets
            elif db_field.name == 'team':
                kwargs['queryset'] = Team.objects.filter(outlet__in=outlets)
            elif db_field.name == 'supervisor_team':
                kwargs['queryset'] = Team.objects.filter(outlet__in=outlets)
            elif db_field.name == 'template':
                kwargs['queryset'] = ChecklistTemplate.objects.filter(team__outlet__in=outlets)
        return super().formfield_for_foreignkey(db_field, request, **kwargs)


class ChecklistTemplateForm(ModelForm):
    """Custom form with dropdown for validity window hours."""

    # Create choices: 0 = unlimited, then 1-24 hours
    HOURS_CHOICES = [(0, '0 (Unlimited - no deadline)')] + [(i, f'{i} hour{"s" if i > 1 else ""}') for i in range(1, 25)]

    validity_window_hours = ChoiceField(
        choices=HOURS_CHOICES,
        initial=3,
        help_text="Hours after scheduled time for staff to complete checklist. '0' means unlimited time.",
        label='Staff Validity Window'
    )

    supervisor_validity_window_hours = ChoiceField(
        choices=HOURS_CHOICES,
        initial=2,
        help_text="Hours after staff completion for supervisor to verify. '0' means unlimited time.",
        label='Supervisor Validity Window'
    )

    class Meta:
        model = ChecklistTemplate
        exclude = ['created_by']


@admin.register(Outlet)
class OutletAdmin(OutletScopedMixin, admin.ModelAdmin):
    outlet_filter_path = None  # pk-based filter (Outlet is the root)
    list_display = ['name', 'location', 'created_at']
    search_fields = ['name']


@admin.register(Team)
class TeamAdmin(OutletScopedMixin, admin.ModelAdmin):
    outlet_filter_path = 'outlet'
    list_display = ['name', 'outlet', 'staff_pin', 'supervisor_pin', 'created_at']
    list_filter = ['outlet']
    search_fields = ['name', 'outlet__name']


# ─── Checklist Library ────────────────────────────────────────────────────────

VALID_TASK_TYPES = {'yes_no', 'number', 'text', 'photo'}


class AIChecklistForm(forms.Form):
    checklist_name = forms.CharField(
        max_length=200,
        label='Checklist Name',
    )
    suggested_department = forms.CharField(
        max_length=100,
        required=False,
        label='Suggested Department',
        help_text="Advisory tag, e.g. 'Kitchen', 'Bar', 'Floor'",
    )
    description = forms.CharField(
        widget=forms.Textarea(attrs={'rows': 4, 'placeholder': 'e.g. Daily kitchen opening procedures including equipment checks, temperature logs, and hygiene verification'}),
        min_length=30,
        label='Description',
        help_text='Describe what this checklist is for (minimum 30 characters).',
    )
    language = forms.ChoiceField(
        choices=[('id', 'Bahasa Indonesia'), ('en', 'English')],
        initial='id',
        label='Language',
        help_text='Language for the generated task names.',
    )
    num_tasks = forms.IntegerField(
        min_value=1,
        max_value=30,
        initial=5,
        label='Number of Tasks',
        help_text='How many tasks to generate (1-30).',
    )


class LibraryTaskInline(admin.TabularInline):
    model = LibraryTask
    extra = 1
    fields = ['task_name', 'task_type', 'order']


@admin.register(LibraryTemplate)
class LibraryTemplateAdmin(admin.ModelAdmin):
    list_display = ['name', 'suggested_for', 'task_count', 'created_at']
    list_filter = ['suggested_for']
    search_fields = ['name', 'suggested_for']
    fields = ['name', 'suggested_for']
    inlines = [LibraryTaskInline]
    actions = ['create_checklist_from_selected']
    change_list_template = 'admin/checklists/librarytemplate/change_list.html'

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path(
                'ai-generate/',
                self.admin_site.admin_view(self.ai_generate_view),
                name='librarytemplate-ai-generate',
            ),
        ]
        return custom_urls + urls

    def ai_generate_view(self, request):
        if request.method == 'POST':
            form = AIChecklistForm(request.POST)
            if form.is_valid():
                checklist_name = form.cleaned_data['checklist_name']
                department = form.cleaned_data['suggested_department']
                description = form.cleaned_data['description']
                language = form.cleaned_data['language']
                num_tasks = form.cleaned_data['num_tasks']

                if not settings.ANTHROPIC_API_KEY:
                    messages.error(request, 'ANTHROPIC_API_KEY is not configured. Set it in your environment variables.')
                    return render(request, 'admin/checklists/librarytemplate/ai_generate.html', {
                        'form': form,
                        'opts': self.model._meta,
                        'has_view_permission': True,
                    })

                try:
                    import anthropic
                    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
                    lang_instruction = (
                        'All task names must be written in Bahasa Indonesia.'
                        if language == 'id' else
                        'All task names must be written in English.'
                    )
                    message = client.messages.create(
                        model='claude-sonnet-4-20250514',
                        max_tokens=1024,
                        system=(
                            'You are generating checklist tasks for a restaurant compliance system. '
                            'Every task must have a name (max 48 characters) and a type. '
                            'The type must be strictly one of these four values only: yes_no, photo, number, or text. '
                            'No other values are permitted. '
                            f'{lang_instruction} '
                            'Respond with valid JSON in the format {"tasks": [{"task_name": "...", "task_type": "..."}]} '
                            'with no extra text or explanation.'
                        ),
                        messages=[{
                            'role': 'user',
                            'content': f'Generate {num_tasks} checklist tasks for: {description}',
                        }],
                    )

                    raw_text = message.content[0].text.strip()
                    # Strip markdown code fences if present
                    if raw_text.startswith('```'):
                        raw_text = raw_text.split('\n', 1)[1]  # remove opening ```json
                        raw_text = raw_text.rsplit('```', 1)[0]  # remove closing ```
                    result = json.loads(raw_text)
                    tasks = result.get('tasks', [])

                    if not tasks:
                        messages.error(request, 'AI returned no tasks. Please try again with a more detailed description.')
                        return render(request, 'admin/checklists/librarytemplate/ai_generate.html', {
                            'form': form,
                            'opts': self.model._meta,
                            'has_view_permission': True,
                        })

                    with transaction.atomic():
                        template = LibraryTemplate.objects.create(
                            name=checklist_name,
                            suggested_for=department,
                        )
                        for i, task in enumerate(tasks):
                            task_type = task.get('task_type', 'yes_no')
                            if task_type not in VALID_TASK_TYPES:
                                task_type = 'yes_no'
                            LibraryTask.objects.create(
                                library_template=template,
                                task_name=task.get('task_name', f'Task {i + 1}')[:48],
                                task_type=task_type,
                                order=i,
                            )

                    messages.success(
                        request,
                        f'Created "{checklist_name}" with {len(tasks)} AI-generated tasks.',
                    )
                    return redirect(
                        reverse('admin:checklists_librarytemplate_change', args=[template.pk])
                    )

                except json.JSONDecodeError:
                    logger.exception('Failed to parse AI response as JSON')
                    messages.error(request, 'AI returned invalid JSON. Please try again.')
                except Exception as e:
                    logger.exception('AI checklist generation failed')
                    messages.error(request, f'AI generation failed: {e}')

                return render(request, 'admin/checklists/librarytemplate/ai_generate.html', {
                    'form': form,
                    'opts': self.model._meta,
                    'has_view_permission': True,
                })
        else:
            form = AIChecklistForm()

        return render(request, 'admin/checklists/librarytemplate/ai_generate.html', {
            'form': form,
            'opts': self.model._meta,
            'has_view_permission': True,
        })

    def task_count(self, obj):
        return obj.tasks.count()
    task_count.short_description = 'Tasks'

    @admin.action(description='Create checklist template from selected')
    def create_checklist_from_selected(self, request, queryset):
        if queryset.count() != 1:
            messages.error(request, 'Please select exactly one library template.')
            return
        lib = queryset.first()
        if not lib.tasks.exists():
            messages.error(request, f'Library template "{lib.name}" has no tasks. Add tasks first.')
            return
        task_data = list(lib.tasks.values('task_name', 'task_type', 'order'))
        request.session['_library_template'] = {
            'name': lib.name,
            'tasks': task_data,
        }
        url = reverse('admin:checklists_checklisttemplate_add')
        return redirect(f'{url}?{urlencode({"title": lib.name})}')


class TemplateItemInline(admin.TabularInline):
    model = TemplateItem
    extra = 1
    fields = ['text', 'order', 'is_required', 'response_type']


@admin.register(ChecklistTemplate)
class ChecklistTemplateAdmin(OutletScopedMixin, admin.ModelAdmin):
    outlet_filter_path = 'team__outlet'
    form = ChecklistTemplateForm
    list_display = ['title', 'team', 'schedule', 'requires_supervisor', 'created_by', 'created_at', 'is_hidden', 'generate_button']
    list_filter = ['is_hidden', 'requires_supervisor', 'team', 'schedule', 'created_at']
    search_fields = ['title', 'description']
    inlines = [TemplateItemInline]
    actions = ['duplicate_selected_templates', 'generate_instances_for_selected']
    fieldsets = (
        (None, {
            'fields': ('title', 'description', 'team', 'schedule')
        }),
        ('Settings', {
            'fields': ('requires_supervisor', 'validity_window_hours', 'supervisor_validity_window_hours', 'is_hidden'),
            'description': 'Configure validation, staff/supervisor windows, and visibility settings'
        }),
    )

    class Media:
        js = ('admin/checklists/js/toggle_supervisor_window.js',)

    def generate_button(self, obj):
        from django.urls import reverse
        url = reverse('admin:checklisttemplate-generate-instance', args=[obj.id])
        item_count = obj.items.count()
        if item_count == 0:
            return format_html(
                '<span style="color: #dc3545;" title="Add items first">\u26a0\ufe0f No items</span>'
            )
        return format_html(
            '<a class="button" href="{}" style="background: #28a745; color: white; padding: 4px 8px; border-radius: 4px; text-decoration: none;">\U0001F4CB Generate Instance</a>',
            url
        )
    generate_button.short_description = 'Action'

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path(
                '<uuid:template_id>/generate/',
                self.admin_site.admin_view(self.generate_instance),
                name='checklisttemplate-generate-instance',
            ),
        ]
        return custom_urls + urls

    def save_model(self, request, obj, form, change):
        if not change:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)

    def add_view(self, request, form_url='', extra_context=None):
        if '_library_template' in request.session:
            lib = request.session['_library_template']
            count = len(lib['tasks'])
            messages.info(
                request,
                f'Creating from library: "{lib["name"]}" ({count} task{"s" if count != 1 else ""}). '
                f'Select a team, then save. Tasks will be added automatically.'
            )
        return super().add_view(request, form_url, extra_context)

    def save_related(self, request, form, formsets, change):
        super().save_related(request, form, formsets, change)
        if not change and '_library_template' in request.session:
            lib = request.session.pop('_library_template')
            for task in lib['tasks']:
                TemplateItem.objects.create(
                    template=form.instance,
                    text=task['task_name'],
                    order=task['order'],
                    is_required=True,
                    response_type=task['task_type'],
                )

    @admin.action(description='Duplicate selected templates')
    def duplicate_selected_templates(self, request, queryset):
        duplicated = []
        for original in queryset:
            new_template = ChecklistTemplate.objects.create(
                title=f"{original.title} (Copy)",
                description=original.description,
                team=original.team,
                schedule=original.schedule,
                created_by=request.user,
                is_hidden=original.is_hidden,
                requires_supervisor=original.requires_supervisor,
                validity_window_hours=original.validity_window_hours,
                supervisor_validity_window_hours=original.supervisor_validity_window_hours
            )
            
            for item in original.items.all():
                TemplateItem.objects.create(
                    template=new_template,
                    text=item.text,
                    order=item.order,
                    is_required=item.is_required,
                    response_type=item.response_type
                )
            duplicated.append(new_template.title)
        
        messages.success(request, f'Duplicated {len(duplicated)} template(s): {", ".join(duplicated)}')

    @admin.action(description='Generate instances for selected templates')
    def generate_instances_for_selected(self, request, queryset):
        if queryset.count() > 1:
            messages.error(request, 'Please select only one template to generate an instance.')
            return

        template = queryset.first()
        if not template:
            messages.error(request, 'No template selected.')
            return

        # Check if template has items - required for instance generation
        if not template.items.exists():
            messages.error(request, f'Template "{template.title}" has no items. Please add items first.')
            return

        # If supervisor is required, redirect to the custom form URL
        # Admin actions can't handle multi-step form rendering
        if template.requires_supervisor:
            from django.urls import reverse
            return redirect(reverse('admin:checklisttemplate-generate-instance', args=[template.id]))

        # No supervisor required - create instance directly
        try:
            return self.generate_instance(request, template.id)
        except Exception as e:
            messages.error(request, f'Error generating instance: {str(e)}')
            return

    def generate_instance(self, request, template_id):
        template = get_object_or_404(ChecklistTemplate, id=template_id)

        # If supervisor is required, show form to select supervisor team
        if template.requires_supervisor:
            supervisor_teams = Team.objects.filter(supervisor_pin__gt='', outlet=template.team.outlet)
            if not supervisor_teams.exists():
                messages.error(request, 'No supervisor teams available for this outlet. Please create a supervisor team first.')
                return redirect('admin:checklists_checklisttemplate_change', template.id)

            if request.method == 'POST':
                supervisor_team_id = request.POST.get('supervisor_team')
                if not supervisor_team_id:
                    messages.error(request, 'Supervisor team is required for this checklist.')
                    return render(request, 'admin/checklists/select_supervisor.html', {
                        'template': template,
                        'supervisor_teams': supervisor_teams,
                        'opts': self.model._meta,
                    })
                try:
                    supervisor_team = Team.objects.get(id=supervisor_team_id, supervisor_pin__gt='')
                except Team.DoesNotExist:
                    messages.error(request, 'Invalid supervisor team selected.')
                    return render(request, 'admin/checklists/select_supervisor.html', {
                        'template': template,
                        'supervisor_teams': supervisor_teams,
                        'opts': self.model._meta,
                    })

                date_label = timezone.now().strftime('%Y-%m-%d')
                created_by = 'ADMIN'

                instance = ChecklistInstance.objects.create(
                    template=template,
                    team=template.team,
                    date_label=date_label,
                    created_by=created_by,
                    status='pending',
                    supervisor_team=supervisor_team,
                    validity_window_hours=template.validity_window_hours,
                    supervisor_validity_window_hours=template.supervisor_validity_window_hours,
                    scheduled_time=template.schedule.time_of_day if template.schedule else None,
                )

                for item in template.items.all():
                    InstanceItem.objects.create(
                        instance=instance,
                        template_item_id=item.id,
                        item_text=item.text,
                        response_type=item.response_type,
                        is_checked=False
                    )

                messages.success(request, f'Checklist instance created with supervisor team: {instance.date_label} - {instance.template.title}')
                return redirect('admin:checklists_checklistinstance_change', instance.id)

            return render(request, 'admin/checklists/select_supervisor.html', {
                'template': template,
                'supervisor_teams': supervisor_teams,
                'opts': self.model._meta,
            })

        # No supervisor required - create instance directly
        date_label = timezone.now().strftime('%Y-%m-%d')
        created_by = 'ADMIN'

        instance = ChecklistInstance.objects.create(
            template=template,
            team=template.team,
            date_label=date_label,
            created_by=created_by,
            status='pending',
            validity_window_hours=template.validity_window_hours,
            supervisor_validity_window_hours=template.supervisor_validity_window_hours,
            scheduled_time=template.schedule.time_of_day if template.schedule else None,
        )

        for item in template.items.all():
            InstanceItem.objects.create(
                instance=instance,
                template_item_id=item.id,
                item_text=item.text,
                response_type=item.response_type,
                is_checked=False
            )

        messages.success(request, f'Checklist instance created: {instance.date_label} - {instance.template.title}')
        return redirect('admin:checklists_checklistinstance_change', instance.id)


@admin.register(Schedule)
class ScheduleAdmin(admin.ModelAdmin):

    class Media:
        js = ('admin/checklists/js/schedule_fields.js',)

    list_display = ['name', 'frequency_display', 'schedule_details', 'time_of_day', 'is_active']
    list_filter = ['frequency', 'is_active']
    fieldsets = (
        (None, {
            'fields': ('frequency', 'is_active')
        }),
        ('Schedule Details', {
            'fields': ('time_of_day', 'day_of_week', 'day_of_month'),
            'description': 'Configure based on frequency: Daily needs only time, Weekly/Bi-Weekly needs day of week, Monthly needs date (1-28)'
        }),
    )

    def frequency_display(self, obj):
        return obj.get_frequency_display()
    frequency_display.short_description = 'Frequency'

    def schedule_details(self, obj):
        if obj.frequency == 'daily':
            return '\u2014'
        elif obj.frequency in ('weekly', 'bi_weekly'):
            return obj.get_day_of_week_display() or 'Not set'
        elif obj.frequency == 'monthly':
            if obj.day_of_month:
                suffix = obj._get_ordinal(obj.day_of_month)
                return f"{obj.day_of_month}{suffix} of month"
            return 'Not set'
        return '\u2014'
    schedule_details.short_description = 'Details'


class InstanceItemInline(admin.TabularInline):
    model = InstanceItem
    extra = 0
    readonly_fields = ['template_item_id', 'item_text', 'is_checked', 'checked_at']
    fields = ['template_item_id', 'item_text', 'is_checked', 'checked_at', 'notes']
    formfield_overrides = {
        models.TextField: {'widget': Textarea(attrs={'rows': 2, 'cols': 40})},
    }


class SignatureInline(admin.StackedInline):
    model = Signature
    extra = 0
    readonly_fields = ['image_preview', 'signed_by', 'signed_at', 'created_at']
    fields = ['image_preview', 'signed_by', 'signed_at', 'created_at']

    def image_preview(self, obj):
        if obj.image_data:
            return format_html(
                '<img src="{}" style="max-width: 400px; max-height: 200px; border: 1px solid #ccc;" />',
                obj.image_data
            )
        return "No signature"
    image_preview.short_description = 'Staff Signature'


class ChecklistInstanceForm(ModelForm):
    class Meta:
        model = ChecklistInstance
        fields = '__all__'

    def clean(self):
        cleaned_data = super().clean()
        template = cleaned_data.get('template')
        supervisor_team = cleaned_data.get('supervisor_team')
        status = cleaned_data.get('status')

        # Validate supervisor team is set when template requires it
        if template and template.requires_supervisor and not supervisor_team:
            raise ValidationError(
                'This checklist requires supervisor validation. Please select a supervisor team.'
            )

        # Validate that completed checklists with supervisor requirement have supervisor sign-off
        if template and template.requires_supervisor and status in ('completed', 'verified'):
            if not cleaned_data.get('supervisor_signed_off'):
                raise ValidationError(
                    'This checklist requires supervisor validation. It cannot be marked as completed without supervisor sign-off.'
                )

        return cleaned_data


@admin.register(ChecklistInstance)
class ChecklistInstanceAdmin(OutletScopedMixin, admin.ModelAdmin):
    outlet_filter_path = 'team__outlet'
    form = ChecklistInstanceForm
    list_display = ['date_label', 'template', 'team', 'status', 'completed_by', 'supervisor_team', 'supervisor_signed_off', 'deadline_display', 'created_at', 'synced_at']
    list_filter = ['status', 'team', 'supervisor_signed_off', 'created_at']
    search_fields = ['date_label', 'completed_by', 'supervisor_name']
    inlines = [InstanceItemInline, SignatureInline]
    fieldsets = (
        ('Checklist Info', {
            'fields': ('template', 'team', 'date_label', 'status', 'created_by', 'completed_by')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'synced_at'),
            'classes': ('collapse',)
        }),
        ('Supervisor Verification', {
            'fields': ('supervisor_team', 'supervisor_signed_off', 'supervisor_name', 'supervisor_signature_preview', 'supervisor_signed_at'),
            'description': 'Supervisor cross-check verification (required if template specifies)'
        }),
    )
    readonly_fields = ['created_at', 'synced_at', 'supervisor_signed_at', 'supervisor_signature_preview']

    def supervisor_signature_preview(self, obj):
        if obj.supervisor_signature:
            return format_html(
                '<img src="{}" style="max-width: 400px; max-height: 200px; border: 1px solid #ccc; background: white; padding: 8px;" />',
                obj.supervisor_signature
            )
        return "No supervisor signature"
    supervisor_signature_preview.short_description = 'Supervisor Signature'

    def deadline_display(self, obj):
        deadline = obj.get_deadline()
        if not deadline:
            return '\u2014'
        from django.utils import timezone
        if obj.status in ('completed', 'verified'):
            return f"\u2713 {deadline.strftime('%Y-%m-%d %H:%M')}"
        elif obj.is_expired():
            return format_html(
                '<span style="color: #dc3545; font-weight: bold;">\u26a0 Expired (deadline: {})</span>',
                deadline.strftime('%Y-%m-%d %H:%M')
            )
        else:
            time_left = deadline - timezone.now()
            hours_left = int(time_left.total_seconds() / 3600)
            if hours_left < 1:
                minutes_left = int(time_left.total_seconds() / 60)
                return format_html(
                    '<span style="color: #ffc107;">\u23f0 {}m left</span>',
                    minutes_left
                )
            return format_html(
                '<span style="color: #28a745;">\u23f0 {}h left</span>',
                hours_left
            )
    deadline_display.short_description = 'Deadline'


@admin.register(FlaggedItem)
class FlaggedItemAdmin(OutletScopedMixin, admin.ModelAdmin):
    outlet_filter_path = 'instance_item__instance__team__outlet'
    list_display = ['item_text_short', 'checklist_link', 'team_name', 'description_short', 'photo_thumb', 'flagged_at', 'status_display']
    list_filter = ['flagged_at', 'resolved_at', 'instance_item__instance__team__outlet']
    search_fields = ['description', 'instance_item__item_text', 'instance_item__instance__template__title']
    readonly_fields = ['instance_item', 'flagged_at', 'photo_preview', 'photo_uploaded_at']
    fields = ['instance_item', 'description', 'photo_preview', 'photo_uploaded_at', 'flagged_at', 'resolved_at']
    ordering = ['-flagged_at']
    date_hierarchy = 'flagged_at'

    def item_text_short(self, obj):
        return obj.instance_item.item_text[:50]
    item_text_short.short_description = 'Item'

    def checklist_link(self, obj):
        from django.urls import reverse
        instance = obj.instance_item.instance
        url = reverse('admin:checklists_checklistinstance_change', args=[instance.id])
        title = instance.template.title if instance.template else 'Deleted'
        return format_html('<a href="{}">{} — {}</a>', url, title, instance.date_label)
    checklist_link.short_description = 'Checklist'

    def team_name(self, obj):
        return obj.instance_item.instance.team.name if obj.instance_item.instance.team else '—'
    team_name.short_description = 'Team'

    def description_short(self, obj):
        return obj.description[:60] if obj.description else '—'
    description_short.short_description = 'Description'

    def photo_thumb(self, obj):
        if obj.photo:
            return format_html(
                '<img src="{}" style="max-width: 60px; max-height: 45px; object-fit: cover; border-radius: 3px;" />',
                obj.photo.url
            )
        return '—'
    photo_thumb.short_description = 'Photo'

    def photo_preview(self, obj):
        if obj.photo:
            return format_html(
                '<img src="{}" style="max-width: 400px; max-height: 300px; object-fit: contain; border: 1px solid #ccc;" />',
                obj.photo.url
            )
        return 'No photo'
    photo_preview.short_description = 'Photo Preview'

    def status_display(self, obj):
        if obj.resolved_at:
            return format_html(
                '<span style="color: #28a745;">✓ Resolved {}</span>',
                obj.resolved_at.strftime('%Y-%m-%d %H:%M')
            )
        return format_html('<span style="color: #dc3545; font-weight: bold;">⚑ Active</span>')
    status_display.short_description = 'Status'


# ─── Group admin with outlet scope inline ────────────────────────────────────

class GroupOutletScopeInline(admin.TabularInline):
    model = GroupOutletScope
    extra = 1


admin.site.unregister(Group)


@admin.register(Group)
class GroupAdmin(BaseGroupAdmin):
    inlines = [GroupOutletScopeInline]
    list_display = ['name', 'outlet_count']

    def outlet_count(self, obj):
        count = obj.outlet_scopes.count()
        return 'Global' if count == 0 else str(count)
    outlet_count.short_description = 'Outlets'


@admin.register(GroupOutletScope)
class GroupOutletScopeAdmin(admin.ModelAdmin):
    list_display = ['group', 'outlet']
    list_filter = ['group', 'outlet']
