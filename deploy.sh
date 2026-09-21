#!/usr/bin/env bash
set -e

echo "=========================================="
echo "🚀 Loma Linda SDA Church Deployment Automation"
echo "=========================================="

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
