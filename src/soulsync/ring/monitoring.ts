/**
 * Timed monitoring — tells the RING to measure on its own schedule.
 *
 * This is the piece the app was missing entirely, and it is why the history
 * channels came back empty no matter how often we polled them. The ring does
 * not record continuously. It records when it has been configured to, and
 * until that command is sent it stores only the occasional reading it took
 * for its own display.
 *
 * RWfit sends one command per metric, all sharing a layout
 * (com/google/android/gms/internal/mlkit_vision_common/p.java:291,
 * logged by the SDK as `getTimedHeartRateWCmdJL`):
 *
 *     b3.g((byte) -43, new byte[]{2, 22, 0,
 *          isOpen, startHour, startMin, endHour, endMin, intervalMinutes});
 *
 * Metric → opcode, each verified against the SDK's own command name:
 *
 *     HR              {2, 22,  0}   getTimedHeartRateWCmdJL
 *     SpO2            {2, 37,  0}   getTimedBloodOxygenWCmdJL
 *     Body temp       {2, 27,  0}   getTimedBodyTemperatureWCmdJL
 *     HRV             {2, 106, 0}   getTimedHRVCmdJL
 *     Stress          {2, 107, 0}   getTimedStressCmdJL
 *     Blood sugar     {2, 110, 0}   getTimedBloodSugarCmdJL
 *     Blood pressure  {2, 124, 0}   getTimedBloodPressureWCmdJL
 *
 * Note the read-back layout is NOT the mirror of the write: the reply puts a
 * 16-bit interval at offset 1 ([isOpen, interval16_BE, startH, startM, endH,
 * endM]) per x5/b.java:2490. Only the write is relied on here.
 */

import type { SadhanaRing } from './SadhanaRing';
import {
  OP_HEALTH_2_22_0,
  OP_HEALTH_2_37_0,
  OP_HEALTH_2_27_0,
  OP_HEALTH_2_106_0,
  OP_HEALTH_2_107_0,
  OP_HEALTH_2_110_0,
  OP_HEALTH_2_124_0,
  type Opcode,
} from './opcodes.generated';

/** Metrics the ring can be told to sample on a timer. */
export type MonitoredMetric = 'hr' | 'spo2' | 'temp' | 'hrv' | 'stress' | 'sugar' | 'bp';

const WRITE_OP: Record<MonitoredMetric, Opcode> = {
  hr:     OP_HEALTH_2_22_0,
  spo2:   OP_HEALTH_2_37_0,
  temp:   OP_HEALTH_2_27_0,
  hrv:    OP_HEALTH_2_106_0,
  stress: OP_HEALTH_2_107_0,
  sugar:  OP_HEALTH_2_110_0,
  bp:     OP_HEALTH_2_124_0,
};

export const MONITORED_METRICS = Object.keys(WRITE_OP) as MonitoredMetric[];

export interface MonitoringWindow {
  enabled: boolean;
  /** Local hour the ring starts sampling, 0-23. */
  startHour: number;
  startMin: number;
  /** Local hour it stops, 0-23. */
  endHour: number;
  endMin: number;
  /** Minutes between samples. RWfit's HrMonitorBean defaults to 10. */
  intervalMin: number;
}

const clampByte = (n: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, Math.round(n))) & 0xff;

/**
 * Metrics this firmware has already refused, so we stop paying for them.
 *
 * A rejected channel costs a full send timeout plus its retry on EVERY
 * connect — with a 2-minute sync cadence that is a permanent tax, and it is
 * the bulk of the delay when a detail screen opens. Body temperature does
 * this reliably on the SR16: {2,27,0} never answers, with either the boolean
 * or the weekday-mask encoding the SDK implies.
 *
 * Module-level so it survives reconnects but resets on app restart, which is
 * the right scope — a firmware update should get another chance.
 */
const unsupported = new Set<MonitoredMetric>();

export class MonitoringApi {
  constructor(private readonly ring: SadhanaRing) {}

  /**
   * Body temperature does not take a plain on/off byte.
   *
   * Its command builds byte 3 as an 8-bit mask from a binary string
   * (androidx/appcompat/app/t.java:202-211), MSB first:
   *
   *     [isOpen][day0][day6][day5][day4][day3][day2][day1]
   *
   * so "on, every day" is 0b11111111 = 0xFF, and off is 0x00. Sending a
   * plain 1 sets only the last weekday bit with isOpen clear — i.e. off —
   * which is why the ring timed out rather than acknowledging it.
   */
  private enableByte(metric: MonitoredMetric, enabled: boolean): number {
    if (metric !== 'temp') return enabled ? 1 : 0;
    return enabled ? 0xff : 0x00;
  }

  /** Configure one metric's on-ring sampling schedule. */
  async set(metric: MonitoredMetric, w: MonitoringWindow): Promise<void> {
    const payload = new Uint8Array([
      this.enableByte(metric, w.enabled),
      clampByte(w.startHour, 0, 23),
      clampByte(w.startMin, 0, 59),
      clampByte(w.endHour, 0, 23),
      clampByte(w.endMin, 0, 59),
      // 0 would mean "no interval" and the ring would never sample.
      clampByte(w.intervalMin, 1, 255),
    ]);
    await this.ring.queue.send(WRITE_OP[metric], payload, {
      expectReply: true,
      timeoutMs: 2500,
      maxRetries: 1,
    });
  }

  /**
   * Apply the same window to every metric.
   *
   * Failures are collected rather than thrown: firmware that doesn't support
   * one channel (blood sugar is often absent) should not stop the rest being
   * configured. Returns the metrics that were rejected.
   */
  async setAll(w: MonitoringWindow): Promise<MonitoredMetric[]> {
    const failed: MonitoredMetric[] = [];
    for (const metric of MONITORED_METRICS) {
      if (unsupported.has(metric)) continue;
      try {
        await this.set(metric, w);
        // eslint-disable-next-line no-console
        console.log(`[monitoring] ${metric}: every ${w.intervalMin}min ${w.enabled ? 'ON' : 'OFF'}`);
      } catch (e) {
        failed.push(metric);
        unsupported.add(metric);
        // eslint-disable-next-line no-console
        console.log(`[monitoring] ${metric}: rejected, not retrying — ${(e as Error).message}`);
      }
    }
    return failed;
  }
}
