from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0232_departmentmessage_direct_phone'),
    ]

    operations = [
        migrations.AddField(
            model_name='deaconaterequest',
            name='item',
            field=models.ForeignKey(blank=True, help_text='The register row the ask acts on', null=True, on_delete=models.deletion.SET_NULL, related_name='property_requests', to='members.inventoryitem'),
        ),
        migrations.AddField(
            model_name='deaconaterequest',
            name='quantity',
            field=models.PositiveIntegerField(blank=True, help_text='The items the ask moves: used, added, or counted off', null=True),
        ),
        migrations.AddField(
            model_name='deaconaterequest',
            name='purpose',
            field=models.CharField(blank=True, default='', help_text='Why the desk asks; what the items are for', max_length=255),
        ),
        migrations.AddField(
            model_name='deaconaterequest',
            name='details',
            field=models.JSONField(blank=True, default=dict, help_text="Movement or use shape the elders' answer should apply"),
        ),
        migrations.AddField(
            model_name='inventoryitem',
            name='review_status',
            field=models.CharField(choices=[('pending', 'Pending review'), ('approved', 'Approved'), ('rejected', 'Rejected')], default='approved', help_text="Elders' reading of a new row: pending until the requests desk answers it", max_length=12),
        ),
    ]
