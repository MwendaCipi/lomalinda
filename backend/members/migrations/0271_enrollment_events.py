from django.conf import settings
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('members', '0270_church_public_opening_hours'),
    ]

    operations = [
        migrations.AddField(
            model_name='announcement',
            name='enroll_department',
            field=models.CharField(blank=True, default='', help_text='Department whose calendar holds the event this post enrols people into', max_length=100),
        ),
        migrations.AddField(
            model_name='announcement',
            name='enroll_fee',
            field=models.DecimalField(blank=True, decimal_places=2, help_text='What a member pays to be enrolled; blank when the post asks for no fee', max_digits=10, null=True),
        ),
        migrations.AddField(
            model_name='announcement',
            name='enroll_deadline',
            field=models.DateField(blank=True, help_text='The last day a member may register', null=True),
        ),
        migrations.AddField(
            model_name='departmentevent',
            name='fee_amount',
            field=models.DecimalField(decimal_places=2, default=0, help_text='What a member pays to be enrolled; zero for an event with no fee', max_digits=10),
        ),
        migrations.AddField(
            model_name='departmentevent',
            name='registration_deadline',
            field=models.DateField(blank=True, help_text='The last day a member may register for this event', null=True),
        ),
        migrations.AddField(
            model_name='departmentevent',
            name='announcement',
            field=models.OneToOneField(blank=True, help_text='The announcement whose Enroll now / Register now button created this event', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='enrollment_event', to='members.announcement'),
        ),
        migrations.CreateModel(
            name='EventEnrollment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(blank=True, help_text='The person enrolled; blank when their account names them', max_length=160)),
                ('phone_number', models.CharField(blank=True, max_length=20)),
                ('amount', models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('paid', 'Paid'), ('waived', 'Enrolled by the desk')], default='pending', max_length=10)),
                ('source', models.CharField(choices=[('payment', 'Payment'), ('manual', 'Manual')], default='payment', max_length=10)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('contribution', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='event_enrollments', to='members.contribution')),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='event_enrollments_made', to=settings.AUTH_USER_MODEL)),
                ('event', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='enrollments', to='members.departmentevent')),
                ('member', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='event_enrollments', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ('created_at',),
            },
        ),
        migrations.AddConstraint(
            model_name='eventenrollment',
            constraint=models.UniqueConstraint(condition=models.Q(('member__isnull', False)), fields=('event', 'member'), name='one_enrollment_per_member_event'),
        ),
    ]
