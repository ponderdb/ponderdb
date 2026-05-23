# AWS EC2 Deployment Guide — PonderDB

## Instance Recommendation

**`t3.small` (2GB)** — use OpenAI embeddings (`PONDER_EMBEDDER=openai`). If you want local transformer model, go `c7i-flex.large` (4GB). The transformer model uses ~300MB RAM.

## Deployment Files

| File | Purpose |
|------|---------|
| `deploy/setup.sh` | One-command EC2 bootstrap (Node, PG17, pgvector, Nginx, PM2) |
| `deploy/deploy.sh` | Zero-downtime deploy (git pull → build → pm2 reload) |
| `deploy/Dockerfile` | Docker build for containerized deploy |
| `deploy/docker-compose.yml` | App + PostgreSQL with pgvector |
| `deploy/nginx.conf` | Reverse proxy :80 → :7437 + SSL template |
| `deploy/ecosystem.config.cjs` | PM2 config with auto-restart |
| `.github/workflows/deploy-production.yml` | CI/CD auto-deploy |
| `.env.production` | Production env template (gitignored, local only) |

## Auto-Deploy Flow

```
Code merged to `production` branch
  → GitHub Actions triggers
  → Builds + lints in CI
  → SSH to EC2
  → deploy.sh runs (pull → build → pm2 reload)
  → Zero downtime ✅
```

## GitHub Secrets to Set

```
EC2_HOST    → your EC2 public IP
EC2_USER    → ubuntu
EC2_SSH_KEY → SSH private key (from .pem file)
```

## EC2 First-Time Setup

```bash
ssh -i your-key.pem ubuntu@EC2_IP
git clone https://github.com/ponderdb/ponderdb.git /opt/ponderdb
cd /opt/ponderdb
bash deploy/setup.sh production
# Edit .env.production with your OAuth + OpenAI keys
pm2 restart ponderdb
```

---

## Step-by-Step AWS Setup Guide

### Step 1: Launch EC2 Instance

1. Go to **AWS Console → EC2 → Launch Instance**
2. Settings:
   - **Name**: `ponderdb-production`
   - **AMI**: Ubuntu Server 24.04 LTS
   - **Instance type**: `t3.small` (2vCPU, 2GB)
   - **Key pair**: Create new → `ponderdb-key` → Download `.pem` file
   - **Network**:
     - Create security group → Allow:
       - SSH (22) from your IP
       - HTTP (80) from anywhere
       - HTTPS (443) from anywhere
       - Custom TCP (7437) from anywhere
   - **Storage**: 20 GB gp3
3. Click **Launch Instance**
4. Note the **Public IPv4 address** (e.g. `3.xx.xx.xx`)

### Step 2: Connect to EC2

```bash
# Fix key permissions
chmod 400 ~/Downloads/ponderdb-key.pem

# SSH in
ssh -i ~/Downloads/ponderdb-key.pem ubuntu@YOUR_EC2_IP
```

### Step 3: Run Setup Script

```bash
# Clone repo
git clone -b production https://github.com/ponderdb/ponderdb.git /opt/ponderdb
cd /opt/ponderdb

# Run full setup (installs Node, PG17, pgvector, Nginx, PM2)
bash deploy/setup.sh production
```

This takes ~5 minutes. Installs everything automatically.

### Step 4: Configure Environment

```bash
nano /opt/ponderdb/.env.production
```

Update these values:

```env
# Database password (auto-generated during setup, check output)
DATABASE_URL=postgresql://ponderdb:PASSWORD_FROM_SETUP@localhost:5432/ponderdb

# Embeddings — pick one:
PONDER_EMBEDDER=openai
OPENAI_API_KEY=sk-your-actual-key

# OAuth — update callback URLs with your EC2 IP
PONDER_BASE_URL=http://YOUR_EC2_IP
GOOGLE_CALLBACK_URL=http://YOUR_EC2_IP/auth/google/callback
GITHUB_CALLBACK_URL=http://YOUR_EC2_IP/auth/github/callback

# Google OAuth (from console.cloud.google.com)
GOOGLE_CLIENT_ID=your-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-secret

# GitHub OAuth (from github.com/settings/developers)
GITHUB_CLIENT_ID=your-id
GITHUB_CLIENT_SECRET=your-secret
```

**Important**: Also update Google Cloud Console and GitHub OAuth App with the new callback URLs using your EC2 IP.

### Step 5: Restart Server

```bash
cd /opt/ponderdb
pm2 restart ponderdb
```

### Step 6: Verify

```bash
# Check status
pm2 status

# Check logs
pm2 logs ponderdb --lines 20

# Test health
curl http://localhost:7437/health

# Test from browser
# Open http://YOUR_EC2_IP in browser
```

### Step 7: Setup GitHub Actions Auto-Deploy

1. Go to **GitHub repo → Settings → Secrets and variables → Actions**
2. Add these secrets:

| Secret | Value |
|--------|-------|
| `EC2_HOST` | Your EC2 public IP (e.g. `3.xx.xx.xx`) |
| `EC2_USER` | `ubuntu` |
| `EC2_SSH_KEY` | Contents of `ponderdb-key.pem` file |

To get the SSH key content:

```bash
cat ~/Downloads/ponderdb-key.pem
# Copy entire output including BEGIN/END lines
```

3. Create `production` branch on GitHub:

```bash
# On your local machine
git checkout main
git checkout -b production
git push -u origin production
```

Now every merge to `production` auto-deploys to EC2.

### Step 8: (Optional) Add Domain + SSL

```bash
# SSH to EC2
ssh -i ponderdb-key.pem ubuntu@YOUR_EC2_IP

# Install SSL (replace with your domain)
sudo certbot --nginx -d ponderdb.dev

# Update .env.production
nano /opt/ponderdb/.env.production
# Change all http:// to https:// and YOUR_EC2_IP to ponderdb.dev

# Restart
pm2 restart ponderdb
```

### Step 9: (Optional) Set Elastic IP

EC2 IP changes on restart. To fix:

1. **EC2 Console → Elastic IPs → Allocate**
2. **Associate** with your instance
3. Update `.env.production`, OAuth callbacks, and GitHub secrets with new IP

---

## Quick Reference Commands (on EC2)

```bash
pm2 status                    # Check server status
pm2 logs ponderdb             # View logs
pm2 restart ponderdb          # Restart server
pm2 stop ponderdb             # Stop server

cd /opt/ponderdb
bash deploy/deploy.sh         # Manual deploy
npm run db:reset              # Reset database
npm run db:seed               # Seed defaults

sudo systemctl status nginx   # Check Nginx
sudo nginx -t                 # Test Nginx config
sudo systemctl reload nginx   # Reload Nginx

sudo -u postgres psql ponderdb  # Connect to PostgreSQL
```

## Cost Summary

| Service | Monthly |
|---------|---------|
| EC2 t3.small | ~$15 (or free tier eligible) |
| Storage 20GB gp3 | ~$1.60 |
| Elastic IP (when attached) | Free |
| **Total** | **~$17/mo** |
