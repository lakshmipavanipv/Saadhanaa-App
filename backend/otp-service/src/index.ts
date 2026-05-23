/**
 * Soulsync OTP Backend — Cloudflare Worker
 *
 * Two endpoints:
 *   POST /api/otp/send   — generate + send OTP via Resend (email) / Twilio (SMS)
 *   POST /api/otp/verify — validate user-supplied OTP, return short-lived token
 *
 * Storage: Cloudflare KV (one namespace, 5-min TTL per OTP).
 * Rate limit: 1 send per contact per 60s; max 5 verify attempts per OTP.
 *
 * Required environment variables (wrangler.toml or Cloudflare dashboard):
 *   RESEND_API_KEY        — for email OTPs   (https://resend.com)
 *   RESEND_FROM           — verified sender, e.g. "Soulsync <otp@yourdomain.com>"
 *   TWILIO_ACCOUNT_SID    — for SMS OTPs     (https://www.twilio.com)
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_FROM           — Twilio phone number (E.164, e.g. "+15551234567")
 *   ALLOWED_ORIGIN        — CORS, e.g. "*"  or  "https://your-app.example"
 *   HMAC_SECRET           — used to sign the verification token (random 32+ char)
 */

export interface Env {
  OTP_KV: KVNamespace;
  RESEND_API_KEY: string;
  RESEND_FROM: string;
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_FROM: string;
  ALLOWED_ORIGIN: string;
  HMAC_SECRET: string;
}

interface OtpRecord {
  otp: string;
  attempts: number;
  createdAt: number;
}

const OTP_TTL_SECONDS = 5 * 60;      // 5 min
const MAX_ATTEMPTS = 5;
const RESEND_LOCKOUT_SECONDS = 60;

// ─── Entry point ─────────────────────────────────────────────────

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    // CORS preflight
    if (req.method === 'OPTIONS') return corsResponse(env);

    try {
      if (url.pathname === '/api/otp/send'   && req.method === 'POST') return handleSend(req, env);
      if (url.pathname === '/api/otp/verify' && req.method === 'POST') return handleVerify(req, env);
      if (url.pathname === '/healthz')                                 return cors(env, json({ ok: true }));

      return cors(env, json({ error: 'not_found' }, 404));
    } catch (e: any) {
      return cors(env, json({ error: 'internal', message: String(e?.message ?? e) }, 500));
    }
  },
};

// ─── /api/otp/send ───────────────────────────────────────────────

interface SendBody {
  contact: string;                   // email or phone (E.164)
  type: 'email' | 'phone';
}

const handleSend = async (req: Request, env: Env): Promise<Response> => {
  const body = await req.json<SendBody>().catch(() => null);
  if (!body || !body.contact || !body.type) {
    return cors(env, json({ error: 'bad_request', message: 'contact + type required' }, 400));
  }

  // Normalise key
  const key = otpKey(body.contact);

  // Rate limit re-send: only allow 1 per 60s
  const existing = await env.OTP_KV.get<OtpRecord>(key, 'json');
  if (existing && Date.now() - existing.createdAt < RESEND_LOCKOUT_SECONDS * 1000) {
    return cors(env, json({
      error: 'rate_limited',
      message: 'Please wait before requesting another code',
      retryAfter: Math.ceil((RESEND_LOCKOUT_SECONDS * 1000 - (Date.now() - existing.createdAt)) / 1000),
    }, 429));
  }

  // Generate 6-digit OTP
  const otp = String(Math.floor(100_000 + Math.random() * 900_000));
  const record: OtpRecord = { otp, attempts: 0, createdAt: Date.now() };
  await env.OTP_KV.put(key, JSON.stringify(record), { expirationTtl: OTP_TTL_SECONDS });

  // Send via the requested channel
  if (body.type === 'email') {
    const ok = await sendEmail(env, body.contact, otp);
    if (!ok) return cors(env, json({ error: 'email_send_failed' }, 502));
  } else {
    const ok = await sendSms(env, body.contact, otp);
    if (!ok) return cors(env, json({ error: 'sms_send_failed' }, 502));
  }

  return cors(env, json({
    sent: true,
    expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000).toISOString(),
  }));
};

// ─── /api/otp/verify ─────────────────────────────────────────────

interface VerifyBody { contact: string; otp: string; }

const handleVerify = async (req: Request, env: Env): Promise<Response> => {
  const body = await req.json<VerifyBody>().catch(() => null);
  if (!body || !body.contact || !body.otp) {
    return cors(env, json({ error: 'bad_request' }, 400));
  }
  const key = otpKey(body.contact);
  const rec = await env.OTP_KV.get<OtpRecord>(key, 'json');
  if (!rec) {
    return cors(env, json({ verified: false, reason: 'expired_or_unknown' }, 410));
  }
  if (rec.attempts >= MAX_ATTEMPTS) {
    await env.OTP_KV.delete(key);
    return cors(env, json({ verified: false, reason: 'too_many_attempts' }, 429));
  }
  if (rec.otp !== body.otp.trim()) {
    rec.attempts += 1;
    await env.OTP_KV.put(key, JSON.stringify(rec), { expirationTtl: OTP_TTL_SECONDS });
    return cors(env, json({ verified: false, reason: 'mismatch', remaining: MAX_ATTEMPTS - rec.attempts }, 401));
  }

  // Success — delete the record + return a signed token
  await env.OTP_KV.delete(key);
  const token = await signToken(env, body.contact);
  return cors(env, json({ verified: true, token, contact: body.contact }));
};

// ─── Email — Resend ──────────────────────────────────────────────

const sendEmail = async (env: Env, to: string, otp: string): Promise<boolean> => {
  if (!env.RESEND_API_KEY) return false;
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.RESEND_FROM || 'Soulsync <onboarding@resend.dev>',
      to: [to],
      subject: 'Your Soulsync verification code',
      html: emailTemplate(otp),
      text: `Your Soulsync verification code is ${otp}. It expires in 5 minutes.`,
    }),
  });
  return resp.ok;
};

const emailTemplate = (otp: string): string => `
<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;background:#0a0e27;color:#f5e6d3;padding:24px;max-width:480px;margin:0 auto;">
  <div style="text-align:center;padding:32px 24px;background:#1a1f3a;border-radius:12px;">
    <div style="font-size:36px;margin-bottom:12px;">🪷</div>
    <h2 style="color:#d4a017;margin:0 0 8px 0;font-weight:600;">Soulsync</h2>
    <p style="color:#a0a0a0;margin:0 0 24px 0;font-size:13px;">Your verification code</p>
    <div style="font-size:42px;letter-spacing:8px;color:#d6e040;font-weight:700;background:rgba(214,224,64,0.08);padding:18px;border-radius:8px;">
      ${otp}
    </div>
    <p style="color:#a0a0a0;margin-top:20px;font-size:12px;">Expires in 5 minutes. If you didn't request this, ignore this email.</p>
  </div>
</body></html>`;

// ─── SMS — Twilio ────────────────────────────────────────────────

const sendSms = async (env: Env, to: string, otp: string): Promise<boolean> => {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM) return false;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;
  const auth = btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);
  const body = new URLSearchParams({
    From: env.TWILIO_FROM,
    To: to,
    Body: `Soulsync code: ${otp} (expires in 5 min)`,
  });
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  return resp.ok;
};

// ─── Helpers ─────────────────────────────────────────────────────

const otpKey = (contact: string): string => `otp:${contact.trim().toLowerCase()}`;

const json = (obj: any, status = 200): Response =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

const cors = (env: Env, res: Response): Response => {
  res.headers.set('Access-Control-Allow-Origin', env.ALLOWED_ORIGIN || '*');
  res.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return res;
};

const corsResponse = (env: Env): Response =>
  cors(env, new Response(null, { status: 204 }));

/** Signs a short-lived (24h) HMAC token to prove verification. */
const signToken = async (env: Env, contact: string): Promise<string> => {
  const payload = { contact, iat: Date.now(), exp: Date.now() + 24 * 3600 * 1000 };
  const payloadB64 = btoa(JSON.stringify(payload));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.HMAC_SECRET || 'change-me'),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `${payloadB64}.${sigB64}`;
};
