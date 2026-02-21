import uuid
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('checklists', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='LibraryTemplate',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=200)),
                ('suggested_for', models.CharField(blank=True, help_text="Advisory tag, e.g. 'Kitchen', 'Bar', 'Floor'", max_length=100)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'ordering': ['name'],
            },
        ),
        migrations.CreateModel(
            name='LibraryTask',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('task_name', models.CharField(max_length=48)),
                ('task_type', models.CharField(choices=[('yes_no', 'Yes / No'), ('number', 'Number'), ('text', 'Text'), ('photo', 'Photo')], default='yes_no', max_length=10)),
                ('order', models.IntegerField(default=0)),
                ('library_template', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='tasks', to='checklists.librarytemplate')),
            ],
            options={
                'ordering': ['order'],
            },
        ),
        migrations.CreateModel(
            name='GroupOutletScope',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('group', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='outlet_scopes', to='auth.group')),
                ('outlet', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='group_scopes', to='checklists.outlet')),
            ],
            options={
                'unique_together': {('group', 'outlet')},
            },
        ),
    ]
