from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('checklists', '0015_flaggeditem_table'),
    ]

    operations = [
        migrations.AddField(
            model_name='flaggeditem',
            name='acknowledged_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='flaggeditem',
            name='acknowledged_by',
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name='flaggeditem',
            name='acknowledgement_signature',
            field=models.TextField(blank=True),
        ),
    ]
