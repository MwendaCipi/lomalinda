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


def _amount(value):
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None
    return amount if amount > 0 else None


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
    credited = []
    for purpose, amount in allocations:
        row = credit_account(
            purpose=purpose,
            amount=amount,
            description=f"Contribution — {contribution.get_payment_method_display()} ({purpose})",
            reference=reference,
            created_by=created_by,
            at=contribution.paid_at,
        )
        if row is not None:
            credited.append(row)
    return credited


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
