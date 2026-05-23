# Soulsync OTP Backend

A tiny Cloudflare Worker that powers email + SMS OTP for the Soulsync onboarding flow.
Free tier on Cloudflare covers ~100k requests/day — comfortably more than you'll ever need.

## Endpoints

### `POST /api/otp/send`
```json
{ "contact": "you@example.com", "type": "email" }
```
or
```json
{ "contact": "+919876543210", "type": "phone" }
```

Returns `{ "sent": true, "expiresAt": "..." }`. OTP is 6 digits, expires in 5 min.
Rate-limited to 1 send per contact per 60s.

### `POST /api/otp/verify`
```json
{ "contact": "you@example.com", "otp": "123456" }
```
Returns `{ "verified": true, "token": "<HMAC token>", "contact": "..." }` on success.
After 5 failed attempts the OTP is invalidated.

### `GET /healthz`
Returns `{ "ok": true }`.

## Setup

```sh
npm install
npx wrangler login
npx wrangler kv:namespace create OTP_KV
# Copy the printed `id` into wrangler.toml under [[kv_namespaces]]
```

Set secrets:
```sh
npx wrangler secret put RESEND_API_KEY      # from https://resend.com
npx wrangler secret put TWILIO_ACCOUNT_SID  # from https://www.twilio.com
npx wrangler secret put TWILIO_AUTH_TOKEN
npx wrangler secret put HMAC_SECRET         # any random 32+ chars
```

Update `wrangler.toml`:
- `RESEND_FROM` — verified sender (Resend gives you `onboarding@resend.dev` free for testing)
- `TWILIO_FROM` — your Twilio phone number in E.164 format
- `ALLOWED_ORIGIN` — `*` for dev, or your domain for prod

Deploy:
```sh
npx wrangler deploy
```

You'll get a `https://soulsync-otp.<your-subdomain>.workers.dev` URL.
Paste that into the app's Settings → Soulsync → OTP backend URL.

## Cost summary

- **Cloudflare Workers**: free tier covers 100k requests/day
- **Cloudflare KV**: free tier covers 100k reads + 1k writes/day
- **Resend**: free tier covers 100 emails/day, 3000/month
- **Twilio**: $15 trial credit (~250 SMS in India), pay-as-you-go after (~$0.07/SMS to India)

## Local dev

```sh
npx wrangler dev
# Listens on http://localhost:8787
```

Set secrets in `.dev.vars` (gitignored):
```
RESEND_API_KEY=re_...
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
HMAC_SECRET=any-random-string-32-chars-or-more
```

## Mock mode

If the app's `SOULSYNC_OTP_BACKEND_URL` env var is not set, the app falls back
to the existing demo-OTP flow (code shown on-screen). This keeps development
unblocked while you set up the backend.
