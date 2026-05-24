# Saadhana OTP Server (Self-Hosted, Free)

A small Node.js server that sends OTP codes via your own Gmail account.
Runs on your Windows PC (or any machine with Node.js 18+).

**100% free** — no SaaS, no credit card. Optional Cloudflare Tunnel gives you
a public HTTPS URL so Play Store / App Store users can reach this server.

---

## Quick Start (≈5 minutes)

### 1. Install dependencies

```bash
cd backend/local
npm install
```

### 2. Get a Gmail App Password (one-time, 2 minutes)

A Google App Password is a 16-character password that lets apps sign in to your Gmail SMTP **without exposing your real password**.

1. Go to https://myaccount.google.com/security
2. Enable **2-Step Verification** (required) if not already on
3. Go to https://myaccount.google.com/apppasswords
4. Pick:
   - App: **Mail**
   - Device: **Other (Custom name)** → type `Saadhana OTP`
5. Click **Generate** → you get a 16-char password like `abcd efgh ijkl mnop`
6. **Copy it now** (Google won't show it again)

### 3. Create `.env`

```bash
cp .env.example .env
```

Open `.env` and fill in:
```env
GMAIL_USER=your.real.gmail@gmail.com
GMAIL_APP_PASSWORD=abcd efgh ijkl mnop      # the 16-char app password
GMAIL_FROM_NAME=Saadhana
PORT=3001
ALLOWED_ORIGIN=*
```

### 4. Start the server

```bash
npm start
```

You should see:
```
🪷 Saadhana OTP server listening on http://localhost:3001
   email: ✓ Gmail SMTP ready
   sms:   ✗ not configured (set TEXTBELT_KEY)
```

### 5. Test it

```bash
curl -X POST http://localhost:3001/api/otp/send ^
  -H "Content-Type: application/json" ^
  -d "{\"contact\":\"you@gmail.com\",\"type\":\"email\"}"
```

Check your inbox — you should receive a Saadhana-branded OTP email within 5 seconds.

### 6. Point the app at this server

For **web testing** (app already running at http://localhost:8086):

Open `sadhana-rn/app.json` and add:
```json
{
  "expo": {
    "extra": {
      "OTP_BACKEND_URL": "http://localhost:3001"
    }
  }
}
```

Restart `npx expo start`. The Onboarding screen will now actually email the OTP — the "Demo OTP" banner disappears.

---

## Going to Play Store / App Store

When real users install your app, their phones can't reach `localhost:3001` — they need a **public URL**. Pick one:

### Option A — Cloudflare Tunnel (recommended, free, no port forwarding)

Cloudflare Tunnel gives your local server a public HTTPS URL like
`https://saadhana-otp.trycloudflare.com` — no IP, no firewall, no router config.

1. Install:
   ```bash
   winget install --id Cloudflare.cloudflared
   ```
   (or download from https://github.com/cloudflare/cloudflared/releases)

2. Run the tunnel pointing at your local server:
   ```bash
   cloudflared tunnel --url http://localhost:3001
   ```

3. Copy the printed URL (e.g. `https://random-words-1234.trycloudflare.com`).

4. Put that URL into `sadhana-rn/app.json`:
   ```json
   {
     "expo": {
       "extra": {
         "OTP_BACKEND_URL": "https://random-words-1234.trycloudflare.com"
       }
     }
   }
   ```

5. Rebuild your APK / IPA — App Store users will hit your home server via Cloudflare's edge.

**Caveat:** The URL changes every restart unless you upgrade to a *named* Cloudflare Tunnel (still free, requires a domain). Named tunnels: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/create-remote-tunnel/

### Option B — Free hosting (Railway, Render, Fly.io)

If you don't want to keep your PC online 24/7, redeploy this server to a free host. The `server.js` is plain Node.js so it runs anywhere.

### Option C — Static IP + your router

If you have a static IP and can port-forward 3001 (or 443 with a reverse proxy), you can run this server directly on your home IP. **Not recommended** — security overhead.

---

## Adding SMS (Optional)

Free SMS at production scale doesn't exist. Options for later:

| Provider | Cost | Best For |
|---|---|---|
| **TextBelt** | 1/day free, then $0.06/SMS | Testing only |
| **Twilio** | ~$0.008/SMS US, varies | Global |
| **MSG91** | ~₹0.20/SMS India | India-heavy |

For TextBelt (free testing only), edit `.env`:
```env
TEXTBELT_KEY=textbelt
```

Restart server. SMS to one number/day will work; rest get rate-limited.

---

## Gmail Limits to Know

| Limit | Value |
|---|---|
| Free Gmail (`@gmail.com`) | 500 emails/day |
| Google Workspace | 2,000 emails/day |
| Per recipient/day | 500 |

For an onboarding flow, that's ~500 new sign-ups/day. Plenty for early launch. When you outgrow it, swap `sendEmail()` in `server.js` to use Resend / SendGrid / Amazon SES (any nodemailer-compatible transport).

---

## Endpoint Reference

```http
POST /api/otp/send
Content-Type: application/json
{ "contact": "user@gmail.com", "type": "email" }
→ 200 { "sent": true, "expiresAt": "2026-05-24T11:05:00Z" }
→ 429 { "error": "rate_limited", "retryAfterSec": 1234 }
→ 502 { "error": "gmail_EAUTH: ..." }

POST /api/otp/verify
{ "contact": "user@gmail.com", "otp": "123456" }
→ 200 { "verified": true, "token": "verified.user@gmail.com.1716..." }
→ 200 { "verified": false, "reason": "mismatch" | "expired_or_not_found" }
```

---

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `gmail_EAUTH` | Wrong App Password | Re-generate at https://myaccount.google.com/apppasswords |
| `Email arrived but in Spam` | Gmail SMTP from unverified domain | Tell Gmail "Mark as not spam" once; future ones go to Inbox |
| `Network request failed` from app | Phone can't reach `localhost:3001` | Use Cloudflare Tunnel (Option A above) |
| `429 rate_limited` | >5 sends to same email in 1 hour | Raise `OTP_MAX_PER_HOUR` in `.env` or wait |
| Server restart loses OTPs | In-memory storage | OK for dev; swap for SQLite / Redis for production hardening |
