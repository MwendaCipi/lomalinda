#!/usr/bin/env bash
set -e

echo "=========================================="
echo "🚀 Loma Linda SDA Church Deployment Automation"
echo "=========================================="

COMMIT_MSG="${1:-"deploy: automated deployment update"}"

# 1. Handle uncommitted local changes
if [[ -n $(git status -s) ]]; then
  echo "📦 Staging and committing local changes..."
  git add .
  git commit -m "$COMMIT_MSG"
else
  echo "✨ Workspace clean - no new local uncommitted changes."
fi

# 2. Push to GitHub repository
echo "⬆️ Pushing latest code to GitHub (main branch)..."
git push origin main

# 3. SSH deployment on Hetzner server
SERVER_HOST="${SERVER_HOST:-167.233.82.115}"
SERVER_PORT="${SERVER_PORT:-9022}"
SERVER_USER="${SERVER_USER:-root}"

echo "🌐 Connecting to Hetzner Server (${SERVER_USER}@${SERVER_HOST}:${SERVER_PORT})..."
ssh -p "$SERVER_PORT" "${SERVER_USER}@${SERVER_HOST}" bash -s << 'EOF'
set -e

echo "📂 Navigating to /var/www/loma_linda..."
cd /var/www/loma_linda

echo "⬇️ Pulling latest code..."
git pull origin main

echo "🐍 Executing database schema migrations..."
backend/venv/bin/python backend/manage.py migrate_schemas

echo "🏗️ Building Next.js production web app..."
cd frontend
npm run build

echo "🔄 Restarting loma_linda systemd service..."
systemctl restart loma_linda

echo "✨ Remote deployment completed successfully!"
EOF

echo "=========================================="
echo "🎉 Deployment Finished Successfully!"
echo "=========================================="
