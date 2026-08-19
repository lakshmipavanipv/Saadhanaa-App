/**
 * japaHistorySync — one-shot pull of the ring's stored tasbih/japa counter,
 * used to reconcile physical bead taps that happened while the phone was
 * not paired (or the Japa tab was closed).
 *
 * The ring firmware stores hourly snapshots of a MONOTONICALLY INCREASING
 * accumulator. We take (latest_count − last_seen_watermark) and hand the
 * caller the delta. First-ever sync seeds the watermark and returns 0.
 *
 *   • start a fresh BLE session (short — just one sync call)
 *   • read TasbihSample[] via SyncApi.sync('japa')
 *   • pick the newest sample's `count`
 *   • diff against the persisted watermark
 *   • persist the new watermark
 *   • return { delta, latestCount, lastTapAt }
 */

import { SadhanaRing } from './SadhanaRing';
import { readSr16DeviceId } from './japaCounter';
import type { TasbihSample } from './sync';
import { Storage } from '../../storage';

const WATERMARK_KEY = 'sr16_japa_watermark';

interface Watermark {
  count: number;
  ringTs: number;   // seconds since ring epoch
  savedAt: number;  // wall-clock ms
}

export interface JapaHistorySyncResult {
  /** New taps attributable since the last sync. 0 on first-ever run. */
  delta: number;
  /** Latest count reported by the ring (running total, ever). */
  latestCount: number;
  /** When the ring recorded that latest count. Null if no samples. */
  lastTapAt: Date | null;
  /** Whether this call seeded the first watermark. */
  firstRun: boolean;
  /** Error string if the sync bailed out; delta will be 0. */
  error?: string;
}

const empty = (): JapaHistorySyncResult => ({
  delta: 0,
  latestCount: 0,
  lastTapAt: null,
  firstRun: false,
});

/**
 * Pull the ring's tasbih history and return the tap-delta since last time.
 *
 * Safe to call from a screen effect — self-connects, self-disconnects, and
 * swallows all errors into the return value. Never throws.
 */
export async function syncJapaHistory(): Promise<JapaHistorySyncResult> {
  const deviceId = await readSr16DeviceId();
  if (!deviceId) return { ...empty(), error: 'no SR16 paired' };

  let ring: SadhanaRing | null = null;
  try {
    ring = await SadhanaRing.connect(deviceId);
  } catch (e) {
    return { ...empty(), error: `connect: ${(e as Error).message}` };
  }

  let samples: TasbihSample[] = [];
  try {
    const res = await ring.sync.sync<TasbihSample>('japa');
    samples = res.samples;
  } catch (e) {
    await ring.disconnect().catch(() => {});
    return { ...empty(), error: `japa sync: ${(e as Error).message}` };
  }
  await ring.disconnect().catch(() => {});

  if (samples.length === 0) return empty();

  // Ring records are already timestamp-sorted by the decoder, but be defensive.
  const sorted = [...samples].sort((a, b) => a.ringTs - b.ringTs);
  const latest = sorted[sorted.length - 1];

  const prev = await Storage.get<Watermark | null>(WATERMARK_KEY, null);
  const now: Watermark = { count: latest.count, ringTs: latest.ringTs, savedAt: Date.now() };
  await Storage.set(WATERMARK_KEY, now);

  if (!prev) {
    // First-ever sync: seed the watermark; don't back-fill history.
    return {
      delta: 0,
      latestCount: latest.count,
      lastTapAt: latest.timestamp,
      firstRun: true,
    };
  }

  // If the ring rolled over or was factory-reset, latest can be < prev.
  // Treat that as "start clean" — no phantom taps from a rollover.
  const delta = latest.count > prev.count ? latest.count - prev.count : 0;

  return {
    delta,
    latestCount: latest.count,
    lastTapAt: latest.timestamp,
    firstRun: false,
  };
}

/**
 * Read the last-seen ring count without touching BLE. Useful for showing
 * "you've done N since last sync" hints without triggering a scan.
 */
export async function readJapaWatermark(): Promise<Watermark | null> {
  return Storage.get<Watermark | null>(WATERMARK_KEY, null);
}

/**
 * Clear the persisted watermark. Call this when the user factory-resets
 * the ring or unpairs so a subsequent sync doesn't back-fill phantom taps.
 */
export async function clearJapaWatermark(): Promise<void> {
  await Storage.set(WATERMARK_KEY, null);
}
