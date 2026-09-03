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
import { MonitoringApi } from './monitoring';
import { OP_INFO_6_9_0 } from './opcodes.generated';

/**
 * `{6,9,0}` is NOT a keep-alive. It is the ring's live-measurement switch,
 * and misreading it as a heartbeat is what froze the hardware.
 *
 * Ground truth is the RWfit btsnoop capture (rwfit_capture/btsnoop_hci.log).
 * Over a 2951-second session the real app sent this frame 27 times, always
 * in ON/OFF pairs and never on a timer:
 *
 *     t=2426.88  TX 03 05 01     ← start live HR
 *     t=2434.02  TX 03 05 00     ← stop  live HR      (7 s later)
 *     t=2510.19  TX 0a 05 01     ← start live HRV
 *     t=2519.56  TX 0a 05 00     ← stop  live HRV     (9 s later)
 *
 * Payload is `[metric, 0x05, enable]`, and the metric byte matches the sync
 * cluster exactly: 0x03 HR, 0x09 SpO2, 0x0a HRV, 0x0d stress — the same
 * numbering as the {5,N,16} pull opcodes in sync.ts.
 *
 * We were sending `[03 05 01]` — "begin a live heart-rate measurement" —
 * every 500 ms forever and never sending the matching stop. The ring's
 * sensor loop was re-armed twice a second until it stopped responding,
 * which is the freeze users hit on the Japa tab (the only caller that had
 * keep-alive enabled).
 *
 * The premise behind the timer was also wrong: the ring does NOT drop after
 * ~7 s of silence. In the same capture RWfit sent nothing at all for 1254
 * consecutive seconds and the link survived, so no heartbeat is needed and
 * none is sent here.
 */
export type LiveMetric = 'hr' | 'spo2' | 'hrv' | 'stress';

const LIVE_METRIC_BYTE: Record<LiveMetric, number> = {
  hr: 0x03,
  spo2: 0x09,
  hrv: 0x0a,
  stress: 0x0d,
};

export interface ConnectOptions {
  onFrame?: FrameObserver;
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
  /** On-ring sampling schedule — see monitoring.ts. */
  readonly monitoring: MonitoringApi;
  /** Live measurements currently armed on the ring, so we can stop them. */
  private liveMetrics = new Set<LiveMetric>();
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
    this.monitoring = new MonitoringApi(this);
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
   * Start or stop a live (continuous) measurement on the ring — the real
   * meaning of {6,9,0}. See the LiveMetric notes at the top of this file.
   *
   * Every start MUST be paired with a stop, which is why callers should
   * prefer `withLiveMetric()` below. Leaving a measurement running is what
   * the old keep-alive loop effectively did, and the ring stops responding
   * when it happens.
   */
  async setLiveMetric(metric: LiveMetric, on: boolean): Promise<void> {
    const payload = new Uint8Array([LIVE_METRIC_BYTE[metric], 0x05, on ? 0x01 : 0x00]);
    await this.queue.send(OP_INFO_6_9_0, payload, {
      expectReply: true,
      timeoutMs: 2000,
      maxRetries: 0,
    });
    if (on) this.liveMetrics.add(metric);
    else this.liveMetrics.delete(metric);
  }

  /**
   * Run `fn` with a live measurement active, stopping it afterwards even if
   * `fn` throws. This is the only safe way to use setLiveMetric.
   */
  async withLiveMetric<T>(metric: LiveMetric, fn: () => Promise<T>): Promise<T> {
    await this.setLiveMetric(metric, true);
    try {
      return await fn();
    } finally {
      // Best-effort: if the stop fails the link is already in trouble, and
      // disconnect() below will send it again.
      await this.setLiveMetric(metric, false).catch(() => {});
    }
  }

  /**
   * Turn off anything still running. Called on disconnect so we never walk
   * away from the ring with its sensor loop armed.
   */
  private async stopAllLiveMetrics(): Promise<void> {
    for (const metric of [...this.liveMetrics]) {
      await this.setLiveMetric(metric, false).catch(() => {});
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

  /**
   * How many callers currently hold this link. A caller that sees `> 1` right
   * after `connect()` joined a link somebody else already opened and set up,
   * and should not re-run connection-time configuration on it.
   */
  get refCount(): number { return this.refs; }

  /** Set once connection-time configuration has been applied to this link. */
  private configured = false;

  /**
   * Claim the right to run connection-time configuration (clock push, health
   * monitor master switch). Returns true exactly once per physical link.
   *
   * The link is shared, so "did I just open this?" is not the same question as
   * "does this need configuring?" — and re-running that setup on a link the
   * japa counter is using costs a burst of reply-waiting commands on the
   * channel the ring pushes bead taps over.
   */
  claimSetup(): boolean {
    if (this.configured) return false;
    this.configured = true;
    return true;
  }

  /**
   * Connects that have not finished yet, keyed by device id.
   *
   * The registry above only helps once a connection is COMPLETE. Three callers
   * race for this link on a cold start — ambient ingestion at boot, the japa
   * counter when the tab opens, a Soulsync session when the user starts one —
   * and `connectRing()` takes seconds. Two callers arriving inside that window
   * both saw an empty registry and both opened a GATT connection to the same
   * peripheral, leaving a second queue attached to a notify subscription
   * nobody owned and double-ACKing every frame the ring sent.
   */
  private static pending = new Map<string, Promise<SadhanaRing>>();

  static async connect(deviceId: string, opts: ConnectOptions = {}): Promise<SadhanaRing> {
    const { onFrame } = opts;

    // Reuse an existing live instance if there is one for this device.
    // Both Ring Debug and Japa call connect() with the same id — the second
    // call would otherwise create a shadow instance whose queue subscribes
    // to the notify char but never gets fed by the BleManager stream.
    const existing = SadhanaRing.instances.get(deviceId);
    if (existing) {
      existing.refs += 1;
      if (onFrame) existing.frameSubs.add(onFrame);
      return existing;
    }

    const inFlight = SadhanaRing.pending.get(deviceId);
    if (inFlight) {
      const sr = await inFlight;
      sr.refs += 1;
      if (onFrame) sr.frameSubs.add(onFrame);
      return sr;
    }

    const attempt = SadhanaRing.open(deviceId, onFrame);
    SadhanaRing.pending.set(deviceId, attempt);
    try {
      return await attempt;
    } finally {
      SadhanaRing.pending.delete(deviceId);
    }
  }

  /** The actual open. Only ever called through `connect()`'s de-duplication. */
  private static async open(
    deviceId: string,
    onFrame: FrameObserver | undefined
  ): Promise<SadhanaRing> {
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
    // Register + auto-evict on disconnect so the next connect() rebuilds fresh.
    SadhanaRing.instances.set(deviceId, sr.instance);
    const sub = ring.onDisconnect(() => {
      // Link is already gone — just drop our record of what was armed.
      sr.instance?.liveMetrics.clear();
      if (sr.instance) sr.instance.refs = 0;
      SadhanaRing.instances.delete(deviceId);
    });
    (sr.instance as unknown as { _disconnectSub: typeof sub })._disconnectSub = sub;
    return sr.instance;
  }

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

    // If this object is no longer the registered instance for the device, the
    // link it described is already gone and something else has since opened a
    // NEW one. Falling through here would delete that new instance from the
    // registry and cancel its GATT connection on the way out — a stale holder
    // silently killing a live link.
    //
    // This is how ending a Soulsync session used to stop bead counting: the
    // session's ring handle was captured before a momentary drop, so by the
    // time `stop()` released it the japa counter had already reconnected, and
    // the release tore that reconnection down.
    if (SadhanaRing.instances.get(this.ring.device.id) !== this) {
      this.queue.detach();
      return;
    }

    await this.stopAllLiveMetrics();
    this.queue.detach();
    // Remove from registry BEFORE the low-level disconnect so re-connect()
    // during the tear-down window doesn't return this dying instance.
    SadhanaRing.instances.delete(this.ring.device.id);
    await this.ring.disconnect();
  }

  /** Force a full teardown regardless of outstanding references. */
  async forceDisconnect(): Promise<void> {
    this.refs = 0;
    await this.stopAllLiveMetrics();
    this.queue.detach();
    SadhanaRing.instances.delete(this.ring.device.id);
    await this.ring.disconnect();
  }
}
