import * as SQLite from 'expo-sqlite';

export const DB_NAME = 'soulsync.db';
let dbInstance: SQLite.SQLiteDatabase | null = null;

export const getDB = async (): Promise<SQLite.SQLiteDatabase> => {
  if (dbInstance) return dbInstance;
  dbInstance = await SQLite.openDatabaseAsync(DB_NAME);
  await runMigrations(dbInstance);
  return dbInstance;
};

const MIGRATIONS: {
  version: number;
  sql: string;
  /** Optional step needing values SQL cannot know, e.g. the local UTC offset. */
  run?: (db: SQLite.SQLiteDatabase) => Promise<void>;
}[] = [
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
    sql: `CREATE TABLE IF NOT EXISTS schema_meta (version INTEGER PRIMARY KEY);`,
    /**
     * Clear ring-derived history recorded with the wrong clock.
     *
     * Until v100 the ring's timestamps were decoded as UTC even though its
     * clock is set from local wall-clock fields, so every stored reading sat
     * a full local offset away from when it happened — in IST a 04:30 sleep
     * onset was filed as 10:00.
     *
     * The first attempt at this shifted every row back by the offset. That
     * fails, and did: v100 and v101 had already written correctly-stamped
     * rows, so shifting the old ones landed them on instants the new ones
     * occupied and SQLite refused the whole statement —
     *
     *     UNIQUE constraint failed: vitals_sample.metric, vitals_sample.ts
     *
     * which rolled back, never recorded the migration, and failed again on
     * every launch. Nothing distinguishes a pre-fix row from a post-fix one
     * once they are in the table, so there is no safe shift to make.
     *
     * The history is a couple of days old and mostly wrong, so it goes. The
     * ring keeps recording on its own schedule and everything collected from
     * here on is correctly stamped.
     */
    run: async (db) => {
      const before = await db.getFirstAsync<{ n: number }>(
        'SELECT COUNT(*) AS n FROM vitals_sample'
      );
      const nights = await db.getFirstAsync<{ n: number }>(
        'SELECT COUNT(*) AS n FROM sleep_record'
      );
      await db.execAsync('DELETE FROM vitals_sample;');
      await db.execAsync('DELETE FROM sleep_record;');

      console.log(
        `[db] v6: cleared ${before?.n ?? 0} mis-stamped vitals rows and ` +
        `${nights?.n ?? 0} derived nights`
      );
    },
  },
  {
    version: 7,
    sql: `
      -- v7: japa time, measured from the taps themselves.
      --
      -- WHY THIS EXISTS
      --
      -- Japa time was only ever recorded for an explicit SoulSync session —
      -- the user had to press Start, sit, and press Stop. Almost nobody does
      -- that: they pick up the ring and count. So the practice happened, the
      -- beads were counted, and "japa time" stayed blank, which reads as the
      -- app having lost the practice.
      --
      -- The taps themselves are the measurement. Each bead is an event with a
      -- real instant attached, from the ring or from the screen, and the time
      -- between consecutive beads IS the time spent chanting. Nothing has to
      -- be assumed about pace.
      --
      -- japa_tap is the raw evidence; japa_day is the per-day total the rest
      -- of the app reads. Keeping the raw rows means the daily figure can
      -- always be recomputed if the rules change, rather than being a number
      -- nobody can audit.

      CREATE TABLE IF NOT EXISTS japa_tap (
        tap_id  INTEGER PRIMARY KEY AUTOINCREMENT,
        ts      INTEGER NOT NULL,   -- epoch ms, when the bead was counted
        day     TEXT    NOT NULL,   -- local YYYY-MM-DD of that instant
        source  TEXT    NOT NULL    -- 'ring' | 'app' | 'sync'
      );
      CREATE INDEX IF NOT EXISTS idx_jt_day ON japa_tap(day, ts);

      -- One row per day. active_sec is the measured chanting time; it is NOT
      -- (last - first), which would count a lunch break between two sittings.
      CREATE TABLE IF NOT EXISTS japa_day (
        japa_date    TEXT PRIMARY KEY,           -- YYYY-MM-DD
        active_sec   INTEGER NOT NULL DEFAULT 0, -- measured seconds of japa
        tap_count    INTEGER NOT NULL DEFAULT 0, -- beads counted that day
        stretches    INTEGER NOT NULL DEFAULT 0, -- separate sittings
        first_tap_ts INTEGER,                    -- epoch ms of the first bead
        last_tap_ts  INTEGER                     -- epoch ms of the last bead
      );
    `,
  },
  {
    version: 8,
    sql: `
      -- v8: the Sadhana Depth Score becomes a property of a SESSION.
      --
      -- WHAT WAS WRONG
      --
      -- The depth score was computed on the fly from "everything that happened
      -- today", displayed at the top of three screens, and stored nowhere. So
      -- it could not be looked back at, it could not be broken down by deity
      -- or by practice, and a good morning sitting was diluted by a distracted
      -- evening one because both landed in the same daily average.
      --
      -- A session is the thing that actually has a depth: it has a start, an
      -- end, a body measured throughout, and a baseline to compare against.
      -- These columns make the session row self-describing, so the history tab
      -- never has to re-derive a score from telemetry that may have been
      -- pruned, and so a score shown in March still means what it meant when
      -- it was computed.
      --
      -- Everything the score was built from is stored beside it. A score whose
      -- inputs are gone is a number nobody can check.

      ALTER TABLE session_spiritual ADD COLUMN practice TEXT;          -- 'japa'|'yoga'|'meditation'
      ALTER TABLE session_spiritual ADD COLUMN deity_id TEXT;
      ALTER TABLE session_spiritual ADD COLUMN deity_name TEXT;

      -- Score components, each 0-100, and the weight actually applied.
      ALTER TABLE session_spiritual ADD COLUMN depth_vagal_pts REAL;
      ALTER TABLE session_spiritual ADD COLUMN depth_settle_pts REAL;
      ALTER TABLE session_spiritual ADD COLUMN depth_steady_pts REAL;
      ALTER TABLE session_spiritual ADD COLUMN depth_traject_pts REAL;
      ALTER TABLE session_spiritual ADD COLUMN depth_sustain_pts REAL;

      -- Fraction of the model's weight that had data behind it (0-1). A score
      -- built on two of five components is not the same claim as one built on
      -- all five, and the UI must be able to say so.
      ALTER TABLE session_spiritual ADD COLUMN depth_confidence REAL;

      -- The measurements the score was computed from, kept for audit.
      ALTER TABLE session_spiritual ADD COLUMN baseline_bpm REAL;
      ALTER TABLE session_spiritual ADD COLUMN baseline_rmssd REAL;
      ALTER TABLE session_spiritual ADD COLUMN session_rmssd REAL;
      ALTER TABLE session_spiritual ADD COLUMN session_hr_cv REAL;     -- coefficient of variation, %
      ALTER TABLE session_spiritual ADD COLUMN session_hr_drift REAL;  -- bpm, last third minus first third
      ALTER TABLE session_spiritual ADD COLUMN telemetry_n INTEGER;
      ALTER TABLE session_spiritual ADD COLUMN duration_min REAL;

      -- 'pre-session' = the hour before this sitting; 'personal-30d' = the
      -- practitioner's own rolling normal. Which one was used changes what the
      -- score means, so it is recorded rather than assumed.
      ALTER TABLE session_spiritual ADD COLUMN baseline_source TEXT;

      CREATE INDEX IF NOT EXISTS idx_ss_practice ON session_spiritual(practice, start_time);
      CREATE INDEX IF NOT EXISTS idx_ss_deity    ON session_spiritual(deity_id, start_time);
    `,
  },
  {
    version: 9,
    sql: `
      -- v9: the rest of what the ring already tells us about a day's walking.
      --
      -- The Exercise tab was showing distance as steps x 0.000762 and calories
      -- as steps x 0.04 — a generic stride length and a generic cost per step,
      -- neither derived from this body or this walk. The ring reports its own
      -- distance and calorie figures in the very same records the step counts
      -- come from, and they were being decoded and then thrown away.
      --
      -- active_hours is the number of hourly buckets in which the ring counted
      -- any walking. It is a real, measured figure, and it replaces the
      -- "minutes today" tile that was showing steps / 100.
      ALTER TABLE daily_activity ADD COLUMN distance_km  REAL;
      ALTER TABLE daily_activity ADD COLUMN calorie_kcal REAL;
      ALTER TABLE daily_activity ADD COLUMN active_hours INTEGER;
    `,
  },
  {
    version: 10,
    sql: `
      -- v10: japa time is accumulated in MILLISECONDS.
      --
      -- WHY THIS WAS WRONG
      --
      -- Every bead added Math.round(gapSeconds) to the day's total. Rounding
      -- each gap on its own destroys everything shorter than half a second,
      -- and that is not an edge case: counting quickly, twenty-one beads
      -- landed inside nine seconds, every individual gap rounded to zero, and
      -- the stored day came to 6 seconds against a true 9.
      --
      -- The error is one-sided — it can only ever lose time, never add it —
      -- and it grows with the number of beads, so the faster someone counts
      -- the more of their practice quietly disappears. It also meant the two
      -- ways of asking the same question disagreed: "japa time today", which
      -- measures the spans from the raw taps, read 9 seconds while "time
      -- ever", which sums these stored rows, read 6.
      --
      -- Milliseconds are the units the intervals arrive in, so accumulating
      -- them loses nothing. Seconds are computed once, at read.
      ALTER TABLE japa_day ADD COLUMN active_ms INTEGER NOT NULL DEFAULT 0;
      UPDATE japa_day SET active_ms = active_sec * 1000;
    `,
  },
  {
    version: 11,
    sql: `SELECT 1;`,
    /**
     * Rebuild every japa day from the beads themselves.
     *
     * v10 changed the accumulator to milliseconds, but backfilled it as
     * `active_sec * 1000` — which preserves the very undercount v10 exists to
     * fix. Days recorded before that keep whatever the per-bead rounding had
     * already thrown away, so "japa time today" (computed from the raw taps)
     * and "time ever" (summed from these rows) still disagree, which is what
     * the discrepancy on screen actually was.
     *
     * The raw taps are still there, so the honest fix is to recompute rather
     * than to accept the loss. This is `japaTimeRepo.rebuildDay` applied to
     * every day at once, written out here because a migration must not import
     * a repo that may itself change shape later.
     */
    run: async (db) => {
      const MAX_GAP_MS = 120 * 1000;   // must match japaTimeRepo.MAX_GAP_SEC

      const days = await db.getAllAsync<{ day: string }>(
        'SELECT DISTINCT day FROM japa_tap ORDER BY day'
      );
      if (!days.length) {
        console.log('[db] v11: no japa taps recorded yet, nothing to rebuild');
        return;
      }

      let repaired = 0;
      let gainedMs = 0;
      for (const { day } of days) {
        const taps = await db.getAllAsync<{ ts: number; source: string }>(
          'SELECT ts, source FROM japa_tap WHERE day = ? ORDER BY ts', [day]
        );
        // Backfilled beads carry the instant of the sync rather than of the
        // finger, so they say nothing about duration.
        const timed = taps.filter((t) => t.source !== 'sync');

        let ms = 0;
        let stretches = timed.length ? 1 : 0;
        for (let i = 1; i < timed.length; i++) {
          const gap = timed[i].ts - timed[i - 1].ts;
          if (gap <= MAX_GAP_MS) ms += gap; else stretches++;
        }

        const before = await db.getFirstAsync<{ active_ms: number }>(
          'SELECT active_ms FROM japa_day WHERE japa_date = ?', [day]
        );
        gainedMs += ms - (before?.active_ms ?? 0);
        repaired++;

        await db.runAsync(
          `INSERT INTO japa_day
             (japa_date, active_ms, active_sec, tap_count, stretches, first_tap_ts, last_tap_ts)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(japa_date) DO UPDATE SET
             active_ms = excluded.active_ms, active_sec = excluded.active_sec,
             tap_count = excluded.tap_count, stretches = excluded.stretches,
             first_tap_ts = excluded.first_tap_ts, last_tap_ts = excluded.last_tap_ts`,
          [day, ms, Math.round(ms / 1000), taps.length, stretches,
           taps[0].ts, taps[taps.length - 1].ts]
        );
      }

      console.log(
        `[db] v11: rebuilt ${repaired} japa day(s) from ${days.length} day(s) of beads; ` +
        `recovered ${Math.round(gainedMs / 1000)}s that per-bead rounding had dropped`
      );
    },
  },
  {
    version: 12,
    sql: `
      -- v12: keep the ring's HOURLY step records, not just the daily total.
      --
      -- The ring sends one record per hour and the app was folding them into
      -- a day and discarding the shape. That is most of the information: it
      -- is the difference between "6,200 steps" and "you walked before work
      -- and again after dinner", and it is what the Exercise box needs to
      -- draw a day the way the Japa box can draw one from its bead log.
      --
      -- Keyed by (day, hour) and overwritten on each sync, because the steps
      -- channel returns the whole day every time — so a later sync corrects an
      -- earlier one rather than adding to it.
      CREATE TABLE IF NOT EXISTS activity_hour (
        day     TEXT    NOT NULL,          -- local YYYY-MM-DD
        hour    INTEGER NOT NULL,          -- 0-23, local
        steps   INTEGER NOT NULL DEFAULT 0,
        km      REAL    NOT NULL DEFAULT 0,
        kcal    REAL    NOT NULL DEFAULT 0,
        PRIMARY KEY (day, hour)
      );
      CREATE INDEX IF NOT EXISTS idx_ah_day ON activity_hour(day);
    `,
  },
  {
    version: 13,
    sql: `
      -- v13: the other two vitals of a sitting, so the report can show the
      -- whole comparison rather than half of it.
      --
      -- v8 stored the heart-rate and HRV sides of each sitting because they
      -- are what the score is built from. But the report is meant to list the
      -- vitals with baseline against sadhana-time, and oxygen and skin
      -- temperature were being measured, used for nothing, and dropped. They
      -- carry no weight in the score — this ring cannot measure either finely
      -- enough for that — but they are real readings and belong in the table.
      ALTER TABLE session_spiritual ADD COLUMN baseline_spo2 REAL;
      ALTER TABLE session_spiritual ADD COLUMN baseline_temp_c REAL;
      ALTER TABLE session_spiritual ADD COLUMN session_temp_c REAL;
    `,
  },
  {
    version: 14,
    sql: `
      -- v14: label the sittings that pre-date the practice column.
      --
      -- WHY THE SADHANA DEPTH REPORT WAS EMPTY
      --
      -- v8 added session_spiritual.practice, and everything recorded before it
      -- has NULL there. The Japa tab's depth report asks for the most recent
      -- sitting WHERE practice = 'japa', so it matched nothing and showed its
      -- "start Soul Sync and this fills in" state to a user who had already
      -- recorded sittings — which reads as the feature being missing rather
      -- than as the data being unlabelled.
      --
      -- mala_count is the safe inference: only the japa counter increments it,
      -- so a sitting with malas on it was japa. Sittings without malas stay
      -- NULL rather than being guessed into a practice they may not have been.
      UPDATE session_spiritual
         SET practice = 'japa'
       WHERE practice IS NULL AND mala_count > 0;
    `,
    run: async (db) => {
      const r = await db.getFirstAsync<{ n: number }>(
        "SELECT COUNT(*) AS n FROM session_spiritual WHERE practice = 'japa'"
      );
      const left = await db.getFirstAsync<{ n: number }>(
        'SELECT COUNT(*) AS n FROM session_spiritual WHERE practice IS NULL'
      );
      console.log(
        `[db] v14: ${r?.n ?? 0} sitting(s) now labelled japa; ` +
        `${left?.n ?? 0} left unlabelled (no malas recorded, so not inferable)`
      );
    },
  },
];

const runMigrations = async (db: SQLite.SQLiteDatabase) => {
  await db.execAsync(`CREATE TABLE IF NOT EXISTS schema_meta (version INTEGER PRIMARY KEY);`);
  const row = await db.getFirstAsync<{ version: number | null }>(
    'SELECT MAX(version) AS version FROM schema_meta'
  );
  const current = row?.version ?? 0;

  console.log(`[db] schema at v${current}, latest is v${MIGRATIONS[MIGRATIONS.length - 1].version}`);
  for (const m of MIGRATIONS) {
    if (m.version > current) {

      console.log(`[db] applying migration v${m.version}`);
      await db.execAsync(m.sql);
      if (m.run) await m.run(db);
      await db.runAsync('INSERT INTO schema_meta (version) VALUES (?)', m.version);
    }
  }
};
