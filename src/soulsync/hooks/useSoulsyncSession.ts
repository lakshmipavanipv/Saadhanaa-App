import 'react-native-get-random-values';
import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';

import { RMSSDCalculator, RMSSDResult } from '../hrv/RMSSDCalculator';
import { RingService, RingSample, createDefaultRing } from '../services/RingTelemetryService';
import { sessionSpiritualRepo } from '../db/sessionSpiritualRepo';
import { telemetryRepo } from '../db/telemetryRepo';
import { peakRepo } from '../db/peakRepo';
import { ambientIngestion } from '../services/AmbientIngestion';
import { estimateRespirationRate } from '../analytics/Respiration';
import { finaliseSessionDepth, type SessionKind, type SessionDepth } from '../analytics/SadhanaDepth';

const MAX_WAVE_SAMPLES = 90; // ~90s on the wave at a time

export interface SoulsyncSessionState {
  active: boolean;
  sessionId: string | null;
  /**
   * What the running sitting IS.
   *
   * Exposed because there is now ONE session shared by every screen (see
   * SoulsyncContext). A bar labelled "japa" needs to know the active sitting is
   * a yoga one so it can say so, instead of offering a Stop button that would
   * silently end someone else's practice and file it under the wrong name.
   */
  practice: SessionKind | null;
  /**
   * When the sitting began, as epoch ms.
   *
   * Needed because a session can now outlive — and predate — the screen
   * showing it. A bar that mounts onto a sitting already in progress used
   * to start its elapsed counter at zero, so japa auto-started from the
   * ring twelve minutes ago read "0:03" the moment the tab was opened.
   */
  startedAt: number | null;
  bpmSeries: number[];
  peakIndices: number[];
  rmssd: number | null;
  improvementPct: number | null;
  isBaselineEstablished: boolean;
  peaksRegistered: number;
  liveBpm: number | null;
  liveSpo2: number | null;
  /**
   * HRV in ms as the RING measured it, refreshed on the service's live
   * measurement cycle. Distinct from `rmssd`, which is computed here from R-R
   * intervals and stays null on hardware that does not stream them — which is
   * all of them today, so this is the only HRV a live session can show.
   */
  liveHrv: number | null;
  liveSkinTempC: number | null;
  /**
   * Breaths per minute, derived from R-R intervals (see
   * analytics/Respiration.ts). Null on hardware that does not stream
   * intervals — the SR16 reports averaged heart rate only, so this stays
   * null there rather than showing a figure nothing measured.
   */
  liveRespirationBpm: number | null;
}

/**
 * Wires:
 *   ring → RMSSDCalculator → spiritual_peak_marker / session_telemetry tables
 *   ring → bpmSeries (live wave) + peakIndices (markers)
 *
 * `start()` opens a new session row. `stop()` finalises avg_bpm + end_time.
 */
/**
 * Cap on the rolling R-R window used for respiration. ~600 beats is roughly
 * eight minutes at rest — comfortably more than the estimator needs, and
 * bounded so a long session cannot grow the array indefinitely.
 */
const RR_WINDOW_MAX = 600;

export interface SessionMeta {
  practice: SessionKind;
  deityId?: string | null;
  deityName?: string | null;
}

export const useSoulsyncSession = () => {
  const [state, setState] = useState<SoulsyncSessionState>({
    active: false,
    sessionId: null,
    practice: null,
    startedAt: null,
    bpmSeries: [],
    peakIndices: [],
    rmssd: null,
    improvementPct: null,
    isBaselineEstablished: false,
    peaksRegistered: 0,
    liveBpm: null,
    liveRespirationBpm: null,
    liveSpo2: null,
    liveHrv: null,
    liveSkinTempC: null,
  });

  const ringRef = useRef<RingService | null>(null);
  const calcRef = useRef<RMSSDCalculator | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  // We accumulate locally to avoid setState-on-every-beat thrash
  const bpmBufferRef = useRef<number[]>([]);
  const peakIdxBufferRef = useRef<number[]>([]);
  const peakCountRef = useRef(0);
  const lastSpo2Ref = useRef<number | null>(null);
  const lastHrvRef = useRef<number | null>(null);
  const lastTempRef = useRef<number | null>(null);
  const lastBpmRef = useRef<number | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Rolling R-R window for the respiration estimate. Capped so a long
  // session does not grow this without bound; the estimator only needs a
  // few minutes and prefers recent beats anyway.
  const rrWindowRef = useRef<number[]>([]);
  /**
   * What this sitting IS — the practice, and the deity when there is one.
   *
   * Held for the whole session rather than passed to `stop()`, because the
   * screen can change underneath a running session (the user switches deity
   * mid-mala, or walks to another tab) and the sitting belongs to what it was
   * started as. It is written to the row at `start()` too, so a session that
   * is never stopped cleanly is still identifiable.
   */
  const metaRef = useRef<SessionMeta>({ practice: 'japa' });
  /**
   * Whether a sitting is open, readable synchronously.
   *
   * `state.active` is the same fact for rendering; this is the same fact for
   * control flow. They are separate because a `useCallback` closes over the
   * state value it was created with, and the callers that matter most here —
   * the auto-starter, a screen stopping one sitting to begin another — act
   * within a single tick, before any re-render has happened.
   */
  const activeRef = useRef(false);

  const handleSample = useCallback(async (s: RingSample) => {
    if (!sessionIdRef.current || !calcRef.current) return;

    // Feed the respiration window before the peak loop — it wants every
    // interval, not only the ones that trigger a peak.
    if (s.rrMs.length) {
      const w = rrWindowRef.current;
      w.push(...s.rrMs);
      if (w.length > RR_WINDOW_MAX) w.splice(0, w.length - RR_WINDOW_MAX);
      const resp = estimateRespirationRate(w);
      if (resp) setState((st) => ({ ...st, liveRespirationBpm: Math.round(resp.bpm) }));
    }

    let snap: RMSSDResult | null = null;
    for (const rr of s.rrMs) {
      snap = calcRef.current.addRR(rr, s.receivedAt);
      if (snap.is_spiritual_peak && snap.rmssd != null && snap.improvementPct != null) {
        const peakIdx = bpmBufferRef.current.length;
        peakIdxBufferRef.current.push(peakIdx);
        peakCountRef.current += 1;
        try {
          await peakRepo.insert({
            session_id: sessionIdRef.current,
            timestamp: new Date(s.receivedAt).toISOString(),
            rmssd_ms: snap.rmssd,
            improvement_pct: snap.improvementPct,
          });
          await sessionSpiritualRepo.incrementPeaks(sessionIdRef.current);
        } catch (e) {
          // swallow — DB write should never break the live wave
        }
      }
    }

    lastBpmRef.current = s.bpm;
    // 0 is the stream's "not measured" sentinel, not a reading. Copying it
    // through blanked the HUD and charted a zero every time a heart-rate frame
    // arrived before the first SpO2/HRV measurement of the session.
    if (s.spo2 > 0) lastSpo2Ref.current = s.spo2;
    if (s.hrv > 0) lastHrvRef.current = s.hrv;
    if (s.skinTempC > 0) lastTempRef.current = s.skinTempC;
    bpmBufferRef.current.push(s.bpm);
    if (bpmBufferRef.current.length > MAX_WAVE_SAMPLES) {
      const overflow = bpmBufferRef.current.length - MAX_WAVE_SAMPLES;
      bpmBufferRef.current = bpmBufferRef.current.slice(overflow);
      // shift peak indices left to stay aligned with the sliding window
      peakIdxBufferRef.current = peakIdxBufferRef.current
        .map(i => i - overflow)
        .filter(i => i >= 0);
    }

    try {
      await telemetryRepo.insert({
        session_id: sessionIdRef.current,
        timestamp: new Date(s.receivedAt).toISOString(),
        bpm: s.bpm,
        // Prefer RMSSD computed here from real R-R intervals; when the hardware
        // does not stream them — every ring the app supports today — fall back
        // to the HRV the ring's own firmware measured, so the session actually
        // has an HRV column instead of a table of nulls.
        rmssd_ms: snap?.rmssd ?? (s.hrv > 0 ? s.hrv : null),
        spo2: s.spo2 > 0 ? s.spo2 : null,
        skin_temp_c: s.skinTempC > 0 ? s.skinTempC : null,
      });
    } catch { /* drop */ }
  }, []);

  /** Flush rolling buffers into React state at 4Hz — keeps the wave smooth */
  useEffect(() => {
    if (!state.active) return;
    const flush = () => {
      setState(prev => ({
        ...prev,
        bpmSeries: [...bpmBufferRef.current],
        peakIndices: [...peakIdxBufferRef.current],
        peaksRegistered: peakCountRef.current,
        liveBpm: lastBpmRef.current,
        liveSpo2: lastSpo2Ref.current,
        liveHrv: lastHrvRef.current,
        liveSkinTempC: lastTempRef.current,
      }));
    };
    flushTimerRef.current = setInterval(flush, 250);
    return () => {
      if (flushTimerRef.current) clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    };
  }, [state.active]);

  /** Poll the calc on a slower interval for HUD readouts. */
  useEffect(() => {
    if (!state.active) return;
    const hud = setInterval(() => {
      if (!calcRef.current) return;
      const snap = calcRef.current.addRR(NaN); // NaN → no-op, returns current snapshot
      setState(prev => ({
        ...prev,
        rmssd: snap.rmssd,
        improvementPct: snap.improvementPct,
        isBaselineEstablished: snap.isBaselineEstablished,
      }));
    }, 1000);
    return () => clearInterval(hud);
  }, [state.active]);

  const start = useCallback(async (meta: SessionMeta = { practice: 'japa' }) => {
    /*
     * Guarded on a ref, not on `state.active`.
     *
     * `setState` does not update this closure — React schedules a re-render and
     * only the NEXT `start` sees the new value. Anything that stops a session
     * and starts another without yielding to the renderer therefore read a
     * stale `active` and returned here silently, having done nothing: the
     * caller saw a resolved promise and believed a session was open.
     *
     * That is not hypothetical. It is exactly the walk→japa upgrade in
     * autoSession: `await stop()` then `await start()` resumes on a microtask,
     * long before React has re-rendered, so the first bead of a chant that
     * began during a walk ended the walk and opened nothing in its place.
     *
     * A ref is also the only correct guard against two concurrent starts,
     * which is why it is set before the first await rather than after.
     */
    if (activeRef.current) return;
    activeRef.current = true;
    metaRef.current = meta;

    const id = uuid();
    sessionIdRef.current = id;
    bpmBufferRef.current = [];
    peakIdxBufferRef.current = [];
    peakCountRef.current = 0;
    // Carrying the previous session's last readings into a new one would show
    // an old number as "live" until the first measurement window closes.
    lastBpmRef.current = null;
    lastSpo2Ref.current = null;
    lastHrvRef.current = null;
    lastTempRef.current = null;
    rrWindowRef.current = [];

    calcRef.current = new RMSSDCalculator();
    ringRef.current = createDefaultRing();

    await sessionSpiritualRepo.create({
      session_id: id,
      start_time: new Date().toISOString(),
      end_time: null,
      mala_count: 0,
      session_avg_bpm: null,
      hrv_peaks_registered: 0,
      practice: meta.practice,
      deity_id: meta.deityId ?? null,
      deity_name: meta.deityName ?? null,
    });

    ambientIngestion.pause();
    try {
      await ringRef.current.start(handleSample, 'session');
    } catch (e) {
      // A start that throws (ring out of range, permission revoked) used to
      // leave the session half-open: `active` never flipped, so `stop()` early
      // returned and `ambientIngestion` stayed paused for the rest of the app
      // session — silently ending baseline capture. Unwind properly instead.
      ambientIngestion.resume();
      ringRef.current = null;
      sessionIdRef.current = null;
      calcRef.current = null;
      activeRef.current = false;
      throw e;
    }

    setState({
      active: true,
      sessionId: id,
      practice: meta.practice,
      startedAt: Date.now(),
      bpmSeries: [],
      peakIndices: [],
      rmssd: null,
      improvementPct: null,
      isBaselineEstablished: false,
      peaksRegistered: 0,
      liveBpm: null,
      liveSpo2: null,
      liveHrv: null,
      liveSkinTempC: null,
      liveRespirationBpm: null,
    });
  // No `state.active` dependency: the guard is `activeRef`, so this callback
  // never needs rebuilding and every holder of it stays current.
  }, [handleSample]);

  /**
   * End the sitting and score it.
   *
   * The depth score is computed HERE, once, and written to the session row —
   * not recomputed whenever a screen asks. The baseline it is measured against
   * is the one that existed at the time, and a sitting that read 72 today must
   * still read 72 in six months, after the practitioner's rolling normal has
   * moved on.
   *
   * Returns the finished report so the caller can show it immediately instead
   * of re-reading what it just wrote.
   */
  const stop = useCallback(async (): Promise<SessionDepth | null> => {
    // Ref-guarded for the same reason `start` is — see the note there.
    if (!activeRef.current || !sessionIdRef.current) return null;
    const id = sessionIdRef.current;
    activeRef.current = false;

    await ringRef.current?.stop();
    ringRef.current = null;
    ambientIngestion.resume();

    // Every vital the sitting measured, averaged in one pass over the
    // telemetry it already wrote. `avg_spo2` and `avg_skin_temp_c` have existed
    // since migration v2 and nothing ever wrote them, which is why every stored
    // report showed a blank "Blood oxygen · In sadhana" cell — the number was
    // computed live, shown once, and thrown away.
    //
    // AVG() over an all-null column returns null, and the repo floors that to
    // 0; 0 is not a reading, so it is stored as null rather than charted as a
    // heart that stopped.
    const agg = await telemetryRepo.aggregates(id);
    const measured = (v: number): number | null => (v > 0 ? Math.round(v * 10) / 10 : null);
    const avgBpm = agg.avgBpm > 0 ? Math.round(agg.avgBpm) : null;
    await sessionSpiritualRepo.patch(id, {
      end_time: new Date().toISOString(),
      session_avg_bpm: avgBpm,
      avg_spo2: measured(agg.avgSpo2),
      avg_skin_temp_c: measured(agg.avgSkinTempC),
    });

    sessionIdRef.current = null;
    calcRef.current = null;

    // Scored before the state reset so a failure here cannot leave the session
    // looking active. A sitting that cannot be scored is still a sitting: the
    // row keeps its times and its malas, and the report says why it is blank.
    let depth: SessionDepth | null = null;
    try {
      depth = await finaliseSessionDepth(id, metaRef.current);
    } catch (e) {
      console.warn('[soulsync] depth scoring failed', e);
    }

    setState({
      active: false,
      sessionId: null,
      practice: null,
      startedAt: null,
      bpmSeries: [],
      peakIndices: [],
      rmssd: null,
      improvementPct: null,
      isBaselineEstablished: false,
      peaksRegistered: 0,
      liveBpm: null,
      liveSpo2: null,
      liveHrv: null,
      liveSkinTempC: null,
      liveRespirationBpm: null,
    });

    return depth;
  }, []);

  /** Called from outside whenever the user completes a full mala. */
  const recordMala = useCallback(async () => {
    if (sessionIdRef.current) {
      await sessionSpiritualRepo.incrementMalas(sessionIdRef.current);
    }
  }, []);

  useEffect(() => {
    return () => {
      ringRef.current?.stop();
    };
  }, []);

  /**
   * Is a sitting open, right now, this tick?
   *
   * `state.active` answers the same question for rendering but lags by a
   * render: immediately after `start()` resolves it is still false. A caller
   * that acts on the answer synchronously — the auto-starter checking whether
   * the session it just asked for actually opened — needs the ref.
   */
  const isActive = useCallback(() => activeRef.current, []);

  return { state, start, stop, recordMala, isActive };
};
