"""Web Push: the request bell that rings when the app is closed.

Browser push works through the site's service worker: the server encrypts a
small JSON payload to each device's subscription (pywebpush) and hands it to
the browser maker's push service, which wakes the service worker even when no
tab is open. Delivery failures are never allowed to break the request that
caused them — the same covenant as the email notices.
"""
from __future__ import annotations

import json
import logging

from django.conf import settings

logger = logging.getLogger(__name__)

# How long a push may sit in the browser maker's queue before expiring.
PUSH_TTL_SECONDS = 3600


def vapid_keys_ready() -> bool:
    """True once the church has generated its VAPID key pair."""
    from .models import ChurchSettings

    row = ChurchSettings.objects.first()
    return bool(row and row.vapid_public_key and row.vapid_private_key)


def push_to_user(user, *, title: str, body: str, link: str = "", respect_prefs: bool = False) -> int:
    """Send a push to every device `user` has subscribed. Returns deliveries.

    A 404/410 from the push service means the subscription is dead (browser
    reinstalled, permission revoked, endpoint expired) — the row is deleted so
    the list stays clean. ``respect_prefs`` skips members who switched
    announcement pushes off; duty notices (requests) ignore the switch.
    """
    from pywebpush import WebPushException, webpush

    from .models import ChurchSettings, PushSubscription

    if respect_prefs:
        profile = getattr(user, 'member_profile', None)
        if profile and not profile.announce_push:
            return 0

    row = ChurchSettings.objects.first()
    if not row or not row.vapid_public_key or not row.vapid_private_key:
        return 0

    payload = json.dumps({"title": title, "body": body, "link": link})
    sent = 0
    for sub in PushSubscription.objects.filter(user=user):
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                },
                data=payload,
                vapid_private_key=row.vapid_private_key,
                # The browser ties subscriptions to this identity — it must be
                # an origin the service worker answers for.
                vapid_claims={"sub": f"mailto:{getattr(settings, 'DEFAULT_FROM_EMAIL', 'admin@example.com')}"},
                ttl=PUSH_TTL_SECONDS,
            )
            sent += 1
        except WebPushException as exc:
            status = getattr(getattr(exc, 'response', None), 'status_code', None)
            if status in (404, 410):
                sub.delete()
            else:
                logger.warning("Push to subscription %s failed: %s", sub.pk, exc)
        except Exception as exc:  # a broken device never breaks the request
            logger.warning("Push to subscription %s failed: %s", sub.pk, exc)
    return sent


def push_request_notification(kind: str, title: str, body: str, link: str) -> int:
    """Fan a request notice out to every office holder's devices.

    Duty notices ride past the announcement preference — the switch governs
    mass communication, not the requests that answer to your role.
    """
    from .requests import request_audience

    if not vapid_keys_ready():
        return 0
    return sum(
        push_to_user(user, title=title, body=body, link=link)
        for user in request_audience()
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
