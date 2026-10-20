"""The officers whose signatures the church's paper carries.

A signature belongs to the person, not to the paper: the treasurer saves the
slip they sign cheques with once — photographed, or drawn on the profile page
with a finger — and every receipt and report the church prints carries it under
the office they hold. This module is the one place that decides which office a
member's saved signature stands for, and which of those signatures a given
document prints, so a receipt and the report it is filed with can never
disagree about who signed.

The signature is never required. An office with nobody in it, or a holder who
has not saved a signature yet, simply leaves the paper's ruled line as it has
always been — a receipt is not held back because the treasurer is new.
"""

from .models import MemberProfile

#: The two offices a giving receipt is signed by, in the order they print:
#: (role code, office label). The treasurer issues it; the first elder
#: authorises it.
#:
#: Both offices are listed even though a receipt with only one officer held
#: prints a single centred slot: the treasurer who is also the first elder
#: answers only as the senior office (see ``office_holder``), so a treasurer-
#: only list would find nobody and leave the slip unsigned entirely.
RECEIPT_OFFICES = (
    ('treasurer', 'Treasurer'),
    ('first_elder', 'First Elder'),
)

#: Every office that may keep a signature, senior office last so that
#: ``office_for`` can let the senior office win when one person holds both.
SIGNING_OFFICES = (
    ('treasurer', 'Treasurer'),
    ('first_elder', 'First Elder'),
)

OFFICE_LABELS = dict(SIGNING_OFFICES)


def office_code_for(profile):
    """The office code this member's signature stands for, or ''.

    A person may hold both offices — a treasurer who is also the first elder.
    The senior office wins, so one profile never prints itself twice on the
    same paper: the elder authorises, the treasurer issues.
    """
    if not profile:
        return ''
    held = set(profile.get_roles() or ())
    for code, _label in reversed(SIGNING_OFFICES):
        if code in held:
            return code
    return ''


def office_for(profile):
    """The office label this member's signature stands for, or ''."""
    return OFFICE_LABELS.get(office_code_for(profile), '')


def may_sign(profile):
    """Whether this member's profile offers a signature to save."""
    return bool(office_for(profile))


def signer_name(profile):
    """The name the paper prints under the signature."""
    user = getattr(profile, 'user', None)
    return (f"{getattr(user, 'first_name', '')} {getattr(user, 'last_name', '')}".strip()
            or getattr(user, 'username', '')
            or '')


def signature_bytes(profile):
    """The saved signature as image bytes, or ``None`` when there is none.

    Read through the storage backend by hand rather than through a URL: the
    printer needs the pixels, and a file that has gone missing under the
    profile's feet must leave a blank line, not fail the receipt.
    """
    field = getattr(profile, 'signature', None)
    if not field:
        return None
    try:
        field.open('rb')
        try:
            return field.read()
        finally:
            field.close()
    except (OSError, ValueError):
        return None


def office_holder(code):
    """The profile the office's signature is read from, or ``None``.

    Roles are shared, so an office may carry several holders. The one who has
    saved a signature answers for it — a second holder who has not drawn
    theirs must never hide the church's signature — and otherwise the first
    holder in join order is named under the blank line.

    A member who holds both offices signs only as the senior one, so they are
    never printed twice on the same sheet: the elder authorises, the
    treasurer issues, and one person can only hold one pen.
    """
    # A cheap column match narrows the roster; the office check below is what
    # actually decides, so the comma-and-space spelling of the stored roles
    # (which older rows do not all share) never hides a holder.
    holders = [
        profile
        for profile in MemberProfile.objects.select_related('user')
        .filter(roles__contains=code, user__is_active=True)
        .order_by('id')
        if office_code_for(profile) == code
    ]
    for profile in holders:
        if profile.signature:
            return profile
    return holders[0] if holders else None


def _entry(code, profile):
    return {
        'code': code,
        'office': OFFICE_LABELS.get(code, code.replace('_', ' ').title()),
        'name': signer_name(profile),
        'image': signature_bytes(profile),
    }


def signatories(codes=None):
    """The office holders who sign, in printing order.

    Returns one entry per office — ``{'code', 'office', 'name', 'image'}`` —
    the image being the saved signature bytes, or ``None`` when the office
    carries nobody or its holder has not saved one. Offices nobody holds are
    left out entirely.
    """
    wanted = tuple(codes or tuple(code for code, _label in SIGNING_OFFICES))
    entries = []
    for code in wanted:
        profile = office_holder(code)
        if profile:
            entries.append(_entry(code, profile))
    return entries


def receipt_signatures():
    """The two signatures a giving receipt prints, treasurer first."""
    return signatories(tuple(code for code, _label in RECEIPT_OFFICES))


def report_signatures():
    """Signatures keyed by office code, for the A4 reports' ruled slots."""
    return {entry['code']: entry for entry in signatories()}
