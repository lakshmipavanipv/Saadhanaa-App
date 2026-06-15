# Body & Soul — OTP email backend

A tiny Cloudflare Worker that powers real emailed OTP codes for the app.
The app (`src/soulsync/auth/otpClient.ts`) calls `/api/otp/send` and
`/api/otp/verify`; until a backend URL is set it runs in on-device demo mode.

## What you need
- A free **Cloudflare** account (Workers + KV).
- A free **Resend** account (https://resend.com) for sending email, with a
  verified sender/domain. (Resend's `onboarding@resend.dev` works for testing.)

## Deploy (≈5 minutes)

```bash
cd otp-worker
npm i -g wrangler          # if you don't have it
wrangler login             # opens browser, log into Cloudflare

# 1. Create the KV namespace and copy the id into wrangler.toml
wrangler kv namespace create OTP_KV
#   -> paste the printed id into wrangler.toml  (id = "...")

# 2. Set secrets
wrangler secret put RESEND_API_KEY     # paste your Resend API key
wrangler secret put OTP_HMAC_SECRET    # paste any long random string
# optional: a verified sender
wrangler secret put OTP_FROM           # e.g.  Body & Soul <otp@yourdomain.com>

# 3. Deploy
wrangler deploy
#   -> prints your Worker URL, e.g. https://body-soul-otp.<you>.workers.dev
```

## Point the app at it
In `sadhana-rn/app.json`, add under `expo.extra`:

```json
"extra": {
  "OTP_BACKEND_URL": "https://body-soul-otp.<you>.workers.dev",
  "eas": { "projectId": "ddbfda35-d73f-4196-b00a-ed623f1bd1a3" }
}
```

Rebuild the APK. The OTP screen will now send a **real email** with the code
and verify it server-side (demo on-screen code disappears automatically).

## Test without the app
```bash
curl -X POST https://body-soul-otp.<you>.workers.dev/api/otp/send \
  -H 'content-type: application/json' -d '{"contact":"you@example.com","type":"email"}'
# check inbox, then:
curl -X POST https://body-soul-otp.<you>.workers.dev/api/otp/verify \
  -H 'content-type: application/json' -d '{"contact":"you@example.com","otp":"123456"}'
```

## Notes
- Codes are 6 digits, valid 10 minutes, max 5 attempts, single-use.
- Phone/SMS OTP is intentionally not wired (would need Twilio etc.); the
  app's primary path is email + Google one-tap.
