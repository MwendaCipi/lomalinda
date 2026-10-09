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

## M-Pesa: reading every paybill transaction

The C2B confirmation callbacks only arrive for a payment the site initiated, and only while Safaricom's always-on delivery is on. The **Pull Transactions API** is the other direction: the church asks the shortcode what it received, and every receipt the ledger has never seen — a member who walked up to the paybill and typed the reference by hand, included — is recorded once, through the same recorder the callback uses. Re-pulling a window records nothing twice, so it is safe to press whenever.

Two variables, in `backend/.env` next to the other `MPESA_*` ones:

```text
MPESA_PULL_NOMINATED_NUMBER=07XXXXXXXX       # the Safaricom MSISDN on the church's organisation account
MPESA_PULL_CALLBACK_URL=https://sdalomalinda.or.ke/api/members/payments/mpesa/pull/
```

Then register the shortcode **once per environment** — the query endpoint answers only a shortcode that has been registered first:

```bash
cd backend
venv/bin/python manage.py register_mpesa_pull_url
```

The register call is idempotent (every run after the first answers "Shortcode already Registered"), so re-running it is harmless. Until it has been run, both the reconciliation page's Pull button and the command below are answered with `No records found or Organization Name not available` — Safaricom's sentence for a shortcode nobody enabled Pull for, which the app now reports verbatim with the fix named.

Verify from the server itself, then pull from the reconciliation page or the command line:

```bash
cd backend
venv/bin/python manage.py pull_mpesa_transactions --days 2 --dry-run   # list what would be recorded
venv/bin/python manage.py pull_mpesa_transactions --days 2             # record it
```

The API keeps only 48 hours of transactions and refuses a window longer than that, so the page asks for the last two days and the command warns rather than inventing rows. Payments whose typed reference matched no treasury account land in the Unassigned tab for the treasurer to assign — the money is already in the ledger either way.

## Chat: the live transport

Chat's messages have two doors. The REST endpoints under `/api/members/chat/` write and read them, and a WebSocket on `/ws/chat/<conversation_id>/` carries them the moment they are written. Both doors end in the same service layer, and a REST write broadcasts to every open socket, so nothing is only live if it was sent over the socket.

Three pieces have to be in place on the VPS. Without them the app still works — the frontend falls back to polling and the channel layer falls back to memory — but replies then arrive on the poll's delay instead of at once, and a restart loses any in-flight broadcast.

### 1. Redis: the bus between processes

Gunicorn serves HTTP from several worker processes, and the socket server is a separate process again. A message written in one of them has to reach a socket held by another, which is what Redis is for.

```bash
apt-get install -y redis-server
sed -i 's/^bind .*/bind 127.0.0.1 ::1/' /etc/redis/redis.conf
sed -i 's/^# *maxmemory .*/maxmemory 256mb\nmaxmemory-policy allkeys-lru/' /etc/redis/redis.conf
systemctl enable --now redis-server
redis-cli ping   # PONG
```

Bind it to loopback and give it an eviction policy: the channel layer's keys are short-lived and disposable, so Redis must never let them push the box out of memory. Then point the backend at it in `backend/.env`:

```text
CHAT_REDIS_URL=redis://127.0.0.1:6379/1
```

`REDIS_URL` is read as a fallback, and with neither set the channel layer is the in-process one (fine for development, and for tests).

### 2. daphne: the socket server

Gunicorn speaks WSGI and cannot hold a WebSocket open, so the same code runs a second time under daphne:

```ini
# /etc/systemd/system/loma_linda_ws.service
[Unit]
Description=Loma Linda chat socket server (daphne)
After=network.target redis-server.service
Wants=redis-server.service

[Service]
User=www-data
WorkingDirectory=/var/www/loma_linda/backend
EnvironmentFile=/var/www/loma_linda/backend/.env
ExecStart=/var/www/loma_linda/backend/venv/bin/daphne -b 127.0.0.1 -p 8007 config.asgi:application
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now loma_linda_ws
```

daphne is bound to loopback: only Nginx talks to it. `deploy.sh` restarts this unit on every deploy when it exists, and skips it (with a note) when it does not.

### 3. Nginx: hand `/ws/` to daphne

Inside the site's `server` block, beside the `/api/` proxy, on the **same hostname** the app is built against — the socket URL is derived from `NEXT_PUBLIC_API_URL`, so a socket on a different host would be sent to the wrong place:

```nginx
location /ws/ {
    proxy_pass http://127.0.0.1:8006;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 3600s;
}
```

`Host` is not decoration: the consumer reads it to pick the church's schema, exactly as `django_tenants`' HTTP middleware does. `proxy_read_timeout` is long because an idle room's socket is idle — Cloudflare passes WebSockets through on a proxied hostname, so no Cloudflare-side work is needed.

Then `nginx -t && systemctl reload nginx`.

### Verifying it

```bash
systemctl is-active loma_linda loma_linda_ws redis-server
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8006/health/   # 200, daphne answers HTTP too
```

A socket handshake with a bad token must be refused, and with a live one must open. From the browser console on the signed-in app:

```javascript
const t = new WebSocket(`wss://sdalomalinda.or.ke/ws/chat/1/?token=${localStorage.access_token}`);
t.onmessage = (e) => console.log(e.data);   // {"type":"ready",...} on connect
```

`ready` means the token and the tenant both resolved. A close with code `4401` is a token to refresh; `4403` is an account that may not read that room.
