# Deployment

## Frontend: Cloudflare Worker

Create a Worker connected to this repository with:

- **Root directory:** `frontend`
- **Build command:** `npm run build`
- **Deploy command:** `npx wrangler deploy`
- **Production branch:** `main`
- **Environment variable:** `NEXT_PUBLIC_API_URL=https://api.example.com`

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

For local development, run `docker compose up -d db`, or use an existing PostgreSQL 15+ installation. Create the database and role to match `backend/.env`, then run `python manage.py migrate` from `backend`.

The frontend and API should use separate subdomains, for example `www.example.com` and `api.example.com`. Keep the API origin HTTPS-only and expose only ports 80/443 through Nginx.
