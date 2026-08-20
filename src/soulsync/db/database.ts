import * as SQLite from 'expo-sqlite';

export const DB_NAME = 'soulsync.db';
let dbInstance: SQLite.SQLiteDatabase | null = null;

export const getDB = async (): Promise<SQLite.SQLiteDatabase> => {
  if (dbInstance) return dbInstance;
  dbInstance = await SQLite.openDatabaseAsync(DB_NAME);
  await runMigrations(dbInstance);
  return dbInstance;
};

const MIGRATIONS: Array<{
  version: number;
  sql: string;
  /** Optional step needing values SQL cannot know, e.g. the local UTC offset. */
  run?: (db: SQLite.SQLiteDatabase) => Promise<void>;
}> = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS ambient_baseline (
        timestamp      TEXT PRIMARY KEY,
        ambient_bpm    INTEGER NOT NULL,
        ambient_rmssd  REAL    NOT NULL,
        activity_state TEXT    NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ab_state ON ambient_baseline(activity_state);
      CREATE INDEX IF NOT EXISTS idx_ab_ts    ON ambient_baseline(timestamp);

      CREATE TABLE IF NOT EXISTS session_spiritual (
        session_id           TEXT PRIMARY KEY,
        start_time           TEXT NOT NULL,
        end_time             TEXT,
        mala_count           INTEGER NOT NULL DEFAULT 0,
        session_avg_bpm      INTEGER,
        hrv_peaks_registered INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_ss_start ON session_spiritual(start_time);

      CREATE TABLE IF NOT EXISTS spiritual_peak_marker (
        peak_id         INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id      TEXT NOT NULL,
        timestamp       TEXT NOT NULL,
        rmssd_ms        REAL NOT NULL,
        improvement_pct REAL NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_pk_session ON spiritual_peak_marker(session_id);

      CREATE TABLE IF NOT EXISTS session_telemetry (
        telemetry_id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id   TEXT NOT NULL,
        timestamp    TEXT NOT NULL,
        bpm          INTEGER NOT NULL,
        rmssd_ms     REAL
      );
      CREATE INDEX IF NOT EXISTS idx_tel_session ON session_telemetry(session_id);

      CREATE TABLE IF NOT EXISTS sleep_record (
        sleep_date      TEXT PRIMARY KEY,
        total_sleep_min INTEGER NOT NULL,
        deep_sleep_min  INTEGER NOT NULL,
        rem_sleep_min   INTEGER NOT NULL,
        awakenings      INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS shield_event (
        shield_id        INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id       TEXT NOT NULL,
        started_at       TEXT NOT NULL,
        ended_at         TEXT NOT NULL,
        shield_minutes   INTEGER NOT NULL,
        returned_to_baseline INTEGER NOT NULL DEFAULT 0
      );
    `,
  },
  {
    version: 2,
    sql: `
      -- v2: ring biometric channels (Samsung-Ring-style)
      ALTER TABLE ambient_baseline ADD COLUMN spo2 REAL;
      ALTER TABLE ambient_baseline ADD COLUMN skin_temp_c REAL;
      ALTER TABLE session_telemetry ADD COLUMN spo2 REAL;
      ALTER TABLE session_telemetry ADD COLUMN skin_temp_c REAL;
      ALTER TABLE session_spiritual ADD COLUMN avg_spo2 REAL;
      ALTER TABLE session_spiritual ADD COLUMN avg_skin_temp_c REAL;
      ALTER TABLE session_spiritual ADD COLUMN depth_score REAL;
    `,
  },
  {
    version: 3,
    sql: `
      -- v3: Emotional remediation pipeline
      CREATE TABLE IF NOT EXISTS emotional_event (
        id                          INTEGER PRIMARY KEY AUTOINCREMENT,
        trigger_type                TEXT NOT NULL,             -- 'anxiety' | 'lethargy' | 'aggression'
        severity                    TEXT NOT NULL,             -- 'mild' | 'moderate' | 'acute'
        detected_at                 TEXT NOT NULL,
        bpm_at_detection            INTEGER,
        rmssd_at_detection          REAL,
        baseline_bpm                INTEGER,
        baseline_rmssd              REAL,
        context_json                TEXT,                      -- arbitrary JSON metadata
        intervention_id             TEXT,                      -- 'grounding_japa' | 'micro_sadhana' | 'cooling_workspace'
        intervention_started_at     TEXT,
        intervention_completed_at   TEXT,
        pre_intervention_rmssd      REAL,
        post_intervention_rmssd     REAL,
        hrv_improvement_pct         REAL,
        resolved                    INTEGER NOT NULL DEFAULT 0  -- 1 = body returned to baseline
      );
      CREATE INDEX IF NOT EXISTS idx_emo_when    ON emotional_event(detected_at);
      CREATE INDEX IF NOT EXISTS idx_emo_trigger ON emotional_event(trigger_type);

      -- Activity log — for the Vitality Spark (lethargy) detector
      CREATE TABLE IF NOT EXISTS daily_activity (
        activity_date  TEXT PRIMARY KEY,        -- YYYY-MM-DD
        step_count     INTEGER NOT NULL DEFAULT 0,
        active_minutes INTEGER NOT NULL DEFAULT 0
      );
    `,
  },
  {
    version: 4,
    sql: `
      -- v4: bedtime onset — for the 9pm–12am quality-window sleep scoring
      ALTER TABLE sleep_record ADD COLUMN bedtime_minute INTEGER;
    `,
  },
  {
    version: 5,
    sql: `
      -- v5: historic vitals store.
      --
      -- Every scalar sample the ring reports — whether pulled from its
      -- on-board history ({5,k,16} sync channels) or observed live over a
      -- held BLE link — lands here exactly once. The ring re-reports its
      -- whole retained window on every sync, so (metric, ts) is UNIQUE and
      -- re-syncing is idempotent: repeated pulls update in place instead of
      -- multiplying rows.
      --
      -- ts is epoch-ms so range scans are integer comparisons. day is the
      -- local YYYY-MM-DD the sample belongs to, denormalised so daily
      -- rollups never have to do per-row timezone maths in SQL.
      CREATE TABLE IF NOT EXISTS vitals_sample (
        metric   TEXT    NOT NULL,   -- 'hr'|'hrv'|'spo2'|'temp'|'stress'|'bp'|'sugar'
        ts       INTEGER NOT NULL,   -- epoch ms (sample time as reported by the ring)
        day      TEXT    NOT NULL,   -- local YYYY-MM-DD
        value    REAL    NOT NULL,   -- primary reading (bpm, ms, %, °C, 0-100)
        value2   REAL,               -- secondary: diastolic for 'bp', else NULL
        source   TEXT    NOT NULL,   -- 'sync' (ring history) | 'live' (held link)
        PRIMARY KEY (metric, ts)
      );
      CREATE INDEX IF NOT EXISTS idx_vs_metric_day ON vitals_sample(metric, day);
      CREATE INDEX IF NOT EXISTS idx_vs_ts         ON vitals_sample(ts);
    `,
  },
  {
    version: 6,
    sql: `SELECT 1;`,   // nothing structural; the repair below is the migration
    /**
     * Repair timestamps written while ring readings were being decoded as UTC.
     *
     * The ring's clock is set from local wall-clock fields, so its timestamps
     * are local — but they were converted as though they were UTC, shifting
     * every stored reading by the local offset. In IST that is +5:30, which
     * is why a 04:30 sleep onset appeared on the dashboard as 10:00.
     *
     * Every row written before this migration carries that shift, so a single
     * correction across the table is exactly right. getTimezoneOffset()
     * returns minutes BEHIND UTC (-330 for IST), so adding it moves each
     * reading back to the instant it actually happened.
     *
     * sleep_record is derived, not observed, so it is dropped rather than
     * patched: the raw stages in vitals_sample are now correct and the
     * aggregator rebuilds nights from them on the next sync.
     */
    run: async (db) => {
      const offsetMs = new Date().getTimezoneOffset() * 60_000;
      if (offsetMs !== 0) {
        await db.runAsync('UPDATE vitals_sample SET ts = ts + ?', offsetMs);
      }
      await db.execAsync(
        `UPDATE vitals_sample SET day = date(ts / 1000, 'unixepoch', 'localtime');`
      );
      await db.execAsync('DELETE FROM sleep_record;');
    },
  },
];

const runMigrations = async (db: SQLite.SQLiteDatabase) => {
  await db.execAsync(`CREATE TABLE IF NOT EXISTS schema_meta (version INTEGER PRIMARY KEY);`);
  const row = await db.getFirstAsync<{ version: number | null }>(
    'SELECT MAX(version) AS version FROM schema_meta'
  );
  const current = row?.version ?? 0;
  for (const m of MIGRATIONS) {
    if (m.version > current) {
      await db.execAsync(m.sql);
      if (m.run) await m.run(db);
      await db.runAsync('INSERT INTO schema_meta (version) VALUES (?)', m.version);
    }
  }
};
