/**
 * JapaRingCounter — keeps a background SR16 connection open while the user
 * is on the Japa tab, and calls `onTap()` for every non-keep-alive frame
 * the ring sends (which happens on each physical bead touch).
 *
 * Connection lifecycle:
 *   • start() — reads saved deviceId, connects, subscribes to frames.
 *   • On disconnect — waits `reconnectMs` and retries up to `maxReconnects`.
 *   • stop() — cancels reconnect loop, disconnects cleanly.
 *
 * The persisted deviceId key matches the one RingDebugScreen writes to
 * (`sr16_last_device`). If no id is saved yet, start() throws — the caller
 * should send the user to Ring Debug to pair first.
 */

import { SadhanaRing } from './SadhanaRing';
import type { JieliFrame } from './codec';
import { Storage } from '../../storage';

const STORAGE_KEY = 'sr16_last_device';
// User asked for a "live" connection — retry fast + never actually give up.
// The ring's supervision timer is ~7s, so if we can reconnect within a
// couple of seconds after a drop, the user sees the pill stay green.
const RECONNECT_MS = 400;
const MAX_RECONNECTS = 40;              // effectively "keep trying"
const RECONNECT_BURST_WINDOW_MS = 30_000;

export const saveSr16DeviceId = (id: string): Promise<void> =>
  Storage.set(STORAGE_KEY, { id, savedAt: Date.now() });

export const readSr16DeviceId = async (): Promise<string | null> => {
  const rec = await Storage.get<{ id: string; savedAt: number } | null>(STORAGE_KEY, null);
  return rec?.id ?? null;
};

/**
 * Biggest jump we'll replay as live taps. Anything beyond this is treated as
 * "we were away" and left to japaHistorySync, which attributes counts by
 * timestamp instead of dumping them all into the current mala.
 */
const MAX_LIVE_DELTA = 108;

/**
 * Last absolute count in a realtime prayer-count payload.
 * Records are 8 bytes: [ringTs32_BE, count32_BE]. The final record is the
 * newest, so that's the ring's current total.
 */
const readLastCount = (payload: Uint8Array): number | null => {
  if (payload.length < 8) return null;
  const off = (Math.floor(payload.length / 8) - 1) * 8 + 4;
  return (
    ((payload[off] & 0xff) << 24) |
    ((payload[off + 1] & 0xff) << 16) |
    ((payload[off + 2] & 0xff) << 8) |
    (payload[off + 3] & 0xff)
  ) >>> 0;
};

export type TapHandler = () => void;

export interface CounterEvents {
  onTap: TapHandler;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (err: Error) => void;
}

export class JapaRingCounter {
  private ring: SadhanaRing | null = null;
  private events: CounterEvents;
  private deviceId: string;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastReconnectResetAt = 0;
  private stopped = false;
  private tapCount = 0;

  private constructor(deviceId: string, events: CounterEvents) {
    this.deviceId = deviceId;
    this.events = events;
  }

  static async start(events: CounterEvents): Promise<JapaRingCounter> {
    const deviceId = await readSr16DeviceId();
    if (!deviceId) {
      throw new Error('no SR16 paired — open Ring Debug and connect first');
    }
    const c = new JapaRingCounter(deviceId, events);
    await c.connect();
    return c;
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    try {
      // No keep-alive: the RWfit capture shows the ring holding the link
      // through 1254 s of total silence, so nothing needs to be sent to
      // stay connected. The old {6,9,0} loop here was re-arming a live HR
      // measurement twice a second and freezing the ring mid-japa.
      this.ring = await SadhanaRing.connect(this.deviceId);
      // Buzz once on successful (re)connect so the user gets a tactile
      // confirm that japa counting is armed. Fire-and-forget.
      void this.ring.device.vibrate(1).catch(() => { /* silent */ });
      this.events.onConnected?.();
      this.reconnectAttempts = 0;

      this.ring.onFrame((f) => this.handleFrame(f));

      // Auto-reconnect if the link drops (typical after ~7 s of no taps).
      this.ring.onDisconnect(() => {
        this.events.onDisconnected?.();
        this.ring = null;
        if (!this.stopped) this.scheduleReconnect();
      });
    } catch (err) {
      this.events.onError?.(err as Error);
      this.scheduleReconnect();
    }
  }

  private handleFrame(frame: JieliFrame): void {
    // Preferred path: the ring's realtime prayer-count push, {2,0x53,0}
    // (sendMsgId 46). Its records are [ringTs32_BE, count32_BE] and the
    // count is the ring's own ABSOLUTE running total — see E() in the RWfit
    // parser (x5/b.java:449, branch `b3 == 46`, records from offset 3).
    //
    // Anchoring to that number is what keeps the app and the ring agreeing.
    // Counting frames instead — which is what this did — drifts in both
    // directions: any unrelated notification inflated the count, and any
    // frame lost to a reconnect was dropped forever, with nothing to
    // correct it afterwards.
    if (frame.cmd === 0x02 && frame.key === 0x53 && frame.keyFlag === 0x00) {
      const ringCount = readLastCount(frame.payload);
      if (ringCount !== null) {
        this.applyRingCount(ringCount);
        return;
      }
    }

    // Anything else is NOT a bead. This used to fall through to "count it
    // as one tap", which was actively wrong: the japa counter and the vitals
    // sync share one ring connection, so every sync reply landed here and
    // added a phantom bead. Logcat caught it red-handed —
    //
    //   tap via unrecognised frame {5,5,16}    sleep sync reply
    //   tap via unrecognised frame {5,3,16}    HR sync reply
    //   tap via unrecognised frame {5,10,16}   HRV sync reply
    //   tap via unrecognised frame {2,11,0}    vibration reply
    //
    // — which is exactly why the app's number ran ahead of the ring's. The
    // {2,0x53,0} push above is confirmed working on this hardware, so there
    // is nothing left for a fallback to rescue.
    if (this.unknownFrameLogs < 8) {
      this.unknownFrameLogs++;
      // eslint-disable-next-line no-console
      console.log(
        `[JapaRingCounter] ignoring non-tap frame {${frame.cmd},${frame.key},${frame.keyFlag}}`
      );
    }
  }

  /**
   * Reconcile against the ring's absolute counter, emitting one onTap per
   * bead the ring counted since we last looked.
   */
  private applyRingCount(ringCount: number): void {
    // First reading establishes where the ring already is — we must NOT emit
    // `ringCount` itself, which is the ring's lifetime total and would dump
    // hundreds of beads into today's mala.
    //
    // But it isn't zero either: this push exists *because* a bead was just
    // touched, so exactly one tap is known to have happened. Swallowing the
    // whole event made the first touch after opening the tab do nothing,
    // which read as the counter being broken.
    if (this.lastRingCount === null) {
      this.lastRingCount = ringCount;
      this.tapCount += 1;
      // eslint-disable-next-line no-console
      console.log(`[JapaRingCounter] baseline set at ${ringCount}, counting this tap`);
      try { this.events.onTap(); } catch { /* isolate */ }
      return;
    }
    const delta = ringCount - this.lastRingCount;
    this.lastRingCount = ringCount;
    if (this.ringCountLogs < 8) {
      this.ringCountLogs++;
      // eslint-disable-next-line no-console
      console.log(`[JapaRingCounter] ring absolute count=${ringCount} delta=${delta}`);
    }

    // Ring reset (or rolled over) — re-baseline rather than emit a negative.
    if (delta <= 0) return;

    // A delta this large means we missed a long stretch offline; japaHistorySync
    // reconciles those properly, so don't flood the mala from here.
    if (delta > MAX_LIVE_DELTA) return;

    this.tapCount += delta;
    for (let i = 0; i < delta; i++) {
      try { this.events.onTap(); } catch { /* isolate */ }
    }
  }

  private lastRingCount: number | null = null;
  private unknownFrameLogs = 0;
  private ringCountLogs = 0;

  /** The ring's own counter as of the last push, or null if never seen. */
  getRingCount(): number | null { return this.lastRingCount; }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    // Rolling window: if the last burst of reconnects was more than
    // RECONNECT_BURST_WINDOW_MS ago, reset the counter — a long-lived
    // healthy connection shouldn't inherit stale retry state.
    const now = Date.now();
    if (now - this.lastReconnectResetAt > RECONNECT_BURST_WINDOW_MS) {
      this.reconnectAttempts = 0;
      this.lastReconnectResetAt = now;
    }
    if (this.reconnectAttempts >= MAX_RECONNECTS) return;
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, RECONNECT_MS);
  }

  getTapCount(): number { return this.tapCount; }
  isConnected(): boolean { return this.ring !== null; }

  /**
   * Push a deity abbreviation to the ring's OLED. Called from JapaScreen when
   * the user picks a different deity from the horizontal list. Best-effort —
   * failures are swallowed (typically because the OLED bitmap opcodes are not
   * accepted on some SR16 firmware variants).
   *
   * Currently DISABLED at the call site — the OLED bitmap opcodes have not
   * been verified against real SR16 firmware and observably drop the BLE
   * link when the write times out. Re-enable once the OLED command sequence
   * is confirmed via a live sweep.
   */
  async displayDeityLabel(name: string, chars: number = 2): Promise<void> {
    if (!this.ring) return;
    try {
      await this.ring.oled.setDeityDisplay(name, chars);
    } catch { /* silent — OLED support is optional */ }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.ring) { await this.ring.disconnect(); this.ring = null; }
  }
}
