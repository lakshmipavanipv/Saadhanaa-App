# Saadhana Backends

Two OTP backend options — pick the one that fits your hosting:

## `local/` — Self-Hosted Node.js + Gmail SMTP (Recommended for self-hosting)

- 🟢 **100% free**, runs on your own machine
- ✉️ Sends OTP via your Gmail account (App Password, 500/day free)
- 🌐 Use **Cloudflare Tunnel** (free) to expose `localhost` as public HTTPS for App Store users
- 📜 See `local/README.md` for setup

```bash
cd backend/local
npm install
# Fill .env with your Gmail App Password
npm start
```

## `otp-service/` — Cloudflare Worker (Recommended for zero-maintenance hosting)

- 🟢 **Free tier** covers 100k requests/day on Cloudflare
- ✉️ Email via Resend, SMS via Twilio (free trial credit, then paid)
- 🔐 HMAC-signed tokens, KV storage with TTL
- 📜 See `otp-service/README.md` for setup

```bash
cd backend/otp-service
npm install
npx wrangler login
npx wrangler deploy
```

## Wiring the App

After deploying either backend, take the URL (e.g. `http://localhost:3001` for local, or `https://saadhana-otp.<sub>.workers.dev` for Cloudflare) and add to `sadhana-rn/app.json`:

```json
{
  "expo": {
    "extra": {
      "OTP_BACKEND_URL": "https://your-backend-url"
    }
  }
}
```

The Onboarding screen will then send real OTPs instead of showing "Demo OTP" on screen.
