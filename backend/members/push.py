"""Web Push: the request bell that rings when the app is closed.

Browser push works through the site's service worker: the server encrypts a
small JSON payload to each device's subscription (pywebpush) and hands it to
the browser maker's push service, which wakes the service worker even when no
tab is open. Delivery failures are never allowed to break the request that
caused them — the same covenant as the email notices.

Two things have to be true before a single notice can leave: the church has a
VAPID key pair on record (``ensure_vapid_keys``), and the member's device has a
subscription stored against their account. Both are checked here rather than
assumed, because a missing one is otherwise silent — the notice is written to
the bell and the phone simply never rings.
"""
from __future__ import annotations

import base64
import json
import logging

from django.conf import settings

logger = logging.getLogger(__name__)

# How long a push may sit in the browser maker's queue before expiring.
PUSH_TTL_SECONDS = 3600


def generate_vapid_key_pair() -> tuple[str, str]:
    """A fresh VAPID pair: (browser key, private key PEM).

    Web Push VAPID is a P-256 (prime256v1) pair. The private key is kept as
    PEM (what pywebpush accepts), the public key as the raw base64url
    "application server key" browsers subscribe with.
    """
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec

    private_key = ec.generate_private_key(ec.SECP256R1())
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode('ascii')
    public_raw = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint,
    )
    public_b64 = base64.urlsafe_b64encode(public_raw).rstrip(b'=').decode('ascii')
    return public_b64, private_pem


def ensure_vapid_keys() -> bool:
    """Make sure a VAPID pair is on record, generating one if the church has none.

    The pair identifies the church's server to the browser makers' push
    services, and it is the one piece of push configuration that lives in the
    database rather than in the code — so a fresh install, a restored dump, or
    a church that never ran the management command has no keys and no push,
    with nothing on any screen saying so. Creating the pair the first time a
    browser asks for it removes that silent dead end.

    Rotating is the one thing this must never do by itself: a device
    subscribes *with* the public key it was served, so a changed pair
    invalidates every existing subscription and every member has to enable
    notifications again. Hence generation only when both halves are missing,
    never when they are merely stale.
    """
    from .models import ChurchSettings

    row = ChurchSettings.objects.first()
    if row is None:
        row = ChurchSettings.objects.create()
    if row.vapid_public_key and row.vapid_private_key:
        return True

    public_b64, private_pem = generate_vapid_key_pair()
    row.vapid_public_key = public_b64
    row.vapid_private_key = private_pem
    row.save(update_fields=['vapid_public_key', 'vapid_private_key'])
    logger.info('Generated a VAPID key pair for web push (none was on record).')
    return True


def vapid_keys_ready() -> bool:
    """True once the church has generated its VAPID key pair."""
    from .models import ChurchSettings

    row = ChurchSettings.objects.first()
    return bool(row and row.vapid_public_key and row.vapid_private_key)


def _subscription_label(endpoint: str) -> str:
    """The device as much as a log line needs it: the push service's host.

    Endpoints are long, unique per device, and carry a capability token, so
    only the host is written anywhere a human reads.
    """
    try:
        from urllib.parse import urlparse

        host = urlparse(endpoint or '').hostname or ''
        return host or 'unknown push service'
    except Exception:  # a malformed endpoint still gets a label
        return 'unknown push service'


def deliver_to_subscription(sub, payload: str, row) -> tuple[bool, int | None, str]:
    """Hand one encrypted notice to one device's push service.

    Returns ``(delivered, status, error)``. A 404/410 is the push service
    saying the device is gone (browser reinstalled, permission revoked,
    endpoint expired): the row is deleted so the list stays clean. Every other
    failure is reported, never raised — a broken device must not break the
    request that caused the notice.
    """
    from pywebpush import WebPushException, webpush

    try:
        webpush(
            subscription_info={
                'endpoint': sub.endpoint,
                'keys': {'p256dh': sub.p256dh, 'auth': sub.auth},
            },
            data=payload,
            vapid_private_key=row.vapid_private_key,
            # The browser ties subscriptions to this identity — it must be
            # an origin the service worker answers for.
            vapid_claims={'sub': f"mailto:{getattr(settings, 'DEFAULT_FROM_EMAIL', 'admin@example.com')}"},
            ttl=PUSH_TTL_SECONDS,
        )
        return True, None, ''
    except WebPushException as exc:
        status = getattr(getattr(exc, 'response', None), 'status_code', None)
        if status in (404, 410):
            sub.delete()
            return False, status, 'this device is no longer registered'
        logger.warning('Push to subscription %s failed: %s', sub.pk, exc)
        return False, status, str(exc)
    except Exception as exc:  # a broken device never breaks the request
        logger.warning('Push to subscription %s failed: %s', sub.pk, exc)
        return False, None, str(exc)


def push_to_user(user, *, title: str, body: str, link: str = "", respect_prefs: bool = False) -> int:
    """Send a push to every device `user` has subscribed. Returns deliveries.

    ``respect_prefs`` skips members who switched announcement pushes off; duty
    notices (requests) ignore the switch.
    """
    from .models import ChurchSettings, PushSubscription

    if respect_prefs:
        profile = getattr(user, 'member_profile', None)
        if profile and not profile.announce_push:
            return 0

    row = ChurchSettings.objects.first()
    if not row or not row.vapid_public_key or not row.vapid_private_key:
        logger.warning('Push skipped for %s: the church has no VAPID key pair on record.', user)
        return 0

    payload = json.dumps({"title": title, "body": body, "link": link})
    sent = 0
    for sub in PushSubscription.objects.filter(user=user):
        delivered, _status, _error = deliver_to_subscription(sub, payload, row)
        if delivered:
            sent += 1
    return sent


def send_test_push(user, *, title: str = "SDA Church Loma Linda", body: str | None = None, link: str = "") -> dict:
    """Push one test notice to `user`'s devices and report what each answered.

    The enable button proves a browser accepted a subscription; it cannot prove
    the server can still reach that device, and the two failures look identical
    from the phone (nothing arrives). This reports the delivery per device, so
    "no devices are subscribed", "the row points at a dead endpoint" and "the
    push service refused us" stop looking the same.
    """
    from .models import ChurchSettings, PushSubscription

    keys_ready = vapid_keys_ready()
    subscriptions = list(PushSubscription.objects.filter(user=user))
    report = {
        'keys_ready': keys_ready,
        'devices': len(subscriptions),
        'delivered': 0,
        'results': [],
    }
    if not keys_ready or not subscriptions:
        return report

    row = ChurchSettings.objects.first()
    payload = json.dumps({
        "title": title,
        "body": body or "This is a test notification from the church app. If you can read this, this device is set up.",
        "link": link,
    })
    for sub in subscriptions:
        delivered, status, error = deliver_to_subscription(sub, payload, row)
        if delivered:
            report['delivered'] += 1
        report['results'].append({
            'device': _subscription_label(sub.endpoint),
            'delivered': delivered,
            'status': status,
            'error': error,
        })
    return report


def push_request_notification(kind: str, title: str, body: str, link: str, audience: str = "") -> int:
    """Fan a request notice out to the right office holders' devices.

    The audience rule is the request-audience rule (elders and clerk for every
    desk, admins for join only) and duty notices ride past the announcement
    preference — the switch governs mass communication, not the requests that
    answer to your role. A prayer request that named who it is for stays with
    the same choice here, so its phone notice matches its letter.
    """
    from .requests import request_audience

    if not vapid_keys_ready():
        logger.warning('Push skipped for the %s desk: the church has no VAPID key pair on record.', kind)
        return 0
    return sum(
        push_to_user(user, title=title, body=body, link=link)
        for user in request_audience(kind, audience)
    )


def push_announcement(announcement) -> int:
    """Wake the phones of an announcement's audience.

    Audience and visibility follow the same rules as the email broadcast;
    members who switched announcement notifications off are skipped. Fire-
    and-forget by covenant: a push failure never fails the announcement.
    """
    from .views import announcement_recipients, current_church_name

    if not vapid_keys_ready():
        return 0
    church_name = current_church_name()
    body = (announcement.text or announcement.title or "")[:300]
    sent = 0
    for user in announcement_recipients(announcement):
        sent += push_to_user(
            user,
            title=f"{church_name}: {announcement.title}".strip(': '),
            body=body,
            link="/announcements",
            respect_prefs=True,
        )
    return sent
