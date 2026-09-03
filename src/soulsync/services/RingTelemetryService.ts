/**
 * RingTelemetryService — the contract every live-telemetry consumer codes
 * against (soulsync sessions, the emotional engine, ambient ingestion,
 * yoga/exercise screens).
 *
 * There is exactly ONE implementation: `SadhanaRingService`, which speaks the
 * Jieli 0xAB protocol over the a00a/b002/b003 GATT channel to the paired
 * SR16. The former MockRingService simulator was removed — every number the
 * app shows must originate at the ring, so there is no longer a code path
 * that can manufacture one.
 *
 * Availability note: the ring pushes heart rate on a held link, but it does
 * NOT stream per-beat R-R intervals, SpO2, temperature or motion. Fields the
 * hardware cannot supply are reported as `0` / `[]`, which is this codebase's
 * established "no reading" sentinel (see ambientBaselineRepo, JapaEffect).
 * Consumers must treat them as absent rather than as a real measurement.
 */

// SadhanaRingService imports only *types* from this module (`import type`),
// which are erased at runtime — so this import creates no cycle.
import { SadhanaRingService } from './SadhanaRingService';

export interface RingSample {
  /** Beats per minute, straight from the ring. 0 when unknown. */
  bpm: number;
  /**
   * R-R intervals (ms) for this packet. The SR16 computes HR in firmware and
   * does not expose per-beat timing, so this is `[]` on live links — RMSSD is
   * therefore null and true HRV comes from the ring's own HRV history channel
   * ({5,10,16}) via `vitalsRepo`, not from this stream.
   */
  rrMs: number[];
  /** Blood oxygen %. 0 when no recent reading exists. */
  spo2: number;
  /**
   * The ring's own HRV figure (ms), as measured by its firmware — NOT derived
   * from `rrMs`, which this hardware never populates. 0 when no reading has
   * arrived yet.
   *
   * This is the only HRV the SR16 can give a live session: `rrMs` stays empty,
   * so RMSSD computed on this stream is always null. Consumers that want "HRV
   * right now" must read this field.
   */
  hrv: number;
  /** Skin temperature °C. 0 when no recent reading exists. */
  skinTempC: number;
  /** Accelerometer magnitude. 0 — the SR16 does not stream motion. */
  accelMag: number;
  /** Gyroscope magnitude. 0 — the SR16 does not stream motion. */
  gyroMag: number;
  /** Blood-volume-pulse velocity. 0 — not exposed by this firmware. */
  bvpVelocity: number;
  receivedAt: number;  // epoch ms
}

export type SampleHandler = (s: RingSample) => void;

export interface BuzzPattern {
  /** Pulse durations (ms) — odd indices are gaps. e.g. [200] = single 200ms chime. */
  pattern: number[];
  intensity?: 'soft' | 'medium' | 'strong';
}

export interface RingService {
  isMock: boolean;
  start(onSample: SampleHandler, mode?: 'ambient' | 'session'): Promise<void>;
  stop(): Promise<void>;
  /**
   * Trigger the ring's vibration motor (opcode 0xDF) — used by the Aggression
   * detector as a private mindfulness anchor.
   */
  buzz(pattern: BuzzPattern): Promise<void>;
}

/**
 * The app's ring. Resolves the paired SR16 by its saved device id; if none is
 * paired, `start()` rejects and the caller shows an unpaired state rather than
 * falling back to invented data.
 */
export const createDefaultRing = (): RingService => new SadhanaRingService();
