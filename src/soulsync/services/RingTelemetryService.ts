/**
 * RingTelemetryService — pluggable abstraction over the Soulsync smart ring.
 *
 * Two implementations:
 *   • MockRingService — software simulator producing physiologically plausible
 *     BPM + R-R intervals. Models "stress → relaxation → peak" arc during a
 *     meditation session so the UI / analytics can be exercised without hardware.
 *   • BleRingService (placeholder) — wraps `react-native-ble-plx` for the
 *     real ring. Parses the standard 0x2A37 Heart Rate Measurement packet.
 */

export interface RingSample {
  bpm: number;
  rrMs: number[];      // 0..N RR-intervals in ms per packet (typically 1)
  receivedAt: number;  // epoch ms
}

export type SampleHandler = (s: RingSample) => void;

export interface RingService {
  isMock: boolean;
  start(onSample: SampleHandler, mode?: 'ambient' | 'session'): Promise<void>;
  stop(): Promise<void>;
}

// ────────────────────────────────────────────────────────────────────
// MockRingService — software simulator
// ────────────────────────────────────────────────────────────────────

const MS_PER_MIN = 60_000;

/**
 * Realistic arc:
 *   t = 0…30s    → "stress baseline": ~78bpm, low HRV (small jitter)
 *   t = 30…90s   → slow drift toward 68bpm with growing jitter
 *   t = 90s+     → settled meditation: ~64bpm, larger jitter (high HRV)
 *
 * Jitter is what creates RMSSD — bigger jitter = higher RMSSD = "relaxation".
 */
const bpmCurve = (elapsedMs: number, mode: 'ambient' | 'session'): { bpm: number; jitter: number } => {
  if (mode === 'ambient') {
    // Slow drift around 72 bpm — simulates a normal day
    const t = elapsedMs / MS_PER_MIN;
    const bpm = 72 + Math.sin(t / 8) * 4 + (Math.random() - 0.5) * 2;
    return { bpm, jitter: 18 };  // moderate HRV when resting
  }
  // session mode — arc from stress to calm
  const t = elapsedMs / 1000;
  if (t < 30)       return { bpm: 78 - t * 0.05, jitter: 12 };
  else if (t < 90)  return { bpm: 78 - (t - 30) * 0.18, jitter: 12 + (t - 30) * 0.35 };
  else              return { bpm: 64 + Math.sin(t / 15) * 2, jitter: 35 + Math.sin(t / 20) * 6 };
};

export class MockRingService implements RingService {
  readonly isMock = true;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private startedAt = 0;

  async start(onSample: SampleHandler, mode: 'ambient' | 'session' = 'session'): Promise<void> {
    this.startedAt = Date.now();

    const tick = () => {
      const elapsed = Date.now() - this.startedAt;
      const { bpm, jitter } = bpmCurve(elapsed, mode);
      const meanRR = MS_PER_MIN / bpm;
      // Gaussian-ish jitter around the mean RR — produces HRV in RMSSD
      const rr = Math.max(300, Math.min(2000, meanRR + (Math.random() - 0.5) * jitter * 2));
      const sample: RingSample = {
        bpm: Math.round(bpm),
        rrMs: [rr],
        receivedAt: Date.now(),
      };
      onSample(sample);
      // Schedule next packet ~1 beat later
      this.timer = setTimeout(tick, rr);
    };
    tick();
  }

  async stop(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

// ────────────────────────────────────────────────────────────────────
// BleRingService — real hardware adapter (placeholder, wired once PCB ships)
// ────────────────────────────────────────────────────────────────────

import { BleManager, Device } from 'react-native-ble-plx';
import { Buffer } from 'buffer';

const HR_SERVICE = '0000180d-0000-1000-8000-00805f9b34fb';
const HR_CHAR    = '00002a37-0000-1000-8000-00805f9b34fb';

const parseHRPacket = (b64: string): RingSample => {
  const buf = Buffer.from(b64, 'base64');
  const flags = buf[0];
  const is16 = !!(flags & 0x01);
  let off = 1;
  const bpm = is16 ? buf.readUInt16LE(off) : buf[off];
  off += is16 ? 2 : 1;
  if (flags & 0x04) off += 1;
  if (flags & 0x08) off += 2;
  const rrMs: number[] = [];
  if (flags & 0x10) {
    while (off + 1 < buf.length) {
      rrMs.push((buf.readUInt16LE(off) * 1000) / 1024);
      off += 2;
    }
  }
  return { bpm, rrMs, receivedAt: Date.now() };
};

export class BleRingService implements RingService {
  readonly isMock = false;
  private manager = new BleManager();
  private device: Device | null = null;
  private subscription: { remove(): void } | null = null;

  constructor(private deviceId: string) {}

  async start(onSample: SampleHandler): Promise<void> {
    this.device = await this.manager.connectToDevice(this.deviceId);
    await this.device.discoverAllServicesAndCharacteristics();
    this.subscription = this.device.monitorCharacteristicForService(
      HR_SERVICE,
      HR_CHAR,
      (err, ch) => {
        if (err || !ch?.value) return;
        try { onSample(parseHRPacket(ch.value)); } catch { /* drop malformed */ }
      }
    );
  }

  async stop(): Promise<void> {
    this.subscription?.remove();
    this.subscription = null;
    if (this.device) await this.device.cancelConnection();
    this.device = null;
  }
}

// Default factory — flip to BleRingService once hardware is connected
export const createDefaultRing = (): RingService => new MockRingService();
