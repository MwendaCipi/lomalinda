"""Resolve which mailbox each kind of mail leaves this app through.

Four kinds of mail leave here, and each answers from the address that owns the
question it carries:

``info``
    Human correspondence — the letters a person reads, replies to and keeps.
    This is the church's real, monitored mailbox, so it leaves through the main
    Zoho Mail mailbox and lands back in the desk that reads it.
``treasury``
    Money: receipts, giving acknowledgements and pledge reminders.
``verify``
    Joining and identity: invitations, verify-your-account codes and
    password / email-change links.
``announcement``
    The congregation-wide broadcast.

The last three are machines writing, and a shared mailbox is policed by a
sending-velocity rule — Zoho Mail blocks a burst mid-broadcast with
``SMTP 550 5.4.6`` — so they ride a transactional relay (ZeptoMail, Zoho's
transactional service) instead. Only ``info`` keeps the shared mailbox.

Why the addresses are split rather than all sending as ``info@``: a member
replying to a receipt should reach the treasurer, not the general inbox, and a
member who ignores an invitation should not be able to bury a pastoral letter
under automation. The split is also what keeps ``info@`` a human mailbox — one
whose unread count means somebody is waiting for an answer.

This module is the one place that decides which mailbox a purpose uses, so the
rule can be tested without booting Django's settings. ``settings.py`` calls it
once at import; the management command ``send_test_email`` prints what it
resolved.
"""

#: The four purposes. Strings rather than an enum so a value read off the
#: environment or passed across a call site stays a plain, loggable word.
PURPOSE_INFO = 'info'
PURPOSE_TREASURY = 'treasury'
PURPOSE_VERIFY = 'verify'
PURPOSE_ANNOUNCEMENT = 'announcement'

PURPOSES = (PURPOSE_INFO, PURPOSE_TREASURY, PURPOSE_VERIFY, PURPOSE_ANNOUNCEMENT)

#: The purposes a machine writes. These are the ones offered the relay; the
#: others speak with the church's own voice and keep its mailbox.
TRANSACTIONAL_PURPOSES = (PURPOSE_TREASURY, PURPOSE_VERIFY, PURPOSE_ANNOUNCEMENT)

#: The name every message is sent under. Spelled without the comma
#: ('SDA Loma Linda Meru'): a bare comma inside a From display name is an
#: address-list separator, and the header would be read as two addresses.
DISPLAY_NAME = 'SDA Loma Linda Meru'

#: The address each purpose sends as when nothing overrides it. The domain is
#: the church's own, so a rebranding is one edit here rather than a hunt
#: through the callers. ``announcement`` deliberately has no default of its
#: own: its historical sender is whatever the main mailbox is, so it falls
#: back to ``main['from_email']`` and an existing deployment keeps behaving
#: exactly as it did.
DEFAULT_LOCAL_PARTS = {
    PURPOSE_TREASURY: 'treasury',
    PURPOSE_VERIFY: 'verify',
}

# How the relay is reached. ZeptoMail's values are fixed; only the send token
# differs per account. 587 carries STARTTLS, which is what Django's ``use_tls``
# asks for, and the username is the literal string below rather than an address
# — the account is identified by the token.
ZEPTOMAIL_SMTP_HOST = 'smtp.zeptomail.com'
ZEPTOMAIL_SMTP_PORT = 587
ZEPTOMAIL_SMTP_USER = 'emailapikey'

#: The environment prefixes that can override a purpose's sender and, if a
#: deployment wants a third mailbox rather than the relay, its connection.
ENV_PREFIX = {
    PURPOSE_INFO: 'INFO',
    PURPOSE_TREASURY: 'TREASURY',
    PURPOSE_VERIFY: 'VERIFY',
    PURPOSE_ANNOUNCEMENT: 'ANNOUNCEMENT',
}


def _truthy(value, default=False):
    """Read a boolean-ish environment string; ``None`` keeps the default."""
    if value is None:
        return default
    return str(value).strip().lower() in ('1', 'true', 'yes', 'on')


#: The domain a brand-new deployment is assumed to own, used only when the
#: main mailbox's own address cannot be parsed for a domain. The real domain is
#: always read off ``DEFAULT_FROM_EMAIL``, so a church that renamed its domain
#: moves every sender with one setting: the split is about *which* local part
#: answers, never about which domain the church owns.
MAIL_DOMAIN = 'sdalomalinda.or.ke'


def _resolve_one(purpose, env, main, domain):
    """One purpose's sender and connection settings, from the environment."""
    prefix = ENV_PREFIX[purpose]
    token = (env.get('ZEPTOMAIL_SEND_TOKEN') or '').strip()
    transactional = purpose in TRANSACTIONAL_PURPOSES
    use_zepto = transactional and bool(token)

    host = env.get(f'{prefix}_EMAIL_HOST') or (ZEPTOMAIL_SMTP_HOST if use_zepto else main['host'])
    port = int(env.get(f'{prefix}_EMAIL_PORT') or (ZEPTOMAIL_SMTP_PORT if use_zepto else main['port']))
    user = env.get(f'{prefix}_EMAIL_HOST_USER') or (ZEPTOMAIL_SMTP_USER if use_zepto else main['user'])
    password = env.get(f'{prefix}_EMAIL_HOST_PASSWORD') or (token if use_zepto else main['password'])
    use_tls = _truthy(env.get(f'{prefix}_EMAIL_USE_TLS'), True if use_zepto else main['use_tls'])

    if purpose == PURPOSE_ANNOUNCEMENT:
        # Unchanged from when this module resolved only the broadcast: an
        # explicit name, then the shared ZeptoMail name, then the main mailbox.
        from_email = env.get('ANNOUNCEMENT_FROM_EMAIL') or env.get('ZEPTOMAIL_FROM_EMAIL') or main['from_email']
    else:
        default_address = f"{DEFAULT_LOCAL_PARTS[purpose]}@{domain}" if purpose in DEFAULT_LOCAL_PARTS else None
        default_from = f'{DISPLAY_NAME} <{default_address}>' if default_address else main['from_email']
        from_email = env.get(f'{prefix}_FROM_EMAIL') or default_from

    # A purpose needs a connection of its own only when it is not speaking
    # through the main mailbox. When it is, Django's default connection is
    # already the right one and building a second one just adds a socket.
    explicit = any(env.get(f'{prefix}_EMAIL_{key}') for key in ('HOST', 'PORT', 'HOST_USER', 'HOST_PASSWORD'))
    return {
        'host': host,
        'port': port,
        'user': user,
        'password': password,
        'use_tls': use_tls,
        'from_email': from_email,
        'via_relay': use_zepto or explicit,
    }


def resolve_senders(env, main):
    """Every purpose's sender and connection settings, from the environment.

    ``env`` is the process environment (or any mapping); ``main`` carries the
    main mailbox's resolved settings — ``host``, ``port``, ``user``,
    ``password``, ``use_tls`` and ``from_email``.

    An explicit ``<PURPOSE>_EMAIL_*`` override wins, so an existing deployment
    keeps whatever mailbox it named. Failing that, a ZeptoMail send token
    (``ZEPTOMAIL_SEND_TOKEN``) moves the machine-written purposes onto the
    relay. Failing that, they ride the main mailbox, exactly as before — so
    setting nothing at all changes nothing.
    """
    domain = _domain_of(main['from_email'])
    return {purpose: _resolve_one(purpose, env, main, domain) for purpose in PURPOSES}


def _domain_of(address):
    """The domain in a ``Name <local@domain>`` address, or the bare one.

    Read off the main mailbox so the split is about the local part only. An
    unparseable value falls back to the church's own domain rather than
    raising: a mis-set ``DEFAULT_FROM_EMAIL`` must not stop Django booting.
    """
    text = (address or '').strip()
    if '<' in text and '>' in text:
        text = text[text.index('<') + 1:text.index('>')].strip()
    if '@' in text:
        return text.rsplit('@', 1)[-1].strip() or MAIL_DOMAIN
    return MAIL_DOMAIN


def resolve_announcement_email(env, main):
    """The announcement broadcast's SMTP settings, from the environment.

    Kept because it was this module's original job and callers name it
    directly; the rule now lives once, in ``resolve_senders``, and this is a
    view onto the ``announcement`` purpose rather than a second copy of it.
    """
    resolved = _resolve_one(PURPOSE_ANNOUNCEMENT, env, main, _domain_of(main['from_email']))
    return {
        'host': resolved['host'],
        'port': resolved['port'],
        'user': resolved['user'],
        'password': resolved['password'],
        'use_tls': resolved['use_tls'],
        'from_email': resolved['from_email'],
    }
