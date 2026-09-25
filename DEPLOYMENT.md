# Deployment

## Frontend: Cloudflare Worker

Create a Worker connected to this repository with:

- **Root directory:** `frontend`
- **Build command:** `npm run build`
- **Deploy command:** `npx wrangler deploy`
- **Production branch:** `main`
- **Environment variables:** `NEXT_PUBLIC_API_URL=https://api.example.com` and `NEXT_PUBLIC_GOOGLE_CLIENT_ID=<google-oauth-client-id>`

The Google client ID is baked into the static build, so setting it takes a new deploy; leaving it empty simply leaves the password form as the only way in.

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
GOOGLE_OAUTH_CLIENT_ID=<google-oauth-client-id>
```

Both Google variables carry the same client ID: the frontend sends it to Google to request an ID token, and the backend checks that the token it is handed was minted for that client.

`google-auth` joins the backend dependencies for that check (`pip install -r requirements.txt`), and it needs no network access of its own beyond fetching Google's public keys.

After deploying, run migrations — including the new `tenants/0003_googleidentity` — and verify `https://api.example.com/health/` returns `{"status":"ok"}`.

### Google sign-in

1. In the Google Cloud Console, create an **OAuth client ID** of type *Web application*.
2. Add the site origin to **Authorized JavaScript origins** for each environment: `https://www.example.com` and `http://localhost:3000`. Leave **Authorized redirect URIs** empty — Google Identity Services returns the token to the page in the browser, so there is no redirect back to the API.
3. Set `GOOGLE_OAUTH_CLIENT_ID` to that client ID — in the API's `.env` on the VPS, where `deploy.sh` also hands it to the frontend build, so it is the one place to set it there; a Worker build gets `NEXT_PUBLIC_GOOGLE_CLIENT_ID` directly — then redeploy.

Members sign in with Google only if the address Google verifies matches exactly one church account, so accounts are still created by invitation or enrollment, never by signing in. Failed Google attempts are rate limited per address (`GOOGLE_SIGNIN_THROTTLE_RATE`, default `60/hour`) and the attempt is logged by the API with no credential in it.

For local development, run `docker compose up -d db`, or use an existing PostgreSQL 15+ installation. Create the database and role to match `backend/.env`, then run `python manage.py migrate` from `backend`.

The frontend and API should use separate subdomains, for example `www.example.com` and `api.example.com`. Keep the API origin HTTPS-only and expose only ports 80/443 through Nginx.
