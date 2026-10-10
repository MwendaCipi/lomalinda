from datetime import timedelta

import requests
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from members.models import Contribution
from members.mpesa import MpesaConfigurationError, normalize_pull_rows, pull_paybill_transactions
from members.views import record_direct_paybill_payment


class Command(BaseCommand):
    help = (
        "Pull the paybill's transactions from Safaricom for a date range and "
        "record any the ledger has never seen — including manual 'send money "
        "to paybill' payments that were never initiated through the site. "
        "Idempotent: a receipt number is recorded once, however many times it "
        "is pulled. Defaults to the last 24 hours; pass --days to widen the "
        "window or --start/--end ('YYYY-MM-DD') to name it exactly."
    )

    def add_arguments(self, parser):
        parser.add_argument('--days', type=int, default=1, help='Pull the last N days (default: 1).')
        parser.add_argument('--start', default=None, help="Window start, 'YYYY-MM-DD' (overrides --days).")
        parser.add_argument('--end', default=None, help="Window end, 'YYYY-MM-DD' (default: now).")
        parser.add_argument('--dry-run', action='store_true', help='List what would be recorded without saving.')

    def handle(self, *args, **options):
        nairobi = timezone.localtime().tzinfo
        end = timezone.now()
        if options['end']:
            try:
                end = timezone.make_aware(
                    timezone.datetime.strptime(options['end'], '%Y-%m-%d'), nairobi
                )
            except ValueError:
                raise CommandError("--end must be 'YYYY-MM-DD', e.g. --end 2026-10-09.")
        if options['start']:
            try:
                start = timezone.make_aware(
                    timezone.datetime.strptime(options['start'], '%Y-%m-%d'), nairobi
                )
            except ValueError:
                raise CommandError("--start must be 'YYYY-MM-DD', e.g. --start 2026-10-01.")
        else:
            start = end - timedelta(days=max(options['days'], 1))

        fmt = '%Y-%m-%d %H:%M:%S'
        start_str = start.astimezone(nairobi).strftime(fmt)
        end_str = end.astimezone(nairobi).strftime(fmt)

        rows, offset = [], 0
        try:
            while True:
                page = pull_paybill_transactions(start_str, end_str, offset=offset)
                # Safaricom answers a window it holds no rows for — or a
                # shortcode nobody enabled Pull for — with a code and a
                # sentence of its own rather than an error status.
                code = str(page.get('ResponseCode') or '')
                if code and code != '1000':
                    message = str(page.get('ResponseMessage') or 'Safaricom returned no transactions.')
                    lowered = message.lower()
                    if 'not have any available' in lowered or 'not available' in lowered:
                        # Not an empty window — a shortcode Pull was never
                        # turned on for. Reporting "0 pulled" here would send
                        # the desk looking at the wrong thing, so the command
                        # names the fix instead.
                        raise CommandError(
                            f'{message} — this usually means the shortcode has '
                            'never been registered for Pull. Run '
                            '`manage.py register_mpesa_pull_url` once, then pull again.'
                        )
                    # An empty window is a normal answer, not a failure; say
                    # so rather than reporting a silent zero.
                    self.stdout.write(self.style.WARNING(f'Safaricom answered: {message}'))
                    break
                # The documented answer nests rows under `Response` with
                # lowercase keys; normalize_pull_rows takes that or the
                # `Result` spelling to the shape the recorder reads.
                result = normalize_pull_rows(page)
                rows.extend(result)
                # The API caps each response; an empty or short page means the
                # window is exhausted, otherwise take the next slice.
                if not result or len(result) < 100:
                    break
                offset += len(result)
        except MpesaConfigurationError as error:
            raise CommandError(f'{error} Set the MPESA_* environment variables and try again.') from error
        except (requests.RequestException, ValueError, KeyError) as error:
            raise CommandError(f'Safaricom pull failed: {error}') from error

        recorded, skipped = 0, 0
        for row in rows:
            trans_id = row.get('TransID') or row.get('TransactionID')
            if not trans_id:
                continue
            if Contribution.objects.filter(mpesa_receipt_number=trans_id).exists():
                skipped += 1
                continue
            if options['dry_run']:
                self.stdout.write(
                    f"  would record {trans_id}: KES {row.get('TransAmount', '?')} "
                    f"ref={row.get('BillRefNumber') or '(none)'} from {row.get('MSISDN', '?')}"
                )
                recorded += 1
                continue
            contribution = record_direct_paybill_payment(row)
            if contribution is not None:
                recorded += 1

        verb = 'would be recorded' if options['dry_run'] else 'recorded'
        self.stdout.write(self.style.SUCCESS(
            f'Pulled {len(rows)} transaction(s) for {start_str} → {end_str}: '
            f'{recorded} {verb}, {skipped} already in the ledger.'
        ))
