"""Poll the mailbox into the Emails desk — every church, on a schedule.

Meant to be run from cron (see ``backend/deploy/sync-mailbox.cron.example``):
the desk reads by polling, because Zoho keeps the domain's MX records and no
inbound provider can take this address, so the mailbox itself has to be read.

Multi-tenancy is handled here rather than in the poller: each church owns one
schema and one mailbox, so the command visits every tenant in turn and runs the
poll inside its own schema. The test suite runs without ``django_tenants``, in
which case there is exactly one scope and the command simply runs once.

Failures are reported per church and the command exits non-zero if any of them
failed, so a cron log records a broken mailbox rather than a silent success.
"""

from django.core.management.base import BaseCommand, CommandError

from config.tenancy import tenant_scope, tenants_enabled

from maildesk import imap_sync


class Command(BaseCommand):
    help = 'Poll the church mailbox over IMAP and store new letters in the Emails desk.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--notify',
            action='store_true',
            help='Mail the administrators when the mailbox cannot be reached.',
        )
        parser.add_argument(
            '--tenant',
            default='',
            help='Schema name of one church to sync (default: every church).',
        )

    def handle(self, *args, **options):
        notify = options['notify']
        failures = []

        for tenant, summary in self._runs(options['tenant'], notify):
            label = tenant.schema_name if tenant is not None else 'default'
            if summary['ok']:
                self.stdout.write(self.style.SUCCESS(
                    f"{label}: {summary['stored']} stored, "
                    f"{summary['duplicates']} already present, "
                    f"{summary['fetched']} fetched, {summary['failed']} skipped "
                    f"(cursor at {summary['last_uid']})"
                ))
            else:
                failures.append(f"{label}: {summary['reason']}")
                self.stderr.write(self.style.ERROR(f"{label}: {summary['reason']}"))

        if failures:
            raise CommandError(
                'The mailbox could not be polled: ' + '; '.join(failures)
            )

    def _runs(self, schema, notify):
        """Yield ``(tenant, summary)`` for every church this command covers."""
        if not tenants_enabled():
            yield None, imap_sync.sync(notify=notify)
            return

        from django_tenants.utils import get_tenant_model

        tenants = get_tenant_model().objects.all().order_by('schema_name')
        if schema:
            tenants = tenants.filter(schema_name=schema)
        if not tenants:
            raise CommandError(f'No church found for schema {schema!r}.' if schema else 'No churches found.')

        for tenant in tenants:
            with tenant_scope(tenant):
                yield tenant, imap_sync.sync(notify=notify)
