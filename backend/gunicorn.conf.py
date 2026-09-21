"""Gunicorn configuration for the church backend.

Access lines land in `docker logs` (or the platform's log drain) and would
otherwise carry the full request URL — including `?token=…` on invitation
verify links. Gunicorn has no per-access-log formatter setting; it formats
lines from request "atoms", so the scrubbing happens in the logger class
below: every atom is redacted before the line is written, matching what the
Django LOGGING formatters (config/settings.py) do for application logs.
"""

import re

from gunicorn.glogging import Logger


def redact_secret_query_values(message):
    """Mask the values of secret-bearing query parameters, keeping the names."""
    return re.sub(
        r"(?i)((?:[?&])(?:token|access_token|refresh_token)=)[^&\s'\"]+",
        r"\1[REDACTED]",
        message,
    )


class SecretScrubbingLogger(Logger):
    """An access logger that keeps bearer secrets out of the written line.

    The default access format includes the raw request line (%r) and query
    string (%q), and custom formats can pull in the Referer header or environ
    variables — all of which can carry a token. Redacting every string atom
    covers whichever format is configured.
    """

    def atoms(self, resp, req, environ, request_time):
        atoms = super().atoms(resp, req, environ, request_time)
        return {
            key: redact_secret_query_values(value) if isinstance(value, str) else value
            for key, value in atoms.items()
        }


logger_class = SecretScrubbingLogger
