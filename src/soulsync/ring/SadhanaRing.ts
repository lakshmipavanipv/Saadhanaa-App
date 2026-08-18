/**
 * SadhanaRing — the SDK's top-level facade.
 *
 * Composition:
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │            feature APIs (device/health/activity/…)            │
 *   ├──────────────────────────────────────────────────────────────┤
 *   │                    RingCommandQueue                           │
 *   │      (ACK matching, retries, multi-packet reassembly)         │
 *   ├──────────────────────────────────────────────────────────────┤
 *   │  codec (Jieli 0xAB frame + CRC16/ARC)   ⇆   opcode registry   │
 *   ├──────────────────────────────────────────────────────────────┤
 *   │                    RingBleTransport                           │
 *   │        (react-native-ble-plx; a00a / b002 / b003)             │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Typical use in the app:
 *
 *   const ring = await SadhanaRing.connectByScan();
 *   const battery = await ring.device.getBattery();
 *   const hr = await ring.health.startContinuousHr();
 *   ring.onDisconnect(() => setUiOffline());
 */

import {
  connectRing,
  scanForRings,
  requestRingPermissions,
  waitForBluetoothOn,
  type ConnectedRing,
  type ScannedRing,
  type RingPlatform,
} from './transport';
import { RingCommandQueue } from './sendQueue';
import type { JieliFrame } from './codec';
import { DeviceApi } from './device';
import { SyncApi } from './sync';
import { RemindersApi } from './reminders';
import { OtaApi } from './ota';
import { OledApi } from './oled';
import { OP_INFO_6_9_0 } from './opcodes.generated';

/**
 * Keep-alive payload observed in the RWfit capture. The ring drops the BLE
 * link after ~7 s of silence otherwise (Android supervision timeout).
 *
 * NOTE: On rings with a touch-cyclable OLED display, this frame appears to
 * pin the on-ring view to whatever `[03 05 01]` selects (likely HR/HRV
 * monitor). Callers can disable keep-alive at connect() time if they want
 * the user to freely cycle modes on the ring — the trade-off is the link
 * may drop after ~7 s of silence.
 */
const KEEPALIVE_PAYLOAD = new Uint8Array([0x03, 0x05, 0x01]);
// 500ms keep-alive — user asked for "live" connection so the ring never
// approaches its ~7s supervision timeout. Keep-alive frames are the observed
// {6,9,0} heartbeat and are filtered at notifyFrame so subscribers never
// see them; they're pure link-warm traffic and don't inflate tap counts.
const KEEPALIVE_INTERVAL_MS = 500;

export interface ConnectOptions {
  onFrame?: FrameObserver;
  /**
   * Send the observed keep-alive frame every 3 s while connected. Default
   * `false` — the payload `[03 05 01]` pins the on-ring OLED to HR/HRV
   * monitor and blocks the touch cycle. Enable only for long-running use
   * cases where losing the BLE link is worse than losing touch input.
   */
  keepAlive?: boolean;
}

export interface SadhanaRingInfo {
  id: string;
  platform: RingPlatform;
  mtu: number;
  dataServiceUuid: string;
  writeCharUuid: string;
  notifyCharUuid: string;
  services: ConnectedRing['services'];
}

export type FrameObserver = (frame: JieliFrame) => void;

export class SadhanaRing {
  readonly device: DeviceApi;
  readonly sync: SyncApi;
  readonly reminders: RemindersApi;
  readonly ota: OtaApi;
  readonly oled: OledApi;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private frameSubs = new Set<FrameObserver>();

  private constructor(
    private readonly ring: ConnectedRing,
    readonly queue: RingCommandQueue
  ) {
    this.device = new DeviceApi(this);
    this.sync = new SyncApi(this);
    this.reminders = new RemindersApi(this);
    this.ota = new OtaApi(this);
    this.oled = new OledApi(this);
  }

  /**
   * Subscribe to every non-keep-alive frame the ring sends. Returns an
   * unsubscribe function. Used by higher layers (e.g. JapaScreen) to react
   * to ring events like tap/button-press once their opcode is identified.
   */
  onFrame(handler: FrameObserver): () => void {
    this.frameSubs.add(handler);
    return () => this.frameSubs.delete(handler);
  }

  private notifyFrame(frame: JieliFrame): void {
    // Suppress keep-alive noise ({6, 9, 0}) so subscribers only see real events.
    if (frame.cmd === 0x06 && frame.key === 0x09 && frame.keyFlag === 0x00) return;
    for (const h of this.frameSubs) {
      try { h(frame); } catch { /* isolate subscriber errors */ }
    }
  }

  /**
   * Send text to the ring's OLED (first 2 chars typical, e.g. deity initials).
   * TODO(HARDWARE): Real implementation requires bitmap-render + CMD 7 file
   * transfer per the RWfit dial protocol. This currently only records the
   * intent so callers can start using the API; wire the real transport once
   * the OLED opcode is verified live.
   */
  async setDisplayText(text: string): Promise<void> {
    // No-op for now — logged so downstream code paths remain valid.
    // eslint-disable-next-line no-console
    console.log('[SadhanaRing] setDisplayText (stub — needs bitmap+CMD7):', text.slice(0, 2));
  }

  /**
   * Fire {6,9,0} with the observed [03 05 01] payload on a loop so the ring's
   * supervision timer doesn't trip. Idempotent — safe to call twice.
   */
  private startKeepAlive(): void {
    if (this.keepAliveTimer) return;
    this.keepAliveTimer = setInterval(() => {
      // Fire-and-forget — a missed ACK isn't fatal, the NEXT one will land
      // (or the disconnect handler will clean up).
      this.queue
        .send(OP_INFO_6_9_0, KEEPALIVE_PAYLOAD, { expectReply: true, timeoutMs: 1500, maxRetries: 0 })
        .catch(() => {
          /* swallow — keep-alive shouldn't spam errors */
        });
    }, KEEPALIVE_INTERVAL_MS);
  }

  private stopKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  static async requestPermissions(): Promise<boolean> {
    if (!(await requestRingPermissions())) return false;
    return waitForBluetoothOn();
  }

  /**
   * Fire-and-forget scan. Caller drives the UI (pick a candidate) and then
   * calls `SadhanaRing.connect(id)` with the chosen device id.
   */
  static scan(
    onCandidate: (r: ScannedRing) => void,
    onError: (err: string) => void,
    opts?: { timeoutMs?: number; permissive?: boolean }
  ): () => void {
    return scanForRings(onCandidate, onError, opts);
  }

  /**
   * Convenience: scan → auto-connect to the strongest matching candidate
   * within `settleMs`. Prefer showing a picker in production UIs.
   */
  static async connectByScan(opts: { settleMs?: number } = {}): Promise<SadhanaRing> {
    const settleMs = opts.settleMs ?? 4000;
    if (!(await SadhanaRing.requestPermissions())) {
      throw new Error('bluetooth permission denied');
    }
    const candidates: ScannedRing[] = [];
    await new Promise<void>((resolve, reject) => {
      const stop = scanForRings(
        (r) => candidates.push(r),
        (err) => {
          stop();
          reject(new Error(err));
        }
      );
      setTimeout(() => {
        stop();
        resolve();
      }, settleMs);
    });
    if (candidates.length === 0) throw new Error('no rings found');
    candidates.sort((a, b) => (b.rssi ?? -999) - (a.rssi ?? -999));
    return SadhanaRing.connect(candidates[0].id);
  }

  /**
   * Per-device singleton registry. BLE peripherals (and specifically the
   * SR16) accept only ONE central connection at a time, and the underlying
   * notification stream is delivered to whichever subscriber attached first.
   * If two screens each build their own SadhanaRing for the same deviceId,
   * only one will actually receive frames — the other's callbacks silently
   * go dark. This map ensures every caller shares the same live instance.
   */
  private static instances = new Map<string, SadhanaRing>();

  /**
   * How many callers currently hold this connection. Because the instance is
   * shared, the GATT link must survive until the LAST holder releases it:
   * the japa counter keeps the link open for a whole session while the vitals
   * scheduler connects and disconnects on its own cadence, and an unbalanced
   * teardown there would silently stop bead counting mid-session.
   *
   * Every `connect()` adds a reference; every `disconnect()` removes one and
   * only the final release actually tears the link down.
   */
  private refs = 0;

  static async connect(deviceId: string, opts: ConnectOptions = {}): Promise<SadhanaRing> {
    const { onFrame, keepAlive = false } = opts;

    // Reuse an existing live instance if there is one for this device.
    // Both Ring Debug and Japa call connect() with the same id — the second
    // call would otherwise create a shadow instance whose queue subscribes
    // to the notify char but never gets fed by the BleManager stream.
    const existing = SadhanaRing.instances.get(deviceId);
    if (existing) {
      existing.refs += 1;
      if (onFrame) existing.frameSubs.add(onFrame);
      if (keepAlive) existing.startKeepAlive();
      return existing;
    }

    const ring = await connectRing(deviceId);
    const sr: { instance?: SadhanaRing } = {};
    const queue = new RingCommandQueue(ring, {
      onIncomingFrame: (f) => {
        onFrame?.(f);
        sr.instance?.notifyFrame(f);
      },
    });
    queue.attach();
    sr.instance = new SadhanaRing(ring, queue);
    sr.instance.refs = 1;
    if (keepAlive) sr.instance.startKeepAlive();
    // Register + auto-evict on disconnect so the next connect() rebuilds fresh.
    SadhanaRing.instances.set(deviceId, sr.instance);
    const sub = ring.onDisconnect(() => {
      sr.instance?.stopKeepAlive();
      if (sr.instance) sr.instance.refs = 0;
      SadhanaRing.instances.delete(deviceId);
    });
    (sr.instance as unknown as { _disconnectSub: typeof sub })._disconnectSub = sub;
    return sr.instance;
  }

  /** Toggle keep-alive at runtime (useful for debug + ring-mode cycling). */
  setKeepAlive(on: boolean): void {
    if (on) this.startKeepAlive();
    else this.stopKeepAlive();
  }

  isKeepAliveOn(): boolean { return this.keepAliveTimer !== null; }

  get info(): SadhanaRingInfo {
    return {
      id: this.ring.device.id,
      platform: this.ring.platform,
      mtu: this.ring.mtu,
      dataServiceUuid: this.ring.dataServiceUuid,
      writeCharUuid: this.ring.writeCharUuid,
      notifyCharUuid: this.ring.notifyCharUuid,
      services: this.ring.services,
    };
  }

  onDisconnect(cb: () => void): () => void {
    const sub = this.ring.onDisconnect(() => cb());
    return () => sub.remove();
  }

  /**
   * Release this caller's reference. The physical link is only torn down once
   * every holder has released it — see `refs`.
   */
  async disconnect(): Promise<void> {
    this.refs -= 1;
    if (this.refs > 0) return;
    this.refs = 0;
    this.stopKeepAlive();
    this.queue.detach();
    // Remove from registry BEFORE the low-level disconnect so re-connect()
    // during the tear-down window doesn't return this dying instance.
    SadhanaRing.instances.delete(this.ring.device.id);
    await this.ring.disconnect();
  }

  /** Force a full teardown regardless of outstanding references. */
  async forceDisconnect(): Promise<void> {
    this.refs = 0;
    this.stopKeepAlive();
    this.queue.detach();
    SadhanaRing.instances.delete(this.ring.device.id);
    await this.ring.disconnect();
  }
}
