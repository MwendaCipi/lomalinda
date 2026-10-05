# Deployment

## Frontend: Cloudflare Worker

Create a Worker connected to this repository with:

- **Root directory:** `frontend`
- **Build command:** `npm run build`
- **Deploy command:** `npx wrangler deploy`
- **Production branch:** `main`
- **Environment variables:** `NEXT_PUBLIC_API_URL=https://api.example.com`

The repository includes `frontend/wrangler.jsonc`, which tells Wrangler to publish the generated `out` directory as Worker static assets. The frontend is configured with `output: "export"`, so it does not require a Node.js server.

## Backend: VPS

Run Django behind Nginx with HTTPS and Gunicorn. The included `backend/Dockerfile` is suitable for a container-based deployment. Set these production variables on the VPS:

```text
DJANGO_SECRET_KEY=<long-random-secret>
DJANGO_DEBUG=false
DJANGO_ALLOWED_HOSTS=api.example.com
DATABASE_URL=postgresql://loma_linda_app:<strong-password>@127.0.0.1:5432/loma_linda
DATABASE_SSL_REQUIRE=true
FRONTEND_URL=https://www.example.com
CSRF_TRUSTED_ORIGINS=https://www.example.com
```

After deploying, run migrations and verify `https://api.example.com/health/` returns `{"status":"ok"}`.

Accounts are created by invitation or enrollment and verified by email; sign-in is always a username and password.

For local development, run `docker compose up -d db`, or use an existing PostgreSQL 15+ installation. Create the database and role to match `backend/.env`, then run `python manage.py migrate` from `backend`.

The frontend and API should use separate subdomains, for example `www.example.com` and `api.example.com`. Keep the API origin HTTPS-only and expose only ports 80/443 through Nginx.

## Uploads: the API's request-size ceiling

Nginx's default request body limit is **1 MB**. Any larger upload is refused with `413 Request Entity Too Large` — and because Nginx drops the connection while the browser is still sending, the browser reports the opaque `Failed to fetch` instead of the 413. Photo albums (Moments) and every attachment door hit this, since a phone photo alone is several MB.

Raise it in the API's Nginx server block (it applies to the whole server, including the `/api/` proxy):

```nginx
client_max_body_size 50m;
```

then `nginx -t && systemctl reload nginx`. Verify the ceiling rather than assume it:

```bash
head -c 3000000 /dev/urandom > /tmp/probe.bin
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  -F 'media_files=@/tmp/probe.bin;filename=probe.jpg' \
  https://api.example.com/api/members/church-events/
```

A `401` means the body reached Django (correct — the endpoint needs a bearer token); a `413` means the ceiling is still too low.

## Email: the announcement broadcast

Transactional mail (receipts, invitations, pledge reminders) sends through the main mailbox set by `EMAIL_HOST`/`EMAIL_HOST_USER`/`EMAIL_HOST_PASSWORD`. The congregation-wide **announcement broadcast** should not: a shared mailbox is policed by a sending-velocity rule — Zoho Mail blocks it mid-broadcast with `SMTP 550 5.4.6` — while a transactional relay is built for that volume.

[ZeptoMail](https://www.zoho.com/zeptomail/) is Zoho's transactional relay and drops in over SMTP. To route the broadcast through it, set one variable on the server:

```text
ZEPTOMAIL_SEND_TOKEN=<the Send Mail Token from the ZeptoMail agent>
```

Optionally name the sender (otherwise the main `DEFAULT_FROM_EMAIL` is used — its address must be a verified sender in ZeptoMail):

```text
ZEPTOMAIL_FROM_EMAIL=SDA Loma Linda Meru <noreply@sdalomalinda.or.ke>
```

With the token set, the broadcast rides `smtp.zeptomail.com:587` (STARTTLS) as `emailapikey`, while receipts and invitations keep the main mailbox. An explicit `ANNOUNCEMENT_EMAIL_*` override still wins, and with neither set the broadcast falls back to the main mailbox unchanged. The relay choice lives in `backend/config/mail_settings.py`, and `backend/config/settings.py` resolves it once at import.

Verify the transport before a broadcast:

```bash
cd backend
venv/bin/python manage.py send_test_email --to you@example.com              # main mailbox
venv/bin/python manage.py send_test_email --to you@example.com --announcement  # the broadcast's relay
```

The command prints which host answered, so a mistyped token or an unverified sender is found here rather than mid-broadcast. The broadcast also pauses between messages and aborts after repeated refusals (`ANNOUNCEMENT_SEND_DELAY`, `ANNOUNCEMENT_MAX_CONSECUTIVE_FAILURES`), and a failed recipient is logged with the server's own answer.
