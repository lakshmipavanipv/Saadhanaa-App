/**
 * RingLink — one supervisor that keeps the paired ring connected, for the
 * whole app, for as long as the process is alive.
 *
 * Why this exists
 * ---------------
 * Reconnecting used to live inside JapaRingCounter, which only exists while
 * the Japa tab is mounted. Everything else — ambient capture, the vitals
 * scheduler, the day close-out — connected once, and if the ring happened to
 * be out of range at that moment they stayed dead for the rest of the app
 * session. Worse, NOTHING in the app listened to the Bluetooth adapter, so
 * the three ways a link actually dies in real life all ended the same way:
 *
 *   • phone switched off / restarted  → adapter comes back, app does not
 *   • airplane mode on then off       → adapter comes back, app does not
 *   • ring switched off then on       → ring advertises again, app does not look
 *
 * In each case the phone's own Bluetooth settings found the ring immediately
 * and the app did not, which reads — fairly — as a bug in the app.
 *
 * What it does
 * ------------
 * Holds a single intent ("the paired ring should be connected") and drives it
 * from three signals: the adapter's own state, the app returning to the
 * foreground, and the link dropping. It connects BY ADDRESS and never scans:
 * a saved ring is a known peripheral, and `connectToDevice()` on a MAC works
 * whether or not we have seen an advertisement. Scanning first was the reason
 * a ring the phone could see plainly was "not found" by the app — a missed
 * advertising packet during a 15 s window is enough, and the ring only
 * advertises when it is not already connected to something.
 *
 * It deliberately does NOT own the connection: SadhanaRing keeps one instance
 * per device and ref-counts holders, so the Japa counter, the vitals sync and
 * this supervisor can all ask for the same ring and the link is opened once.
 * This holder is simply the one that never lets go.
 */

import { AppState, AppStateStatus } from 'react-native';
import { State } from 'react-native-ble-plx';
import { SadhanaRing } from './SadhanaRing';
import { getBleManager } from './transport';
import { readSr16DeviceId } from './japaCounter';
import { startRingService, stopRingService, isRingServiceAvailable } from '../../../modules/ring-link';

export type RingLinkState =
  | 'idle'          // supervisor not started
  | 'unpaired'      // no ring saved — nothing to connect to
  | 'bluetooth-off' // adapter off / airplane mode; waiting for it to come back
  | 'connecting'
  | 'connected'
  | 'waiting';      // ring not reachable (off, charging, out of range) — retrying

/**
 * Retry cadence. Fast at first because the common case is a blip — a dropped
 * link while the ring is on the finger comes back within a second or two.
 *
 * The slow ceiling matters as much as the fast start: "ring switched off
 * overnight" must not mean a connect attempt every five seconds until
 * morning. Each attempt powers up the radio for up to 10 s, so an unbounded
 * fast retry is a measurable battery drain for no benefit — the ring cannot
 * answer while it is off.
 */
const FAST_MS = 600;
const FAST_ATTEMPTS = 8;
const MAX_MS = 8_000;
/** After this many failures we assume the ring is away, not blipping. */
const PATIENT_AFTER = 20;
const PATIENT_MS = 45_000;

export interface RingLinkStatus {
  state: RingLinkState;
  /** Consecutive failed attempts; 0 while connected. */
  attempts: number;
  lastError: string | null;
  lastConnectedAt: number | null;
}

type Listener = (s: RingLinkStatus) => void;

class RingLinkSupervisor {
  private started = false;
  private ring: SadhanaRing | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private connecting = false;
  private adapterOn = false;
  private status: RingLinkStatus = {
    state: 'idle',
    attempts: 0,
    lastError: null,
    lastConnectedAt: null,
  };

  private listeners = new Set<Listener>();
  private offState: (() => void) | null = null;
  private offAppState: (() => void) | null = null;
  private offDisconnect: (() => void) | null = null;

  getStatus(): RingLinkStatus {
    return this.status;
  }

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.status);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit(patch: Partial<RingLinkStatus>): void {
    this.status = { ...this.status, ...patch, attempts: patch.attempts ?? this.attempts };
    for (const fn of this.listeners) {
      try {
        fn(this.status);
      } catch {
        /* one bad listener must not stop the others */
      }
    }
  }

  /** Idempotent — App.tsx calls it once, but a remount must not start a second loop. */
  start(): void {
    if (this.started) return;
    this.started = true;

    // `true` asks ble-plx to emit the CURRENT state immediately as well as
    // subsequent changes, so a cold start with Bluetooth already on doesn't
    // sit waiting for a change that never comes.
    const sub = getBleManager().onStateChange((s) => this.handleAdapterState(s), true);
    this.offState = () => sub.remove();

    const appSub = AppState.addEventListener('change', (st: AppStateStatus) => {
      // Coming back to the foreground is the strongest hint we have that the
      // user expects the ring to be live right now — Android may also have
      // torn the link down while we were away without telling us.
      if (st === 'active') this.retryNow('foreground');
    });
    this.offAppState = () => appSub.remove();
  }

  stop(): void {
    this.started = false;
    this.clearTimer();
    this.offState?.();
    this.offAppState?.();
    this.offDisconnect?.();
    this.offState = this.offAppState = this.offDisconnect = null;
    this.releaseRing();
    this.emit({ state: 'idle' });
  }

  private handleAdapterState(s: State): void {
    const on = s === State.PoweredOn;
    const was = this.adapterOn;
    this.adapterOn = on;

    if (!on) {
      // Airplane mode, Bluetooth toggled off, or the adapter resetting after a
      // phone restart. The link is gone either way; stop retrying into a dead
      // radio and wait for it to come back.
      this.clearTimer();
      this.releaseRing();
      this.emit({ state: 'bluetooth-off', lastError: null });
      return;
    }

    // Off → on. This is the transition nothing used to watch.
    if (!was) {
      this.attempts = 0;
      this.retryNow('bluetooth-on');
    } else if (!this.ring && !this.connecting && !this.timer) {
      void this.attempt();
    }
  }

  /** Drop the backoff and try immediately. Safe to call from anywhere. */
  retryNow(_reason: string): void {
    if (!this.started || !this.adapterOn) return;
    if (this.ring || this.connecting) return;
    this.clearTimer();
    this.attempts = 0;
    void this.attempt();
  }

  /**
   * Called when a ring is paired or unpaired so the supervisor picks up the
   * new target without waiting out a backoff (or keeps holding a link to a
   * ring that is no longer ours).
   */
  pairingChanged(): void {
    this.releaseRing();
    this.attempts = 0;
    this.retryNow('pairing-changed');
  }

  private async attempt(): Promise<void> {
    if (!this.started || this.connecting || this.ring || !this.adapterOn) return;

    const deviceId = await readSr16DeviceId();
    if (!deviceId) {
      // Nothing to reconnect to. The pairing screen calls pairingChanged()
      // once there is, so this is a rest state and not a failure to retry.
      // Hold no service open for it either: a permanent notification saying
      // we are keeping a ring connected, when no ring is paired, is a lie the
      // user has to look at all day.
      this.ensureService(false);
      this.emit({ state: 'unpaired', lastError: null });
      return;
    }

    // A ring is paired, so the process should survive the app being closed.
    // Asserted on every attempt rather than once: Android can stop the
    // service under memory pressure, and start() on a running service is a
    // cheap no-op.
    this.ensureService(true);

    this.connecting = true;
    this.emit({ state: 'connecting' });
    try {
      const ring = await SadhanaRing.connect(deviceId);
      this.ring = ring;
      this.attempts = 0;
      this.offDisconnect?.();
      this.offDisconnect = ring.onDisconnect(() => {
        this.ring = null;
        this.offDisconnect = null;
        if (this.started) this.scheduleRetry();
        this.emit({ state: 'waiting' });
      });
      this.emit({ state: 'connected', lastError: null, lastConnectedAt: Date.now(), attempts: 0 });
    } catch (err) {
      this.attempts++;
      this.emit({ state: 'waiting', lastError: (err as Error)?.message ?? 'connect failed' });
      this.scheduleRetry();
    } finally {
      this.connecting = false;
    }
  }

  private scheduleRetry(): void {
    if (!this.started || this.timer || !this.adapterOn) return;
    const n = this.attempts;
    const delay =
      n >= PATIENT_AFTER
        ? PATIENT_MS
        : n <= FAST_ATTEMPTS
          ? FAST_MS
          : Math.min(MAX_MS, FAST_MS * 2 ** (n - FAST_ATTEMPTS));
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.attempt();
    }, delay);
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * Bring the Android foreground service in line with whether we have a ring
   * to keep connected.
   *
   * Best-effort and never fatal: on a build without the native module (or on
   * iOS) this does nothing at all, and the supervisor still works normally
   * for as long as the app is open. The background guarantee is the only
   * thing lost.
   */
  private ensureService(wanted: boolean): void {
    if (!isRingServiceAvailable() || this.serviceWanted === wanted) return;
    this.serviceWanted = wanted;
    try {
      if (wanted) startRingService();
      else stopRingService();
    } catch {
      /* the service is an optimisation, not a dependency */
    }
  }

  private serviceWanted: boolean | null = null;

  /**
   * Let go of our hold on the shared ring without tearing down a link someone
   * else (the japa counter, a vitals sync) is still using — SadhanaRing
   * ref-counts, so this only closes the GATT link if we were the last holder.
   */
  private releaseRing(): void {
    const ring = this.ring;
    this.ring = null;
    this.offDisconnect?.();
    this.offDisconnect = null;
    if (ring) void ring.disconnect().catch(() => { /* already gone */ });
  }
}

export const ringLink = new RingLinkSupervisor();
