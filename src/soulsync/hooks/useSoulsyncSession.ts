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

const MAX_WAVE_SAMPLES = 90; // ~90s on the wave at a time

export interface SoulsyncSessionState {
  active: boolean;
  sessionId: string | null;
  bpmSeries: number[];
  peakIndices: number[];
  rmssd: number | null;
  improvementPct: number | null;
  isBaselineEstablished: boolean;
  peaksRegistered: number;
  liveBpm: number | null;
  liveSpo2: number | null;
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

export const useSoulsyncSession = () => {
  const [state, setState] = useState<SoulsyncSessionState>({
    active: false,
    sessionId: null,
    bpmSeries: [],
    peakIndices: [],
    rmssd: null,
    improvementPct: null,
    isBaselineEstablished: false,
    peaksRegistered: 0,
    liveBpm: null,
    liveRespirationBpm: null,
    liveSpo2: null,
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
  const lastTempRef = useRef<number | null>(null);
  const lastBpmRef = useRef<number | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Rolling R-R window for the respiration estimate. Capped so a long
  // session does not grow this without bound; the estimator only needs a
  // few minutes and prefers recent beats anyway.
  const rrWindowRef = useRef<number[]>([]);

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
    lastSpo2Ref.current = s.spo2;
    lastTempRef.current = s.skinTempC;
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
        rmssd_ms: snap?.rmssd ?? null,
        spo2: s.spo2,
        skin_temp_c: s.skinTempC,
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

  const start = useCallback(async () => {
    if (state.active) return;

    const id = uuid();
    sessionIdRef.current = id;
    bpmBufferRef.current = [];
    peakIdxBufferRef.current = [];
    peakCountRef.current = 0;

    calcRef.current = new RMSSDCalculator();
    ringRef.current = createDefaultRing();

    await sessionSpiritualRepo.create({
      session_id: id,
      start_time: new Date().toISOString(),
      end_time: null,
      mala_count: 0,
      session_avg_bpm: null,
      hrv_peaks_registered: 0,
    });

    ambientIngestion.pause();
    await ringRef.current.start(handleSample, 'session');

    setState({
      active: true,
      sessionId: id,
      bpmSeries: [],
      peakIndices: [],
      rmssd: null,
      improvementPct: null,
      isBaselineEstablished: false,
      peaksRegistered: 0,
      liveBpm: null,
      liveSpo2: null,
      liveSkinTempC: null,
      liveRespirationBpm: null,
    });
  }, [state.active, handleSample]);

  const stop = useCallback(async () => {
    if (!state.active || !sessionIdRef.current) return;
    const id = sessionIdRef.current;

    await ringRef.current?.stop();
    ringRef.current = null;
    ambientIngestion.resume();

    const avgBpm = await sessionSpiritualRepo.computeAvgBpm(id);
    await sessionSpiritualRepo.patch(id, {
      end_time: new Date().toISOString(),
      session_avg_bpm: avgBpm,
    });

    sessionIdRef.current = null;
    calcRef.current = null;

    setState({
      active: false,
      sessionId: null,
      bpmSeries: [],
      peakIndices: [],
      rmssd: null,
      improvementPct: null,
      isBaselineEstablished: false,
      peaksRegistered: 0,
      liveBpm: null,
      liveSpo2: null,
      liveSkinTempC: null,
      liveRespirationBpm: null,
    });
  }, [state.active]);

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

  return { state, start, stop, recordMala };
};
