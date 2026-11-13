"""Ending fund drives on their own day, and saying so.

A drive names the day it closes. Nothing should have to press End when that
day passes: the sweep here retires every drive whose end date has gone by, so
the desk that ran it and the members who gave to it read the same answer — the
drive is over. The daily cron runs it (see deploy.sh), and the drives API runs
it once more before answering, so a flag left over from yesterday never
outlives the first reader of today.

Ending a drive is a decision nobody in the room makes, so it is announced:
the desk that raised it and the treasury are told through the bell, the
letter and the phone, once per drive — the conditional update that ends it is
also the claim that tells, so a racing cron and page load cannot both speak.

The end date is the last day the drive is open: a drive that closes today is
still live all of today and ends on the morrow.
"""

from django.utils import timezone


def close_ended_fund_drives(today=None, notify=True) -> int:
    """End every drive whose end date is behind `today`; return how many.

    Idempotent by design — the filter asks only for drives still marked live,
    so a second run (the cron and the API's own sweep, or a hand-run) ends
    nothing and reports nothing.
    """
    from .models import FundraisingCampaign

    day = today or timezone.localdate()
    ending = list(
        FundraisingCampaign.objects.filter(
            is_active=True,
            end_date__isnull=False,
            end_date__lt=day,
        ).select_related('created_by')
    )

    closed = 0
    for drive in ending:
        # One conditional update per drive: the row it matched is the drive
        # this run may end, so two sweeps at once — the cron and a page load —
        # cannot both close it, and the notification below goes out once.
        if not FundraisingCampaign.objects.filter(pk=drive.pk, is_active=True).update(is_active=False):
            continue
        closed += 1
        drive.is_active = False
        if notify:
            try:
                notify_drive_ended(drive)
            except Exception:
                # A notice never fails the ending it announces; the drive's
                # own day has still been honoured.
                pass
    return closed


def drive_ended_wording(drive, church_name: str = '') -> tuple[str, str]:
    """The one sentence both desks get: what ended, and when.

    Audiences differ, the fact does not — a desk and the treasury should not
    read two versions of one closing. Returns ``(title, message)``.
    """
    day = drive.end_date.strftime('%d/%m/%Y') if drive.end_date else 'its end date'
    title = f'Fund drive ended: {drive.name}'
    message = (
        f"'{drive.name}' ended on its own: its end date, {day}, has passed. "
        'The drive no longer takes gifts and is no longer listed; what it '
        'raised stays on its page.'
    )
    if church_name:
        message = f'{church_name}: {message}'
    return title, message


def notify_drive_ended(drive) -> int:
    """Tell the drive's creator and the treasury that the date closed it.

    Each channel stands alone — a mailbox that refuses the letter must not
    stop the bell, and a member with no device is the normal state rather
    than a failure. Returns how many people were written to the bell.
    """
    from django.conf import settings
    from django.contrib.auth.models import User
    from django.core.mail import send_mail
    from django.db.models import Q

    from .models import ChurchNotification

    church_name = ''
    try:
        # Imported here: views loads this module inside its own request paths,
        # so a module-level import would tie the two together in a circle.
        from .views import current_church_name

        church_name = current_church_name()
    except Exception:
        church_name = ''

    title, message = drive_ended_wording(drive, church_name)

    # The desk that raised it lands on its own drives; the treasury on the
    # desk where drives are posted, approved and monitored. One person is one
    # notice — a treasurer who also raised the drive is told once, and the
    # treasury's door wins because that is where the closing is acted on.
    links = {}
    if drive.created_by_id and drive.created_by and drive.created_by.is_active:
        links[drive.created_by_id] = '/support/campaigns'
    treasury = (
        User.objects.filter(
            Q(member_profile__role='treasurer') | Q(member_profile__role='admin'),
            is_active=True,
        )
        .distinct()
        .select_related('member_profile')
    )
    for person in treasury:
        links[person.pk] = '/administration/fund-drives'
    if not links:
        return 0

    from .models import wants_notice

    people = list(User.objects.filter(pk__in=links).select_related('member_profile'))

    try:
        ChurchNotification.objects.bulk_create([
            ChurchNotification(user=person, title=title, message=message, link=links[person.pk])
            for person in people
            if wants_notice(person, 'fund_drives', 'bell')
        ])
    except Exception:
        pass

    # One letter per mailbox: two accounts can share an address.
    sent_to = set()
    for person in people:
        address = (person.email or '').strip()
        if not address or address.lower() in sent_to:
            continue
        if not wants_notice(person, 'fund_drives', 'email'):
            continue
        sent_to.add(address.lower())
        try:
            send_mail(
                title, message, settings.DEFAULT_FROM_EMAIL, [address],
                fail_silently=True,
            )
        except Exception:
            continue

    try:
        from .push import push_to_user

        for person in people:
            if not wants_notice(person, 'fund_drives', 'push'):
                continue
            try:
                push_to_user(
                    person, title=title, body=message.split('\n')[0],
                    link=links[person.pk],
                )
            except Exception:
                continue
    except Exception:
        pass

    return len(people)
