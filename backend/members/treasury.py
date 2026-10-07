"""The one door through which giving money enters the treasury.

Money the church receives digitally — an M-Pesa callback, a Paystack webhook —
and money keyed in at the desk all land in the Contribution and
CashContribution ledgers. The treasury's own accounts used to stay blind to it:
the treasurer read the giving ledger in one screen and the account balances in
another, and every shilling had to be credited by hand if the balance was to
mean anything. The two books now move together: whenever a gift is recorded as
received, the account it names is credited here, once.

Everything routes through credit_contribution_lines() so the rules hold
everywhere: the account is looked up by name (case-insensitive, willing to
match its description), the balance and the transaction row are written in one
atomic step, an unknown account is skipped rather than allowed to interrupt the
gift it belongs to, and the same payment can never be credited twice.
"""
from __future__ import annotations

from decimal import Decimal, InvalidOperation

from django.db import transaction

from .models import TreasuryAccount, TreasuryAccountTransaction

# The giving ledgers name the money's destination in the wording the giver
# read (the account's description); the M-Pesa prompt and the allocations
# payload carry the short name. Either may identify the account, and people
# type loosely, so the match ignores case and stray spaces.
def account_for_purpose(purpose):
    """The treasury account a giving line names, or None.

    Matches the account's short name (what the M-Pesa prompt shows, e.g.
    ``Tithe``, ``CombinedOff``) or its description (what the form reads,
    e.g. ``Tithe — returned to God``), case-insensitively. A drive's account
    reference matches too, since a gift for a drive lands in its account.
    """
    needle = (purpose or '').strip().lower()
    if not needle:
        return None
    for account in TreasuryAccount.objects.all():
        for candidate in (account.name, account.description):
            candidate = (candidate or '').strip().lower()
            if candidate and candidate == needle:
                return account
    return None


def account_reference_for(purpose):
    """The treasury account's short name for a giving purpose, or None.

    Safaricom shows one short reference in the prompt; the giver may name the
    account by its description ("Adventist Youth Ministry"), while the account
    itself is known by its short name ("AYM"). Resolve the name back to the
    treasury account and hand back the short name, so the prompt always reads
    the reference the church uses for the account — not whatever wording the
    form happened to carry.
    """
    account = account_for_purpose(purpose)
    return account.name if account else None


def _amount(value):
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None
    return amount if amount > 0 else None


# The transaction kinds that put money INTO an account. A drive's progress
# reads these: money the fund has received, however it arrived. Debits and
# transfers out are money spent or moved on — spending a fund's balance does
# not un-raise what was given.
INFLOW_TYPES = ('credit', 'transfer_in')


def account_inflows(account, since=None):
    """Every shilling that has entered the account, from any door.

    The sum of the account's own credit and transfer-in rows: prompt money
    credited on Safaricom's word, desk receipts keyed in by the treasurer,
    and any opening balance the church seeded — all equal residents of the
    one transaction log, so all count alike.

    ``since`` narrows the reading to rows dated at or after that moment. A
    fund drive born against an account that already held money reads from its
    own beginning, so a promoted account starts the drive at zero and only
    what lands afterwards is the drive's.
    """
    from django.db.models import Sum

    rows = account.transactions.filter(transaction_type__in=INFLOW_TYPES)
    if since is not None:
        rows = rows.filter(created_at__gte=since)
    total = rows.aggregate(total=Sum('amount'))['total']
    return total or Decimal('0')


def credit_account(*, purpose, amount, description, reference='', created_by=None, at=None):
    """Credit the named account with the amount; return the transaction.

    Returns None when no account answers to this name or the amount is not
    positive money — a contribution must never fail because its account is
    mistyped or missing, it simply waits for the treasurer to credit it by
    hand as before.
    """
    account = account_for_purpose(purpose)
    amount = _amount(amount)
    if account is None or amount is None:
        return None
    return apply_credit(
        account=account,
        amount=amount,
        description=description,
        reference=reference,
        created_by=created_by,
        at=at,
    )


def apply_credit(*, account, amount, description, reference='', created_by=None, at=None):
    """Write the balance bump and its transaction row atomically.

    Callers that already resolved the account (a form that names accounts by
    id) use this directly; everything else goes through credit_account().
    """
    amount = _amount(amount)
    if account is None or amount is None:
        return None
    with transaction.atomic():
        account.balance = (account.balance or Decimal('0')) + amount
        account.save(update_fields=['balance'])
        row = TreasuryAccountTransaction.objects.create(
            account=account,
            transaction_type='credit',
            amount=amount,
            description=description[:255],
            reference=(reference or '')[:100],
            created_by=created_by,
        )
        if at is not None:
            TreasuryAccountTransaction.objects.filter(pk=row.pk).update(created_at=at)
            row.created_at = at
    return row


def credit_contribution_lines(contribution, *, allocations=None, created_by=None):
    """Credit the treasury for a completed digital gift.

    A gift is one payment that may feed several accounts, already split on the
    contribution's own ledger lines when it was created — one row per account,
    sharing a payment group. Crediting re-reads those sibling rows so the
    treasury sees exactly the split the giver asked for, and each call credits
    the whole payment once: the guard is the payment (the checkout id for an
    M-Pesa push, otherwise the rows' shared group or the row's id), not the
    caller, so a Safaricom retry after our acknowledgement is still safe.

    ``allocations`` is an explicit [(purpose, amount)] split for payments that
    were not stored split (a single-row C2B paybill gift, for instance).
    """
    if contribution.status != 'completed':
        return []

    if allocations is None:
        siblings = ContributionSiblings(contribution).rows()
        allocations = [(row.purpose, row.amount) for row in siblings]

    reference = contribution.mpesa_receipt_number or contribution.paystack_reference or f'CONTRIB-{contribution.id}'
    from .models import giver_display_name

    giver = giver_display_name(
        contribution.donor_name,
        member=contribution.member,
        email=contribution.donor_email,
        phone=contribution.phone_number,
    )
    method_display = contribution.get_payment_method_display()

    credited = []
    for purpose, amount in allocations:
        if giver and giver.lower() != 'anonymous giver':
            desc = f"{giver} — {method_display} ({purpose})"
        else:
            desc = f"Contribution — {method_display} ({purpose})"
        row = credit_account(
            purpose=purpose,
            amount=amount,
            description=desc,
            reference=reference,
            created_by=created_by,
            at=contribution.paid_at,
        )
        if row is not None:
            credited.append(row)
    return credited


def enrich_transaction_descriptions(transactions):
    """Enriches a list or queryset of TreasuryAccountTransaction objects or dicts with giver names in their descriptions.

    If a transaction originated from a Contribution or CashContribution where the giver is identifiable,
    the description is updated to show the person's name (e.g. 'John Doe — M-Pesa (Local Church Budget)').
    """
    if not transactions:
        return transactions

    from django.db.models import Q
    from .models import Contribution, CashContribution, giver_display_name

    is_dict = isinstance(transactions[0], dict)

    refs = set()
    contrib_ids = set()
    cash_ids = set()

    for item in transactions:
        ref = (item.get('reference') if is_dict else getattr(item, 'reference', '')) or ''
        ref = ref.strip()
        if not ref:
            continue
        if ref.startswith('CONTRIB-'):
            try:
                contrib_ids.add(int(ref.split('-')[1]))
            except (IndexError, ValueError):
                pass
        elif ref.startswith('CASH-'):
            try:
                cash_ids.add(int(ref.split('-')[1]))
            except (IndexError, ValueError):
                pass
        elif ref.startswith('REC-'):
            refs.add(ref)
        elif not ref.startswith(('WD-', 'INIT', 'EXP-')):
            refs.add(ref)

    giver_map = {}

    if refs or contrib_ids:
        q = Q()
        if refs:
            q |= Q(mpesa_receipt_number__in=refs) | Q(paystack_reference__in=refs)
        if contrib_ids:
            q |= Q(id__in=contrib_ids)
        contribs = Contribution.objects.filter(q).select_related('member')
        for c in contribs:
            g = giver_display_name(c.donor_name, member=c.member, email=c.donor_email, phone=c.phone_number)
            if g and g.lower() != 'anonymous giver':
                if c.mpesa_receipt_number:
                    giver_map[c.mpesa_receipt_number] = g
                if c.paystack_reference:
                    giver_map[c.paystack_reference] = g
                giver_map[f"CONTRIB-{c.id}"] = g

    if refs or cash_ids:
        q = Q()
        if refs:
            q |= Q(receipt_number__in=refs)
        if cash_ids:
            q |= Q(id__in=cash_ids)
        cash_contribs = CashContribution.objects.filter(q)
        for cc in cash_contribs:
            g = giver_display_name(cc.donor_name, email=cc.giver_email, phone=cc.giver_phone)
            if g and g.lower() != 'anonymous giver':
                if cc.receipt_number:
                    giver_map[cc.receipt_number] = g
                giver_map[f"CASH-{cc.id}"] = g

    for item in transactions:
        ref = (item.get('reference') if is_dict else getattr(item, 'reference', '')) or ''
        ref = ref.strip()
        desc = (item.get('description') if is_dict else getattr(item, 'description', '')) or ''
        giver = giver_map.get(ref)
        if giver:
            if desc.startswith("Contribution —"):
                new_desc = desc.replace("Contribution —", f"{giver} —", 1)
            elif not desc.startswith(giver):
                new_desc = f"{giver} — {desc}"
            else:
                new_desc = desc
            if is_dict:
                item['description'] = new_desc
                item['giver_name'] = giver
            else:
                item.description = new_desc

    return transactions


class ContributionSiblings:
    """The per-account ledger lines a single payment created."""

    def __init__(self, contribution):
        self.contribution = contribution

    def rows(self):
        from .models import Contribution

        contribution = self.contribution
        if contribution.payment_group:
            return list(
                Contribution.objects.filter(payment_group=contribution.payment_group)
                .order_by('id')
            )
        return [contribution]

