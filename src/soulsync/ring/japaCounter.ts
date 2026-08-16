/**
 * JapaRingCounter — keeps a background SR16 connection open while the user
 * is on the Japa tab, and calls `onTap()` for every non-keep-alive frame
 * the ring sends (which happens on each physical bead touch).
 *
 * Connection lifecycle:
 *   • start() — reads saved deviceId, connects (keepAlive false so ring
 *               OLED doesn't lock to HRV), subscribes to frames.
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
const RECONNECT_MS = 800;
const MAX_RECONNECTS = 6;      // ~5 s of retries before giving up
const RECONNECT_BURST_WINDOW_MS = 15_000;

export const saveSr16DeviceId = (id: string): Promise<void> =>
  Storage.set(STORAGE_KEY, { id, savedAt: Date.now() });

export const readSr16DeviceId = async (): Promise<string | null> => {
  const rec = await Storage.get<{ id: string; savedAt: number } | null>(STORAGE_KEY, null);
  return rec?.id ?? null;
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
      this.ring = await SadhanaRing.connect(this.deviceId, { keepAlive: false });
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

  private handleFrame(_frame: JieliFrame): void {
    // Any frame that reaches us here is already keep-alive filtered by
    // SadhanaRing.notifyFrame. Physical bead taps generate spontaneous
    // ring→app frames — dispatch as a tap.
    //
    // The ring bursts a few frames per tap; a 250 ms coalesce window keeps
    // us at 1 mala-bead per touch instead of 3-4. Adjust if hardware differs.
    const now = Date.now();
    if (now - this.lastTapAt < 250) return;
    this.lastTapAt = now;
    this.tapCount++;
    try { this.events.onTap(); } catch { /* isolate */ }
  }

  private lastTapAt = 0;

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
