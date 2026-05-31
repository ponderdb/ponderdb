#!/bin/bash
set -euo pipefail

# ─────────────────────────────────────────────
# PonderDB EC2 Setup Script
# Ubuntu 24.04 | Node.js 22 | PostgreSQL 17 | pgvector | Nginx | PM2
# ─────────────────────────────────────────────

APP_DIR="/opt/ponderdb"
REPO_URL="https://github.com/ponderdb/ponderdb.git"
BRANCH="${1:-production}"
DB_PASSWORD="${DB_PASSWORD:-ponderdb_$(openssl rand -hex 8)}"

echo "══════════════════════════════════════════════"
echo "  PonderDB EC2 Setup"
echo "  Branch: $BRANCH"
echo "══════════════════════════════════════════════"

# ── 1. System packages ──
echo "→ Updating system packages..."
sudo apt-get update -y
sudo apt-get install -y curl git build-essential nginx certbot python3-certbot-nginx

# ── 2. Node.js 22 ──
echo "→ Installing Node.js 22..."
if ! command -v node &>/dev/null || [[ $(node -v | cut -d. -f1 | tr -d v) -lt 22 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "  Node.js $(node -v)"

# ── 3. PostgreSQL 17 + pgvector ──
echo "→ Installing PostgreSQL 17..."
if ! command -v psql &>/dev/null; then
  sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg
  sudo apt-get update -y
  sudo apt-get install -y postgresql-17 postgresql-17-pgvector
fi
echo "  PostgreSQL $(psql --version | head -1)"

# ── 4. Create PostgreSQL database + user ──
echo "→ Setting up PostgreSQL database..."
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname = 'ponderdb'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER ponderdb WITH PASSWORD '$DB_PASSWORD';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = 'ponderdb'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE ponderdb OWNER ponderdb;"
sudo -u postgres psql -d ponderdb -c "CREATE EXTENSION IF NOT EXISTS vector;"
sudo -u postgres psql -c "ALTER USER ponderdb WITH SUPERUSER;" # needed for pgvector
echo "  Database: ponderdb (user: ponderdb)"

# ── 5. PM2 ──
echo "→ Installing PM2..."
sudo npm install -g pm2
pm2 startup systemd -u ubuntu --hp /home/ubuntu 2>/dev/null || true

# ── 6. Clone / pull repo ──
echo "→ Setting up application..."
if [ -d "$APP_DIR" ]; then
  cd "$APP_DIR"
  git fetch origin
  git checkout "$BRANCH"
  git pull origin "$BRANCH"
else
  sudo mkdir -p "$APP_DIR"
  sudo chown ubuntu:ubuntu "$APP_DIR"
  git clone -b "$BRANCH" "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

# ── 7. Install dependencies + build ──
echo "→ Installing dependencies..."
npm ci
echo "→ Building..."
npm run build

# ── 8. Create data directory ──
sudo mkdir -p /var/lib/ponderdb /var/log/ponderdb
sudo chown ubuntu:ubuntu /var/lib/ponderdb /var/log/ponderdb

# ── 9. Create production env if not exists ──
if [ ! -f "$APP_DIR/.env.production" ]; then
  echo "→ Creating .env.production..."
  cat > "$APP_DIR/.env.production" <<ENVEOF
NODE_ENV=production
PONDER_PORT=7437
PONDER_HOST=0.0.0.0
PONDER_DATA_DIR=/var/lib/ponderdb
PONDER_API_KEY_REQUIRED=true
DATABASE_URL=postgresql://ponderdb:${DB_PASSWORD}@localhost:5432/ponderdb
PONDER_EMBEDDER=transformer
PONDER_EMBEDDING_MODEL=text-embedding-3-small
PONDER_EMBEDDING_DIMS=1536
PONDER_JWT_SECRET=$(openssl rand -base64 48)
PONDER_BASE_URL=http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "localhost"):7437
GOOGLE_CALLBACK_URL=http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "localhost"):7437/auth/google/callback
GITHUB_CALLBACK_URL=http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "localhost"):7437/auth/github/callback
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=
# GITHUB_CLIENT_ID=
# GITHUB_CLIENT_SECRET=
# OPENAI_API_KEY=
ENVEOF
  echo "  Created .env.production — edit to add OAuth + OpenAI keys"
fi

# ── 10. Initialize database ──
echo "→ Initializing database..."
cd "$APP_DIR"
node --env-file=.env.production packages/server/dist/bin.js db:seed 2>/dev/null || true

# ── 11. Nginx config ──
echo "→ Configuring Nginx..."
sudo cp "$APP_DIR/deploy/nginx.conf" /etc/nginx/sites-available/ponderdb
sudo ln -sf /etc/nginx/sites-available/ponderdb /etc/nginx/sites-enabled/ponderdb
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# ── 12. Start / restart with PM2 ──
echo "→ Starting PonderDB..."
cd "$APP_DIR"
pm2 delete ponderdb 2>/dev/null || true
pm2 start deploy/ecosystem.config.cjs
pm2 save

echo ""
echo "══════════════════════════════════════════════"
echo "  PonderDB deployed!"
echo ""
echo "  URL:      http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "localhost"):80"
echo "  Direct:   http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "localhost"):7437"
echo "  Status:   pm2 status"
echo "  Logs:     pm2 logs ponderdb"
echo "  Restart:  pm2 restart ponderdb"
echo ""
echo "  Next steps:"
echo "  1. Edit .env.production — add GOOGLE/GITHUB OAuth + OPENAI keys"
echo "  2. pm2 restart ponderdb"
echo "  3. (Optional) Add domain + SSL: sudo certbot --nginx"
echo "══════════════════════════════════════════════"
