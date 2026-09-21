#!/usr/bin/env bash
set -e

# Loma Linda Deployment Script
# Usage: ./.deploy.sh [server_alias]

SERVER_HOST="${1:-hetzner}"
PROJECT_DIR="/var/www/loma_linda"

# Check if script is executed directly on the remote server
if [ -d "$PROJECT_DIR" ] && [ -f "$PROJECT_DIR/frontend/package.json" ] && [ "$PWD" = "$PROJECT_DIR" ]; then
  echo "📥 Pulling latest changes from origin main..."
  git pull origin main

  echo "⚙️ Installing backend dependencies & running migrations..."
  if [ -d "backend/venv" ]; then
    backend/venv/bin/pip install -r backend/requirements.txt
    backend/venv/bin/python backend/manage.py migrate
    backend/venv/bin/python backend/manage.py seed_demo_data
  else
    python3 -m pip install -r backend/requirements.txt
    python3 backend/manage.py migrate
    python3 backend/manage.py seed_demo_data
  fi

  echo "🏗️ Building frontend..."
  cd frontend
  npm install
  npm run build
  cd ..

  echo "🔄 Restarting loma_linda systemd service..."
  sudo systemctl restart loma_linda

  echo "✅ Deployment completed successfully!"
else
  # Executed locally: connect via SSH to deploy
  echo "🚀 Triggering deployment on ${SERVER_HOST}..."
  ssh "${SERVER_HOST}" "cd ${PROJECT_DIR} && git pull origin main && ( [ -d backend/venv ] && backend/venv/bin/pip install -r backend/requirements.txt && backend/venv/bin/python backend/manage.py migrate && backend/venv/bin/python backend/manage.py seed_demo_data || ( python3 -m pip install -r backend/requirements.txt && python3 backend/manage.py migrate && python3 backend/manage.py seed_demo_data ) ) && cd frontend && npm install && npm run build && sudo systemctl restart loma_linda"
  echo "✅ Deployment completed successfully on ${SERVER_HOST}!"
fi
