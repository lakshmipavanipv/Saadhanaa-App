/**
 * RMSSDCalculator — rolling-window HRV engine.
 *
 *   RMSSD = sqrt( (1 / (N-1)) * Σ (RR_{i+1} - RR_i)^2 )
 *
 * Responsibilities:
 *   • Maintain a time-bounded sliding window of R-R intervals (ms).
 *   • Reject physiologically implausible samples (<300ms / >2000ms).
 *   • Reject ectopic beats (>20% deviation from rolling local mean).
 *   • Lock a per-session baseline during the first 120s of data.
 *   • Flag `is_spiritual_peak` on the LEADING EDGE of ≥15% improvement
 *     vs. baseline (debounced — no spam during a sustained peak).
 */

export interface RMSSDConfig {
  windowSeconds: number;
  baselineDurationSec: number;
  peakImprovementPct: number;
  minRRForBaseline: number;
  outlierRejectionPct: number;
}

export interface RMSSDResult {
  rmssd: number | null;
  baselineRMSSD: number | null;
  sampleCount: number;
  isBaselineEstablished: boolean;
  improvementPct: number | null;
  is_spiritual_peak: boolean;  // true ONLY on the rising edge
  timestamp: number;
}

interface RRSample { rrMs: number; receivedAt: number; }

export const DEFAULTS: RMSSDConfig = {
  windowSeconds: 60,
  baselineDurationSec: 120,
  peakImprovementPct: 15,
  minRRForBaseline: 30,
  outlierRejectionPct: 20,
};

export class RMSSDCalculator {
  private readonly cfg: RMSSDConfig;
  private rrWindow: RRSample[] = [];
  private sessionStartedAt: number;
  private baselineRMSSD: number | null = null;
  private isPeakActive = false;

  constructor(cfg: Partial<RMSSDConfig> = {}, now: number = Date.now()) {
    this.cfg = { ...DEFAULTS, ...cfg };
    this.sessionStartedAt = now;
  }

  /** Push one R-R interval (ms). Returns the current snapshot. */
  addRR(rrMs: number, now: number = Date.now()): RMSSDResult {
    // (1) Hard physiological bounds — 300ms = 200bpm, 2000ms = 30bpm
    if (!Number.isFinite(rrMs) || rrMs < 300 || rrMs > 2000) {
      return this.snapshot(now);
    }

    // (2) Local-mean outlier rejection (ectopic beat / motion artifact)
    if (this.rrWindow.length >= 5) {
      const recent = this.rrWindow.slice(-5);
      const mean = recent.reduce((a, b) => a + b.rrMs, 0) / recent.length;
      if (Math.abs(rrMs - mean) / mean > this.cfg.outlierRejectionPct / 100) {
        return this.snapshot(now);
      }
    }

    this.rrWindow.push({ rrMs, receivedAt: now });
    this.evict(now);

    // (3) Lock baseline once the calibration window is full
    if (
      this.baselineRMSSD === null &&
      now - this.sessionStartedAt >= this.cfg.baselineDurationSec * 1000 &&
      this.rrWindow.length >= this.cfg.minRRForBaseline
    ) {
      this.baselineRMSSD = RMSSDCalculator.computeRMSSD(this.rrWindow.map(s => s.rrMs));
    }

    return this.snapshot(now);
  }

  /** Pure math — exposed static for unit testing. */
  static computeRMSSD(rr: number[]): number | null {
    if (rr.length < 2) return null;
    let sumSqDiff = 0;
    for (let i = 1; i < rr.length; i++) {
      const d = rr[i] - rr[i - 1];
      sumSqDiff += d * d;
    }
    return Math.sqrt(sumSqDiff / (rr.length - 1));
  }

  private evict(now: number): void {
    const cutoff = now - this.cfg.windowSeconds * 1000;
    while (this.rrWindow.length > 0 && this.rrWindow[0].receivedAt < cutoff) {
      this.rrWindow.shift();
    }
  }

  private snapshot(now: number): RMSSDResult {
    const rr = this.rrWindow.map(s => s.rrMs);
    const rmssd = RMSSDCalculator.computeRMSSD(rr);
    const improvementPct =
      rmssd != null && this.baselineRMSSD != null && this.baselineRMSSD > 0
        ? (rmssd / this.baselineRMSSD - 1) * 100
        : null;

    const above = improvementPct != null && improvementPct >= this.cfg.peakImprovementPct;
    const isLeadingEdge = above && !this.isPeakActive;
    this.isPeakActive = above;

    return {
      rmssd,
      baselineRMSSD: this.baselineRMSSD,
      sampleCount: rr.length,
      isBaselineEstablished: this.baselineRMSSD != null,
      improvementPct,
      is_spiritual_peak: isLeadingEdge,
      timestamp: now,
    };
  }

  reset(now: number = Date.now()): void {
    this.rrWindow = [];
    this.baselineRMSSD = null;
    this.isPeakActive = false;
    this.sessionStartedAt = now;
  }
}
