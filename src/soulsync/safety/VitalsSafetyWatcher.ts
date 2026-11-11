/**
 * VitalsSafetyWatcher — turns the user's live and recorded vitals into
 * EmergencyAlert events, using the thresholds and rules kept in
 * `emergencyPrefs`.
 *
 * Why this and not the EmotionalEngine:
 *   The emotional engine already catches stress and anger and routes the
 *   user into a breathing exercise. That is the right response for an
 *   emotional spike. A sustained SpO2 of 86% is not an emotion — it is a
 *   person whose body is in trouble and may need someone else in the room.
 *   Those cases end in an SMS to a chosen contact and a dialer prefilled
 *   with their number, not in Meditation. So this watcher runs in parallel
 *   to the emotional one and carries its own event type.
 *
 * Rules (defaults; user-adjustable in Emergency & Safety settings):
 *
 *   lowSpo2        SpO2 < 90 %   sustained ≥ 60 s   → questionnaire
 *                  SpO2 < 85 %   sustained ≥ 60 s   → auto-escalate
 *
 *   highHr         HR  > 120 bpm sustained ≥ 60 s   → questionnaire
 *
 *   lowHr          HR  < 50  bpm sustained ≥ 60 s   → questionnaire
 *                  HR  < 40  bpm sustained ≥ 60 s   → auto-escalate
 *
 *   stressSpike    (handled by the existing EmotionalEngine; the user's
 *                   toggle in Emergency settings is a UI shortcut to that)
 *
 * "Sustained" is measured against the last 2 minutes of samples held in a
 * rolling buffer — every sample in that window has to fail the threshold,
 * not just the newest one. A single bad reading from the ring losing
 * contact does not call anyone.
 *
 * Alerts fire once per episode. The watcher clears its own "firing" flag
 * when the vital returns to normal for 30 seconds, so the same event
 * cannot spam the user.
 */

import { emergencyPrefs, type EmergencyPrefs } from '../../services/emergencyPrefs';

export type AlertSeverity = 'warn' | 'critical';
export type AlertRule = 'lowSpo2' | 'highHr' | 'lowHr';

export interface EmergencyAlert {
  rule: AlertRule;
  severity: AlertSeverity;
  value: number;         // the offending measurement
  since: number;         // epoch ms the threshold has been exceeded since
  reason: string;        // human-readable, used in the SMS body
}

interface VitalSample {
  ts: number;
  value: number;
}

const WINDOW_MS = 2 * 60_000;     // two-minute rolling window
const COOLDOWN_MS = 30_000;       // vital must sit inside bounds this long
                                  // before the watcher re-arms for the rule

export class VitalsSafetyWatcher {
  private hr: VitalSample[] = [];
  private spo2: VitalSample[] = [];

  // Per-rule firing state: null means armed, number is the ts the alert fired.
  private firing: Record<AlertRule, number | null> = {
    lowSpo2: null,
    highHr: null,
    lowHr: null,
  };

  // The ts the vital most recently LEFT the bad band, per rule. When
  // (now - returnedAt[rule]) ≥ COOLDOWN_MS, the rule re-arms.
  private returnedAt: Record<AlertRule, number | null> = {
    lowSpo2: null,
    highHr: null,
    lowHr: null,
  };

  private prefs: EmergencyPrefs | null = null;
  private onAlert: ((a: EmergencyAlert) => void) | null = null;

  async start(onAlert: (a: EmergencyAlert) => void): Promise<void> {
    this.onAlert = onAlert;
    this.prefs = await emergencyPrefs.read();
  }

  /**
   * Fire a fake alert through the same callback the real detector uses, so
   * the user can verify the whole SMS + dialler flow end-to-end from the
   * Emergency Settings screen without waiting for a real low-SpO2 reading.
   */
  fireTestAlert(rule: AlertRule = 'lowSpo2'): void {
    const sample: EmergencyAlert = rule === 'lowSpo2'
      ? { rule: 'lowSpo2', severity: 'warn', value: 87, since: Date.now() - 65_000,
          reason: 'a test alert — SpO2 reading at 87% (test)' }
      : rule === 'highHr'
        ? { rule: 'highHr', severity: 'warn', value: 134, since: Date.now() - 65_000,
            reason: 'a test alert — heart rate at 134 bpm (test)' }
        : { rule: 'lowHr', severity: 'warn', value: 45, since: Date.now() - 65_000,
            reason: 'a test alert — heart rate at 45 bpm (test)' };
    this.onAlert?.(sample);
  }

  /** Call whenever the user saves the settings form so we pick up the new values. */
  async reloadPrefs(): Promise<void> {
    this.prefs = await emergencyPrefs.read();
  }

  ingestHr(bpm: number, ts: number = Date.now()): void {
    this.hr.push({ ts, value: bpm });
    this.trim(this.hr, ts);
    this.evaluate(ts);
  }

  ingestSpo2(pct: number, ts: number = Date.now()): void {
    this.spo2.push({ ts, value: pct });
    this.trim(this.spo2, ts);
    this.evaluate(ts);
  }

  private trim(buf: VitalSample[], now: number): void {
    const cutoff = now - WINDOW_MS;
    while (buf.length > 0 && buf[0].ts < cutoff) buf.shift();
  }

  private evaluate(now: number): void {
    const prefs = this.prefs;
    if (!prefs || !prefs.enabled || !this.onAlert) return;

    const { rules, thresholds } = prefs;
    const sustainedMs = Math.max(5_000, thresholds.sustainedSeconds * 1000);

    if (rules.lowSpo2 && this.spo2.length > 0) {
      this.check(
        'lowSpo2', this.spo2, now, sustainedMs,
        (v) => v < thresholds.spo2LowPct,
        (v) => v < thresholds.spo2CriticalPct,
        (v) => `your SpO2 reading at ${v.toFixed(0)}% (resting threshold ${thresholds.spo2LowPct}%)`,
      );
    }

    if (rules.highHr && this.hr.length > 0) {
      this.check(
        'highHr', this.hr, now, sustainedMs,
        (v) => v > thresholds.hrHighBpm,
        () => false,  // no auto-escalate band for high HR — questionnaire first
        (v) => `your heart rate at ${v.toFixed(0)} bpm (resting threshold ${thresholds.hrHighBpm} bpm)`,
      );
    }

    if (rules.lowHr && this.hr.length > 0) {
      this.check(
        'lowHr', this.hr, now, sustainedMs,
        (v) => v < thresholds.hrLowBpm,
        (v) => v < thresholds.hrCriticalLowBpm,
        (v) => `your heart rate at ${v.toFixed(0)} bpm (resting threshold ${thresholds.hrLowBpm} bpm)`,
      );
    }
  }

  private check(
    rule: AlertRule,
    buf: VitalSample[],
    now: number,
    sustainedMs: number,
    outOfBand: (v: number) => boolean,
    critical: (v: number) => boolean,
    reasonOf: (v: number) => string,
  ): void {
    // Re-arm after cooldown.
    const last = buf[buf.length - 1];
    if (this.firing[rule] != null) {
      if (last && !outOfBand(last.value)) {
        if (this.returnedAt[rule] == null) this.returnedAt[rule] = now;
        else if (now - (this.returnedAt[rule] as number) >= COOLDOWN_MS) {
          this.firing[rule] = null;
          this.returnedAt[rule] = null;
        }
      } else {
        this.returnedAt[rule] = null;
      }
      return;
    }

    // Find the earliest sample that breaks the threshold and see if every
    // sample since has stayed out of band. If so, we have a sustained event.
    let breachStart: number | null = null;
    for (let i = buf.length - 1; i >= 0; i--) {
      if (outOfBand(buf[i].value)) breachStart = buf[i].ts;
      else break;
    }
    if (breachStart == null) return;
    if (now - breachStart < sustainedMs) return;

    const severity: AlertSeverity = critical(last.value) ? 'critical' : 'warn';
    this.firing[rule] = now;
    this.returnedAt[rule] = null;

    this.onAlert?.({
      rule,
      severity,
      value: last.value,
      since: breachStart,
      reason: reasonOf(last.value),
    });
  }
}

/** One shared watcher — the whole app has one body. */
export const vitalsSafetyWatcher = new VitalsSafetyWatcher();
