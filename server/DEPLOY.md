# Deploy — Body & Soul API on Ubuntu 24.04 (api.velvue.in)

Target: your VPS `45.196.196.235`. Run these as a sudo user (not root login).

## 0. Security first (do this before anything)
```bash
# rotate the root password that was shared, then create a sudo user:
adduser deploy && usermod -aG sudo deploy
# set up SSH keys for `deploy`, then disable root + password SSH login in
# /etc/ssh/sshd_config (PermitRootLogin no, PasswordAuthentication no) and: systemctl restart ssh
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable
```

## 1. DNS (in Hostinger)
Add an **A record**: `api` → `45.196.196.235`. Verify: `dig +short api.velvue.in` returns the IP.

## 2. Install Node, Postgres, Nginx
```bash
sudo apt update && sudo apt install -y nginx postgresql
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm i -g pm2
```

## 3. Database
```bash
sudo -u postgres psql -c "CREATE USER bodysoul WITH PASSWORD 'STRONG_DB_PASSWORD';"
sudo -u postgres psql -c "CREATE DATABASE bodysoul OWNER bodysoul;"
```

## 4. App code + secrets
```bash
sudo mkdir -p /opt/body-soul-api && sudo chown $USER /opt/body-soul-api
# copy this server/ folder to /opt/body-soul-api (scp or git), then:
cd /opt/body-soul-api
npm install --omit=dev
cp .env.example .env
nano .env     # set DATABASE_URL (with STRONG_DB_PASSWORD), GOOGLE_APPLICATION_CREDENTIALS path
```
Download the **Firebase service-account key**: Firebase Console → Project settings →
Service accounts → *Generate new private key* → save it to
`/opt/body-soul-api/firebase-service-account.json` (matches the .env path).

```bash
npm run initdb      # creates the tables
pm2 start src/index.js --name body-soul-api && pm2 save && pm2 startup
```

## 5. Nginx reverse proxy + HTTPS
```bash
sudo tee /etc/nginx/sites-available/api.velvue.in >/dev/null <<'NGINX'
server {
  server_name api.velvue.in;
  location / { proxy_pass http://127.0.0.1:8080; proxy_set_header Host $host; proxy_set_header Authorization $http_authorization; }
}
NGINX
sudo ln -s /etc/nginx/sites-available/api.velvue.in /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.velvue.in     # issues + auto-renews the HTTPS cert
```

## 6. Verify
```bash
curl https://api.velvue.in/health        # -> {"ok":true,...}
```
Then set `"API_BASE_URL": "https://api.velvue.in"` in the app's `app.json → expo.extra`
and rebuild — the app will start sending consented data here.

## Endpoints (all under /v1, require `Authorization: Bearer <Firebase ID token>`)
- `POST /v1/profile`  · `POST /v1/consent` · `POST /v1/events`
- `POST /v1/health`   · `POST /v1/japa`
- `GET  /v1/me` (export) · `DELETE /v1/me` (erase) — DPDP rights
