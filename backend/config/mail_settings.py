"""Resolve which mailbox the announcement broadcast sends through.

The church sends two kinds of mail: the day-to-day transactional messages
(receipts, invitations, pledge reminders) and the congregation-wide
announcement broadcast. A shared mailbox is policed by a sending-velocity rule
— Zoho Mail blocks it mid-broadcast with SMTP 550 5.4.6 — so the broadcast can
ride a transactional relay (ZeptoMail) instead, while the transactional mail
keeps the main mailbox.

This module is the one place that decides which mailbox the broadcast uses, so
the rule can be tested without booting Django's settings. ``settings.py`` calls
it once at import; the management command ``send_test_email`` prints what it
resolved.
"""

# ZeptoMail's relay values are fixed; only the send token differs per account.
# 587 carries STARTTLS, which is what Django's ``use_tls`` asks for.
ZEPTOMAIL_SMTP_HOST = "smtp.zeptomail.com"
ZEPTOMAIL_SMTP_PORT = 587
ZEPTOMAIL_SMTP_USER = "emailapikey"


def _truthy(value, default=False):
    """Read a boolean-ish environment string; ``None`` keeps the default."""
    if value is None:
        return default
    return str(value).strip().lower() in ("1", "true", "yes", "on")


def resolve_announcement_email(env, main):
    """The announcement broadcast's SMTP settings, from the environment.

    ``env`` is the process environment (or any mapping); ``main`` carries the
    main mailbox's resolved settings — ``host``, ``port``, ``user``,
    ``password``, ``use_tls`` and ``from_email``.

    An explicit ``ANNOUNCEMENT_EMAIL_*`` override wins, so an existing
    deployment keeps whatever mailbox it named. Failing that, a ZeptoMail send
    token (``ZEPTOMAIL_SEND_TOKEN``) switches the broadcast onto ZeptoMail's
    relay. Failing that, the broadcast rides the main mailbox, as before.
    """
    token = (env.get("ZEPTOMAIL_SEND_TOKEN") or "").strip()
    use_zepto = bool(token)

    host = env.get("ANNOUNCEMENT_EMAIL_HOST") or (ZEPTOMAIL_SMTP_HOST if use_zepto else main["host"])
    port = int(env.get("ANNOUNCEMENT_EMAIL_PORT") or (ZEPTOMAIL_SMTP_PORT if use_zepto else main["port"]))
    user = env.get("ANNOUNCEMENT_EMAIL_HOST_USER") or (ZEPTOMAIL_SMTP_USER if use_zepto else main["user"])
    password = env.get("ANNOUNCEMENT_EMAIL_HOST_PASSWORD") or (token if use_zepto else main["password"])
    use_tls = _truthy(env.get("ANNOUNCEMENT_EMAIL_USE_TLS"), True if use_zepto else main["use_tls"])
    from_email = (
        env.get("ANNOUNCEMENT_FROM_EMAIL")
        or env.get("ZEPTOMAIL_FROM_EMAIL")
        or main["from_email"]
    )

    return {
        "host": host,
        "port": port,
        "user": user,
        "password": password,
        "use_tls": use_tls,
        "from_email": from_email,
    }
