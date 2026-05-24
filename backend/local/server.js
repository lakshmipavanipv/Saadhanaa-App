/**
 * Saadhana OTP Server (local Node.js)
 *
 * Runs on your own machine — works for both:
 *   • Local development (app at http://localhost:8086 talks to http://localhost:3001)
 *   • Production via Cloudflare Tunnel (gives you a free public HTTPS URL —
 *     see README.md). When tunneled, your phone / App Store users can reach
 *     this same server.
 *
 * Routes:
 *   POST /api/otp/send    { contact, type: 'email' | 'phone' }
 *   POST /api/otp/verify  { contact, otp }
 *   GET  /                health check
 *
 * Storage: in-memory Map with 5-minute TTL. Restart = OTPs cleared. For
 * higher reliability, swap for SQLite / Redis later.
 *
 * Email: Gmail SMTP via nodemailer + a Google App Password (NOT your normal
 * Gmail password). Setup steps in README.md.
 *
 * SMS: TextBelt (free 1/day per IP, or paid key). Optional — leave
 * TEXTBELT_KEY empty in .env to disable SMS.
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';

// ─── Config ────────────────────────────────────────────────────────

const PORT             = parseInt(process.env.PORT || '3001', 10);
const ALLOWED_ORIGIN   = process.env.ALLOWED_ORIGIN || '*';
const OTP_TTL_SECONDS  = parseInt(process.env.OTP_TTL_SECONDS || '300', 10);
const OTP_MAX_PER_HOUR = parseInt(process.env.OTP_MAX_PER_HOUR || '5', 10);

const GMAIL_USER         = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const GMAIL_FROM_NAME    = process.env.GMAIL_FROM_NAME || 'Saadhana';
const TEXTBELT_KEY       = process.env.TEXTBELT_KEY || '';

if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
  console.warn(
    '⚠️  GMAIL_USER or GMAIL_APP_PASSWORD missing in .env — email OTP will fail.'
  );
  console.warn('   See backend/local/README.md to get a Google App Password.');
}

// ─── Storage (in-memory, 5-min TTL) ────────────────────────────────

const otpStore  = new Map(); // contact → { otp, expiresAt }
const rateStore = new Map(); // contact → { count, resetAt }

const cleanup = () => {
  const now = Date.now();
  for (const [k, v] of otpStore)  if (v.expiresAt < now) otpStore.delete(k);
  for (const [k, v] of rateStore) if (v.resetAt   < now) rateStore.delete(k);
};
setInterval(cleanup, 60_000);

// ─── Utils ─────────────────────────────────────────────────────────

const generateOTP = () => String(Math.floor(100_000 + Math.random() * 900_000));

const normalizeContact = (contact, type) => {
  const t = (contact || '').trim();
  return type === 'email' ? t.toLowerCase() : t.replace(/[^\d+]/g, '');
};

// ─── Email (Gmail SMTP) ────────────────────────────────────────────

const mailer = (GMAIL_USER && GMAIL_APP_PASSWORD)
  ? nodemailer.createTransport({
      service: 'gmail',
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD.replace(/\s+/g, '') },
    })
  : null;

const emailHTML = (otp) => `
<!DOCTYPE html>
<html><body style="font-family:-apple-system,sans-serif;background:#0a1428;color:#f3e9d2;padding:32px;">
  <div style="max-width:480px;margin:auto;background:#1a2540;border-radius:14px;padding:32px;border:1px solid rgba(255,184,0,0.25);">
    <div style="font-size:36px;text-align:center;">🪷</div>
    <h1 style="text-align:center;color:#FFB800;font-size:22px;margin:12px 0;">Saadhana</h1>
    <p style="font-size:14px;color:#a89880;text-align:center;">Your one-time verification code is</p>
    <div style="font-size:36px;font-weight:bold;color:#FFE066;text-align:center;letter-spacing:8px;padding:16px;background:rgba(255,184,0,0.12);border-radius:8px;margin:16px 0;">${otp}</div>
    <p style="font-size:12px;color:#a89880;text-align:center;margin-top:16px;">
      Valid for 5 minutes. Don't share this code with anyone.<br/>
      If you didn't request this, please ignore.
    </p>
    <p style="font-size:11px;color:#6b5b3f;text-align:center;margin-top:24px;">🙏 Sent with devotion · Saadhana</p>
  </div>
</body></html>`;

const sendEmail = async (to, otp) => {
  if (!mailer) return { ok: false, error: 'gmail_not_configured' };
  try {
    await mailer.sendMail({
      from: `"${GMAIL_FROM_NAME}" <${GMAIL_USER}>`,
      to,
      subject: `Your Saadhana OTP: ${otp}`,
      text: `Your Saadhana OTP is ${otp}. Valid 5 minutes. Don't share.`,
      html: emailHTML(otp),
    });
    return { ok: true };
  } catch (e) {
    console.error('[email] send failed:', e.message);
    return { ok: false, error: `gmail_${e.code || 'error'}: ${e.message}` };
  }
};

// ─── SMS (TextBelt) ────────────────────────────────────────────────

const sendSMS = async (to, otp) => {
  if (!TEXTBELT_KEY) return { ok: false, error: 'textbelt_not_configured' };
  try {
    const body = new URLSearchParams({
      phone: to,
      message: `Your Saadhana OTP is ${otp}. Valid 5 min. Don't share.`,
      key: TEXTBELT_KEY,
    });
    const r = await fetch('https://textbelt.com/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const data = await r.json();
    if (!data.success) return { ok: false, error: `textbelt: ${data.error || 'unknown'}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `sms_fetch_failed: ${e.message}` };
  }
};

// ─── App ───────────────────────────────────────────────────────────

const app = express();
app.use(cors({ origin: ALLOWED_ORIGIN === '*' ? true : ALLOWED_ORIGIN }));
app.use(express.json({ limit: '8kb' }));

app.get('/', (req, res) => {
  res.json({
    name: 'saadhana-otp-local',
    status: 'ok',
    email: mailer ? 'configured' : 'not configured',
    sms: TEXTBELT_KEY ? 'configured' : 'not configured',
  });
});

app.post('/api/otp/send', async (req, res) => {
  const { contact, type } = req.body || {};
  if (!contact || (type !== 'email' && type !== 'phone')) {
    return res.status(400).json({ error: 'missing_or_invalid_fields' });
  }
  const normalized = normalizeContact(contact, type);

  // Rate limit
  const now = Date.now();
  const rate = rateStore.get(normalized) || { count: 0, resetAt: now + 3600_000 };
  if (now > rate.resetAt) { rate.count = 0; rate.resetAt = now + 3600_000; }
  if (rate.count >= OTP_MAX_PER_HOUR) {
    return res.status(429).json({ error: 'rate_limited', retryAfterSec: Math.ceil((rate.resetAt - now) / 1000) });
  }
  rate.count += 1;
  rateStore.set(normalized, rate);

  // Issue
  const otp = generateOTP();
  const expiresAt = now + OTP_TTL_SECONDS * 1000;
  otpStore.set(normalized, { otp, expiresAt });

  // Send
  const result = type === 'email' ? await sendEmail(normalized, otp) : await sendSMS(normalized, otp);
  if (!result.ok) {
    otpStore.delete(normalized); // roll back so user can retry
    console.warn(`[otp:send] ${type} to ${normalized} failed → ${result.error}`);
    return res.status(502).json({ error: result.error });
  }

  console.log(`[otp:send] ${type} sent to ${normalized}`);
  res.json({ sent: true, expiresAt: new Date(expiresAt).toISOString() });
});

app.post('/api/otp/verify', (req, res) => {
  const { contact, otp } = req.body || {};
  if (!contact || !otp) {
    return res.status(400).json({ verified: false, reason: 'missing_fields' });
  }
  const type = contact.includes('@') ? 'email' : 'phone';
  const normalized = normalizeContact(contact, type);

  const entry = otpStore.get(normalized);
  if (!entry) return res.json({ verified: false, reason: 'expired_or_not_found' });
  if (entry.expiresAt < Date.now()) {
    otpStore.delete(normalized);
    return res.json({ verified: false, reason: 'expired_or_not_found' });
  }
  if (entry.otp !== String(otp).trim()) {
    return res.json({ verified: false, reason: 'mismatch' });
  }
  otpStore.delete(normalized); // single-use
  const token = `verified.${normalized}.${Date.now()}`;
  console.log(`[otp:verify] ✓ ${type} ${normalized}`);
  res.json({ verified: true, token });
});

// ─── Boot ──────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`🪷 Saadhana OTP server listening on http://localhost:${PORT}`);
  console.log(`   email: ${mailer ? '✓ Gmail SMTP ready' : '✗ not configured'}`);
  console.log(`   sms:   ${TEXTBELT_KEY ? '✓ TextBelt key set' : '✗ not configured (set TEXTBELT_KEY)'}`);
});
