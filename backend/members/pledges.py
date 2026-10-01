"""Pledges: a promise with a date, and the nudge that keeps it.

A member who taps Pledge on a giving announcement is not giving — they are
saying what they will give and the day they will have given it by. That day
never runs past the event the announcement is about (the view refuses it), so
the promise stays inside the drive it belongs to.

A pledge closes the moment the gift arrives, and there are three doors to that
state, because no single one of them is always right:

* **Their giving.** A completed contribution from that member to the pledged
  account closes the pledge on its own. This is the common case — the member
  gives through M-Pesa and never opens the site again — and it needs nobody to
  remember anything.
* **The member.** A gift handed over in cash, or recorded by the office
  without their name on it, leaves nothing for the match to find. The member
  ticks their own pledge off.
* **The office.** When neither of those happens and the treasurer knows the
  gift came in, the office marks it. This is also the only way to *undo* a
  closure: a wrong tick, or a matched gift that turned out to be for something
  else.

Whichever door it came through is kept on the record, so a closed pledge can
be told apart from a promise somebody merely struck out.

The one-day-before reminder is the point of the date: a member who pledged
5,000 by the 20th hears about it on the 19th if the gift has not arrived. It
is sent by ``manage.py send_pledge_reminders``, which the server runs daily,
and the stamp it leaves makes a re-run harmless.
"""

from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from .models import AnnouncementResponse, CampaignPledge, Contribution

REDEEMED_BY_GIVING = 'giving'
REDEEMED_BY_MEMBER = 'member'
REDEEMED_BY_OFFICE = 'office'

# Statuses on a Contribution that mean money the church has actually received.
RECEIVED_STATUS = 'completed'


def money(amount) -> str:
    """An amount the way every other church email writes it."""
    return f"KES {amount:,.2f}"


def pledge_purpose_candidates(announcement) -> set[str]:
    """The strings a gift for this announcement is likely recorded under.

    A contribution carries a purpose, not an announcement: giving from the
    announcement's Give Money button records the account it named, and the
    church's own M-Pesa paybill writes the account name or the giving type the
    announcement asked for. Both are compared, lower-cased, and nothing else —
    a wrong match would close a pledge that is still owed.
    """
    candidates = set()
    account = (announcement.support_account or '').strip().lower()
    if account:
        candidates.add(account)
    label = (announcement.get_action_type_display() or '').strip().lower()
    if label and label != 'none':
        candidates.add(label)
    return candidates


def redeem_pledges_matched_by_giving(pledges=None) -> int:
    """Close every pledge the member has already given against.

    Called before the reminders go out, and by the pledge panel the office
    reads, so a gift that arrived last week never produces a nudge this week.
    A pledge counts as honoured by *any* received gift against the pledged
    account once the pledge was made: a member who has begun to give has begun
    to redeem, and the office can see the amounts on the ledger if they want to
    know whether the whole promise arrived.
    """
    standing = (pledges if pledges is not None else AnnouncementResponse.objects.all())
    standing = list(
        standing.select_related('announcement')
        .filter(pledge_amount__isnull=False, pledge_redeemed_at__isnull=True, user__isnull=False)
    )
    if not standing:
        return 0

    gifts_by_member: dict[int, list[tuple[str, object]]] = {}
    for member_id, purpose, paid_at, created_at in Contribution.objects.filter(
        member_id__in={pledge.user_id for pledge in standing},
        status=RECEIVED_STATUS,
    ).values_list('member_id', 'purpose', 'paid_at', 'created_at'):
        gifts_by_member.setdefault(member_id, []).append(
            ((purpose or '').strip().lower(), paid_at or created_at)
        )

    closed = 0
    now = timezone.now()
    for pledge in standing:
        candidates = pledge_purpose_candidates(pledge.announcement)
        if not candidates:
            continue
        pledged_at = pledge.created_at
        for purpose, given_at in gifts_by_member.get(pledge.user_id, ()):
            if purpose in candidates and given_at and given_at >= pledged_at:
                pledge.pledge_redeemed_at = now
                pledge.pledge_redeemed_via = REDEEMED_BY_GIVING
                pledge.save(update_fields=['pledge_redeemed_at', 'pledge_redeemed_via'])
                closed += 1
                break
    return closed


def redeem_due_pledges(pledge, via: str):
    """Mark one pledge honoured, recording which door it came through."""
    pledge.pledge_redeemed_at = timezone.now()
    pledge.pledge_redeemed_via = via
    pledge.save(update_fields=['pledge_redeemed_at', 'pledge_redeemed_via'])
    return pledge


def redeem_campaign_pledges_matched_by_giving(pledges=None) -> int:
    """Close every drive pledge the member has already given against.

    The drive-owned twin of ``redeem_pledges_matched_by_giving``: a completed
    gift against the drive's own account, made after the promise, closes it.
    The drive's purpose strings are its name and its account reference, both
    compared lower-cased so a wrong match never closes a pledge still owed.
    """
    standing = (pledges if pledges is not None else CampaignPledge.objects.all())
    standing = list(standing.select_related('campaign').filter(redeemed_at__isnull=True))
    if not standing:
        return 0

    gifts_by_member: dict[int, list[tuple[str, object]]] = {}
    for member_id, purpose, paid_at, created_at in Contribution.objects.filter(
        member_id__in={pledge.member_id for pledge in standing},
        status=RECEIVED_STATUS,
    ).values_list('member_id', 'purpose', 'paid_at', 'created_at'):
        gifts_by_member.setdefault(member_id, []).append(
            ((purpose or '').strip().lower(), paid_at or created_at)
        )

    closed = 0
    now = timezone.now()
    for pledge in standing:
        campaign = pledge.campaign
        candidates = {
            (campaign.name or '').strip().lower(),
            (campaign.account_name or '').strip().lower(),
        } - {''}
        if not candidates:
            continue
        for purpose, given_at in gifts_by_member.get(pledge.member_id, ()):
            if purpose in candidates and given_at and given_at >= pledge.created_at:
                pledge.redeemed_at = now
                pledge.redeemed_via = REDEEMED_BY_GIVING
                pledge.save(update_fields=['redeemed_at', 'redeemed_via'])
                closed += 1
                break
    return closed


def reopen_pledge(pledge):
    """Put a pledge back to standing — a wrong tick, undone."""
    pledge.pledge_redeemed_at = None
    pledge.pledge_redeemed_via = ''
    pledge.save(update_fields=['pledge_redeemed_at', 'pledge_redeemed_via'])
    return pledge


def pledges_due_reminder(remind_on=None):
    """Standing pledges whose promised day is tomorrow.

    The member's own giving is matched first, so a gift already recorded never
    earns a reminder. Pledges with no email address, and pledges already
    reminded about, are left out — the stamp is what keeps a re-run honest.
    """
    target = remind_on or (timezone.localdate() + timedelta(days=1))
    redeem_pledges_matched_by_giving()
    return (
        AnnouncementResponse.objects.select_related('announcement', 'user')
        .filter(
            pledge_amount__isnull=False,
            pledge_due_date=target,
            pledge_redeemed_at__isnull=True,
            pledge_reminder_sent_at__isnull=True,
            user__isnull=False,
        )
        .exclude(user__email='')
        .order_by('user__first_name', 'user__username')
    )


def pledge_reminder_body(pledge, church_name: str) -> str:
    """The nudge itself, in the church's own words."""
    member = pledge.user
    member_name = (member.get_full_name() or member.username).strip()
    announcement = pledge.announcement
    towards = announcement.support_account or announcement.get_action_type_display() or announcement.title
    due = pledge.pledge_due_date.strftime('%d %B %Y') if pledge.pledge_due_date else ''

    return (
        f"Dear {member_name},\n\n"
        f"On {pledge.created_at.strftime('%d %B %Y')} you pledged {money(pledge.pledge_amount)} "
        f"towards {towards} for \"{announcement.title}\", promising it by {due}.\n\n"
        "Tomorrow is that day, and we have not yet seen the gift come in. If you have "
        "already given it, please ignore this note — or open the announcement and tick "
        "the pledge off yourself, so our records agree with yours.\n\n"
        f"Give by M-Pesa using the church paybill, or on the site under Give.\n\n"
        "Thank you for your willingness to give. If circumstances have changed, no "
        "explanation is needed, and nothing here is a debt — a pledge is a promise "
        "you are free to keep at your own pace.\n\n"
        f"Yours in Christ,\n{church_name} Stewardship"
    )


def send_pledge_reminder(pledge, church_name: str) -> bool:
    """Email one reminder and stamp it. False when the send failed."""
    subject = f"Your pledge tomorrow — {money(pledge.pledge_amount)}"
    try:
        sent = send_mail(
            subject,
            pledge_reminder_body(pledge, church_name),
            settings.DEFAULT_FROM_EMAIL,
            [pledge.user.email],
            fail_silently=False,
        )
    except Exception:
        return False
    if sent:
        pledge.pledge_reminder_sent_at = timezone.now()
        pledge.save(update_fields=['pledge_reminder_sent_at'])
    return bool(sent)
