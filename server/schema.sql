-- Body & Soul Ring — Postgres schema
-- Stores user identity, DPDP consent records, usage events, and daily
-- health/japa aggregates. All rows keyed by the Firebase uid.

CREATE TABLE IF NOT EXISTS users (
  uid             TEXT PRIMARY KEY,            -- Firebase uid
  email           TEXT,
  name            TEXT,
  phone           TEXT,
  sign_in_method  TEXT,                        -- google | manual | anonymous
  device_model    TEXT,
  app_version     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per consent action (granular + versioned, DPDP audit trail).
CREATE TABLE IF NOT EXISTS consents (
  id          BIGSERIAL PRIMARY KEY,
  uid         TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  version     TEXT NOT NULL,                   -- consent text version, e.g. "2026-06-14"
  granted     BOOLEAN NOT NULL,               -- true = agreed, false = withdrawn
  categories  JSONB NOT NULL DEFAULT '{}',    -- { identity:true, usage:true, health:true, ... }
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_consents_uid ON consents(uid);

-- Usage / diagnostics / AI-adoption / issue reports.
CREATE TABLE IF NOT EXISTS events (
  id          BIGSERIAL PRIMARY KEY,
  uid         TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  type        TEXT NOT NULL,                   -- screen_view | feature_use | ai_accepted | issue_report | session ...
  payload     JSONB NOT NULL DEFAULT '{}',
  client_ts   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_events_uid_type ON events(uid, type);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);

-- Daily health + wellness aggregates (one row per user per day).
CREATE TABLE IF NOT EXISTS health_daily (
  uid          TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  day          DATE NOT NULL,
  bpm          REAL,
  hrv          REAL,
  spo2         REAL,
  steps        INTEGER,
  calories     INTEGER,
  sleep_min    INTEGER,
  sadhana_min  INTEGER,
  workout_min  INTEGER,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (uid, day)
);

-- Japa / sadhana logs (deities list + rate derivable from these).
CREATE TABLE IF NOT EXISTS japa_logs (
  id          BIGSERIAL PRIMARY KEY,
  uid         TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  deity       TEXT,
  japas       INTEGER NOT NULL DEFAULT 0,
  malas       INTEGER NOT NULL DEFAULT 0,
  day         DATE NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_japa_uid_day ON japa_logs(uid, day);
