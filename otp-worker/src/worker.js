/**
 * Body & Soul — OTP backend (Cloudflare Worker)
 *
 * Endpoints (match src/soulsync/auth/otpClient.ts):
 *   POST /api/otp/send    { contact, type }  -> { sent:true, expiresAt }
 *   POST /api/otp/verify  { contact, otp }   -> { verified:true, token } | { verified:false, reason }
 *
 * Storage: a KV namespace bound as OTP_KV (code + attempt count, 10-min TTL).
 * Email:   Resend (https://resend.com) via RESEND_API_KEY secret.
 *          For phone OTPs you'd swap in an SMS provider (Twilio etc.) —
 *          left as a TODO since the app's primary path is email.
 *
 * Secrets / vars (set with `wrangler secret put` or in the dashboard):
 *   RESEND_API_KEY   - Resend API key
 *   OTP_FROM         - verified sender, e.g. "Body & Soul <otp@yourdomain>"
 *   OTP_HMAC_SECRET  - random string used to sign the success token
 */

const TTL_SECONDS = 600;          // code valid 10 minutes
const MAX_ATTEMPTS = 5;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });

const sixDigit = () => {
  // Cryptographically-random 6-digit code.
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, '0');
};

const sign = async (contact, secret) => {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${contact}:${Date.now()}`));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).slice(0, 32);
};

const sendEmail = async (env, to, code) => {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.OTP_FROM || 'Body & Soul <onboarding@resend.dev>',
      to: [to],
      subject: `Your Body & Soul code: ${code}`,
      html: `<div style="font-family:sans-serif;background:#0a0e27;color:#f5e9d0;padding:32px;border-radius:12px;text-align:center">
        <h2 style="color:#FFB800;letter-spacing:2px">BODY &amp; SOUL</h2>
        <p>Your verification code is:</p>
        <div style="font-size:34px;font-weight:800;letter-spacing:10px;color:#FFB800;margin:16px 0">${code}</div>
        <p style="color:#9aa">It expires in 10 minutes. If you didn't request this, ignore this email.</p>
      </div>`,
    }),
  });
  if (!resp.ok) throw new Error(`resend_${resp.status}: ${(await resp.text()).slice(0, 120)}`);
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/api/otp/send') {
      let body;
      try { body = await request.json(); } catch { return json({ sent: false, error: 'bad_json' }, 400); }
      const contact = (body.contact || '').trim().toLowerCase();
      const type = body.type === 'phone' ? 'phone' : 'email';
      if (!contact) return json({ sent: false, error: 'missing_contact' }, 400);
      if (type === 'phone') return json({ sent: false, error: 'sms_not_configured' }, 400);

      const code = sixDigit();
      await env.OTP_KV.put(`otp:${contact}`, JSON.stringify({ code, attempts: 0 }), { expirationTtl: TTL_SECONDS });
      try {
        await sendEmail(env, contact, code);
      } catch (e) {
        return json({ sent: false, error: String(e.message || e).slice(0, 120) }, 502);
      }
      return json({ sent: true, expiresAt: new Date(Date.now() + TTL_SECONDS * 1000).toISOString() });
    }

    if (request.method === 'POST' && url.pathname === '/api/otp/verify') {
      let body;
      try { body = await request.json(); } catch { return json({ verified: false, reason: 'bad_json' }, 400); }
      const contact = (body.contact || '').trim().toLowerCase();
      const otp = (body.otp || '').trim();
      const raw = await env.OTP_KV.get(`otp:${contact}`);
      if (!raw) return json({ verified: false, reason: 'expired_or_unknown' });
      const rec = JSON.parse(raw);
      if (rec.attempts >= MAX_ATTEMPTS) {
        await env.OTP_KV.delete(`otp:${contact}`);
        return json({ verified: false, reason: 'too_many_attempts' });
      }
      if (otp !== rec.code) {
        rec.attempts += 1;
        await env.OTP_KV.put(`otp:${contact}`, JSON.stringify(rec), { expirationTtl: TTL_SECONDS });
        return json({ verified: false, reason: 'mismatch' });
      }
      await env.OTP_KV.delete(`otp:${contact}`);
      const token = await sign(contact, env.OTP_HMAC_SECRET || 'dev-secret');
      return json({ verified: true, token });
    }

    return json({ error: 'not_found' }, 404);
  },
};
