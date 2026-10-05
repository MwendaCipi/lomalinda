"""Reading a church's schema where the HTTP middleware cannot.

An HTTP request gets its schema from ``django_tenants``' middleware. A socket
has no such chain, so the chat consumer sets the tenant from the one thing a
WebSocket handshake still carries: the ``Host`` header. Every database call the
consumer makes then runs inside that tenant's schema.

The test suite runs without ``django_tenants`` at all — ``config.settings``
strips it when ``test`` is in the command line — so every helper here degrades
to a no-op and the consumer stays testable on plain sqlite.
"""

from contextlib import contextmanager

from django.conf import settings


def tenants_enabled():
    """Is this build running schema-per-church? (Never, in the test suite.)"""
    return 'django_tenants' in settings.INSTALLED_APPS


def host_from_scope(scope):
    """The hostname a connection arrived on, with any port stripped."""
    for name, value in scope.get('headers', []):
        if name == b'host':
            return value.decode('latin-1').split(':')[0]
    return ''


def tenant_for_host(host):
    """The church whose domain is this host; the public tenant otherwise.

    A domain the church has not registered falls back to the public schema
    rather than failing the handshake: the consumer's own access check is what
    keeps a stranger out of a room, and refusing here would only turn a
    mis-typed host into a silent socket.
    """
    if not tenants_enabled() or not host:
        return None
    from django_tenants.utils import get_public_schema_name, get_tenant_domain_model, get_tenant_model

    Domain = get_tenant_domain_model()
    domain = Domain.objects.select_related('tenant').filter(domain__iexact=host).first()
    if domain is not None:
        return domain.tenant
    return get_tenant_model().objects.filter(schema_name=get_public_schema_name()).first()


@contextmanager
def tenant_scope(tenant):
    """Run a block with ``tenant``'s schema selected, or plain where absent."""
    if tenant is None or not tenants_enabled():
        yield
        return
    from django_tenants.utils import tenant_context

    with tenant_context(tenant):
        yield
