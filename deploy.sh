#!/usr/bin/env bash
set -euo pipefail

echo "=========================================="
echo "🚀 Loma Linda SDA Church Deployment Automation"
echo "=========================================="

SERVER_HOST="${SERVER_HOST:-167.233.82.115}"
SERVER_PORT="${SERVER_PORT:-9022}"
SERVER_USER="${SERVER_USER:-root}"
SITE_URL="${SITE_URL:-https://sdalomalinda.or.ke}"

# 1. Refuse to deploy from a dirty tree.
# Auto-committing here used to be convenient, but `git add .` swept stray
# untracked files (and half-finished work) into deploy commits. Deploys now
# require the changes to be committed deliberately first.
if [[ -n $(git status --porcelain) ]]; then
  echo "❌ Working tree is not clean - nothing was deployed."
  echo "   Commit or stash these changes first, then re-run."
  git status --short
  exit 1
fi
echo "✨ Workspace clean."

# 2. Push to GitHub repository
echo "⬆️ Pushing latest code to GitHub (main branch)..."
git push origin main

EXPECTED_COMMIT="$(git rev-parse HEAD)"
echo "📌 Expecting ${EXPECTED_COMMIT:0:7} to land on the server."

# 3. SSH deployment on Hetzner server, with verification built in.
#    The remote script is given the commit we just pushed so it can prove the
#    pull landed, and it fails loudly rather than reporting success blind.
echo "🌐 Connecting to Hetzner Server (${SERVER_USER}@${SERVER_HOST}:${SERVER_PORT})..."
ssh -p "$SERVER_PORT" "${SERVER_USER}@${SERVER_HOST}" bash -s -- "$EXPECTED_COMMIT" << 'EOF'
set -euo pipefail

EXPECTED="$1"
PROJECT_DIR="/var/www/loma_linda"
SERVICE="loma_linda"
SITE_URL="https://sdalomalinda.or.ke"
API_HEALTH="http://127.0.0.1:8005/health/"

fail() { trap - ERR; echo "❌ $*" >&2; exit 1; }
trap 'echo "❌ Remote command failed - deployment did not finish." >&2' ERR

cd "$PROJECT_DIR"

echo "⬇️ Pulling latest code..."
git pull origin main

# New imports arrive with the code (google-auth, for Google sign-in), and a
# missing one stops gunicorn from booting at all - so dependencies are installed
# before anything is restarted. Idempotent: an unchanged requirements.txt is a
# no-op.
echo "📦 Installing backend dependencies..."
backend/venv/bin/pip install -q -r backend/requirements.txt

echo "🐍 Executing database schema migrations..."
backend/venv/bin/python backend/manage.py migrate_schemas

echo "🏗️ Building Next.js production web app..."
# NEXT_PUBLIC_* values are baked into the bundle at build time. The Google client
# ID lives in the backend .env - the single place it is configured on this box -
# and is handed to the build here; when it is not set, Google sign-in is simply
# left off the login page.
NEXT_PUBLIC_GOOGLE_CLIENT_ID="$(grep -E '^GOOGLE_OAUTH_CLIENT_ID=' backend/.env | tail -1 | cut -d= -f2- || true)"
export NEXT_PUBLIC_GOOGLE_CLIENT_ID
(cd frontend && npm run build)

echo "🔄 Restarting ${SERVICE} systemd service..."
systemctl restart "$SERVICE"

echo
echo "🔎 Verifying the deployment..."

# a) The commit we were told to deploy is the one now on disk.
DEPLOYED="$(git rev-parse HEAD)"
[ "$DEPLOYED" = "$EXPECTED" ] \
  || fail "server is at ${DEPLOYED:0:7} but ${EXPECTED:0:7} was pushed - the pull did not land."

# b) No migration was left unapplied.
backend/venv/bin/python backend/manage.py migrate_schemas --check > /dev/null 2>&1 \
  || fail "unapplied migrations remain after migrate_schemas."

# c) The service came back up after the restart.
for _ in $(seq 1 15); do
  if systemctl is-active --quiet "$SERVICE"; then break; fi
  sleep 1
done
systemctl is-active --quiet "$SERVICE" || {
  journalctl -u "$SERVICE" -n 15 --no-pager
  fail "$SERVICE is not running after the restart (last log lines above)."
}

# d) The API answers on the box.
for _ in $(seq 1 15); do
  if curl -fsS --max-time 5 "$API_HEALTH" > /dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS --max-time 5 "$API_HEALTH" > /dev/null \
  || fail "API health check failed at $API_HEALTH."

# e) The public site serves the assets we just built, not a stale bundle.
BUILT_REFS="$(mktemp)"
LIVE_REFS="$(mktemp)"
grep -oE '_next/static/[^"]+' frontend/out/index.html | sort -u > "$BUILT_REFS" || true
[ -s "$BUILT_REFS" ] || fail "frontend/out/index.html references no assets - did the build emit anything?"

SERVED=0
for _ in $(seq 1 10); do
  if curl -fsS --max-time 15 "$SITE_URL/" 2> /dev/null \
      | grep -oE '_next/static/[^"]+' | sort -u > "$LIVE_REFS"; then
    if diff -q "$BUILT_REFS" "$LIVE_REFS" > /dev/null 2>&1; then
      SERVED=1
      break
    fi
  fi
  sleep 3
done

if [ "$SERVED" != 1 ]; then
  echo "   freshly built assets:"; sed 's/^/     /' "$BUILT_REFS"
  echo "   assets the live site requests:"; sed 's/^/     /' "$LIVE_REFS"
  rm -f "$BUILT_REFS" "$LIVE_REFS"
  fail "$SITE_URL is not serving the freshly built assets (stale build, failed build, or cache)."
fi
rm -f "$BUILT_REFS" "$LIVE_REFS"

echo "✅ Verified on the server: ${SERVICE} healthy, API responding, ${SITE_URL} serving build ${EXPECTED:0:7}."
EOF

# 4. Confirm from the operator's machine too - the remote checks all run on the
#    box itself, so this catches a site that is only reachable from inside.
echo
echo "🌍 Checking ${SITE_URL} from this machine..."
curl -fsS --max-time 20 -o /dev/null "$SITE_URL/" \
  || { echo "❌ ${SITE_URL} did not respond from this machine."; exit 1; }
echo "✅ ${SITE_URL} responded."

echo "=========================================="
echo "🎉 Deployment Finished Successfully!"
echo "=========================================="
