require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const db = require('./db');
const { requireAuth } = require('./auth');

const app = express();
app.use(helmet());
app.use(cors({ origin: (process.env.CORS_ORIGIN || '*').split(',') }));
app.use(express.json({ limit: '512kb' }));
app.use(morgan('tiny'));

// ── Health check (no auth) ──
app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// Everything under /v1 requires a valid Firebase ID token.
const v1 = express.Router();
v1.use(requireAuth);

// Upsert the user profile (called on login / app open).
v1.post('/profile', async (req, res) => {
  const { name, phone, signInMethod, deviceModel, appVersion } = req.body || {};
  const email = req.user.email;
  try {
    await db.query(
      `INSERT INTO users (uid, email, name, phone, sign_in_method, device_model, app_version, last_seen_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, now())
       ON CONFLICT (uid) DO UPDATE SET
         email=COALESCE(EXCLUDED.email, users.email),
         name=COALESCE(EXCLUDED.name, users.name),
         phone=COALESCE(EXCLUDED.phone, users.phone),
         sign_in_method=COALESCE(EXCLUDED.sign_in_method, users.sign_in_method),
         device_model=COALESCE(EXCLUDED.device_model, users.device_model),
         app_version=COALESCE(EXCLUDED.app_version, users.app_version),
         last_seen_at=now()`,
      [req.uid, email, name || null, phone || null, signInMethod || null, deviceModel || null, appVersion || null]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'db', detail: e.message }); }
});

// Record a consent action (granular + versioned).
v1.post('/consent', async (req, res) => {
  const { version, granted, categories } = req.body || {};
  if (!version || typeof granted !== 'boolean') return res.status(400).json({ error: 'bad_request' });
  try {
    // Make sure the user row exists first.
    await db.query(`INSERT INTO users (uid, email) VALUES ($1,$2) ON CONFLICT (uid) DO NOTHING`,
      [req.uid, req.user.email]);
    await db.query(
      `INSERT INTO consents (uid, version, granted, categories) VALUES ($1,$2,$3,$4)`,
      [req.uid, version, granted, categories || {}]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'db', detail: e.message }); }
});

// Batch usage events.
v1.post('/events', async (req, res) => {
  const events = Array.isArray(req.body?.events) ? req.body.events : [];
  if (events.length === 0) return res.json({ ok: true, inserted: 0 });
  try {
    const values = [];
    const params = [];
    events.slice(0, 200).forEach((e, i) => {
      const b = i * 4;
      values.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4})`);
      params.push(req.uid, e.type || 'unknown', e.payload || {}, e.clientTs || null);
    });
    await db.query(
      `INSERT INTO events (uid, type, payload, client_ts) VALUES ${values.join(',')}`,
      params
    );
    res.json({ ok: true, inserted: events.length });
  } catch (e) { res.status(500).json({ error: 'db', detail: e.message }); }
});

// Upsert a daily health aggregate.
v1.post('/health', async (req, res) => {
  const { day, bpm, hrv, spo2, steps, calories, sleepMin, sadhanaMin, workoutMin } = req.body || {};
  if (!day) return res.status(400).json({ error: 'missing_day' });
  try {
    await db.query(
      `INSERT INTO health_daily (uid, day, bpm, hrv, spo2, steps, calories, sleep_min, sadhana_min, workout_min, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
       ON CONFLICT (uid, day) DO UPDATE SET
         bpm=COALESCE(EXCLUDED.bpm, health_daily.bpm),
         hrv=COALESCE(EXCLUDED.hrv, health_daily.hrv),
         spo2=COALESCE(EXCLUDED.spo2, health_daily.spo2),
         steps=GREATEST(COALESCE(EXCLUDED.steps,0), COALESCE(health_daily.steps,0)),
         calories=GREATEST(COALESCE(EXCLUDED.calories,0), COALESCE(health_daily.calories,0)),
         sleep_min=COALESCE(EXCLUDED.sleep_min, health_daily.sleep_min),
         sadhana_min=GREATEST(COALESCE(EXCLUDED.sadhana_min,0), COALESCE(health_daily.sadhana_min,0)),
         workout_min=GREATEST(COALESCE(EXCLUDED.workout_min,0), COALESCE(health_daily.workout_min,0)),
         updated_at=now()`,
      [req.uid, day, bpm ?? null, hrv ?? null, spo2 ?? null, steps ?? null,
       calories ?? null, sleepMin ?? null, sadhanaMin ?? null, workoutMin ?? null]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'db', detail: e.message }); }
});

// Log a japa session.
v1.post('/japa', async (req, res) => {
  const { deity, japas, malas, day } = req.body || {};
  try {
    await db.query(
      `INSERT INTO japa_logs (uid, deity, japas, malas, day) VALUES ($1,$2,$3,$4,$5)`,
      [req.uid, deity || null, japas || 0, malas || 0, day || new Date().toISOString().slice(0, 10)]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'db', detail: e.message }); }
});

// DPDP — export everything we hold on the caller.
v1.get('/me', async (req, res) => {
  try {
    const [user, consents, events, health, japa] = await Promise.all([
      db.query('SELECT * FROM users WHERE uid=$1', [req.uid]),
      db.query('SELECT * FROM consents WHERE uid=$1 ORDER BY created_at', [req.uid]),
      db.query('SELECT * FROM events WHERE uid=$1 ORDER BY created_at DESC LIMIT 1000', [req.uid]),
      db.query('SELECT * FROM health_daily WHERE uid=$1 ORDER BY day DESC', [req.uid]),
      db.query('SELECT * FROM japa_logs WHERE uid=$1 ORDER BY day DESC', [req.uid]),
    ]);
    res.json({
      user: user.rows[0] || null,
      consents: consents.rows,
      events: events.rows,
      health: health.rows,
      japa: japa.rows,
    });
  } catch (e) { res.status(500).json({ error: 'db', detail: e.message }); }
});

// DPDP — erase everything we hold on the caller.
v1.delete('/me', async (req, res) => {
  try {
    await db.query('DELETE FROM users WHERE uid=$1', [req.uid]); // cascades to all child tables
    res.json({ ok: true, deleted: true });
  } catch (e) { res.status(500).json({ error: 'db', detail: e.message }); }
});

app.use('/v1', v1);

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`[body-soul-api] listening on :${PORT}`));
