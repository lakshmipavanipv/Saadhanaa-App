/**
 * Historical-data sync (CMD 5). The ring computes and stores biometrics on
 * its own MCU; this module pulls those stored samples over BLE.
 *
 * Wire protocol (observed live from the RWfit capture):
 *   TX  {5, X, 0x10}  request       (empty payload)
 *   RX  {5, X, 0x10}  multi-packet data reply — repeating N-byte records
 *   TX  {5, X, 0x30}  ACK           (empty payload) — MUST be sent
 *   RX  {5, X, 0x30}  server-side confirm
 *
 * Metric → opcode → record layout (parser handlers in x5/b.java):
 *
 *   HR         {5, 3, 16}  V()   — 6 bytes: [ts32_LE, hr, pad]
 *   BloodPress {5, 4, 16}  T()   — 8 bytes: [ts32_LE, sp, dp, pad, pad]  *(layout inferred)*
 *   SpO2       {5, 5, 16}  S()   — 6 bytes: [ts32_LE, spo2, pad]         *(layout inferred)*
 *   BodyTemp   {5, 8, 16}  U()   — 8 bytes: [ts32_LE, temp16_LE, pad, pad] *(layout inferred)*
 *   HRV        {5, 10, 16} W()   — 6 bytes: [ts32_LE, hrv, pad]           *(layout inferred)*
 *   BloodSugar {5, 16, 16} R()   — 6 bytes: [ts32_LE, sugar, pad]         *(layout inferred)*
 *   Sleep      {5, 26, 16} — pre-classified segments  *(layout to be decoded)*
 *   Steps      {5, 23, 16} — hourly aggregate       *(layout to be decoded)*
 *
 * Timestamps: 4-byte LE offset from the ring's epoch, which is 2000-01-01
 * UTC = Unix 946684800 (+ small tz adjustment done by the RWfit app; here we
 * return the raw offset + a helper to convert to a Date).
 */

import type { SadhanaRing } from './SadhanaRing';
import { OP_SYNC_5_2_16 as _op, lookupOpcode, type Opcode } from './opcodes.generated';
import type { JieliFrame } from './codec';

const OP = (cmd: number, key: number, keyFlag: number): Opcode => {
  const op = lookupOpcode(cmd, key, keyFlag);
  if (!op) throw new Error(`opcode ${cmd}/${key}/${keyFlag} missing from registry`);
  return op;
};

// ── Ring epoch: 2000-01-01 UTC ───────────────────────────────────────────
export const RING_EPOCH_UNIX = 946_684_800;

export const ringTsToDate = (ringTs32Le: number): Date => new Date((RING_EPOCH_UNIX + ringTs32Le) * 1000);

const readU32LE = (b: Uint8Array, off: number): number =>
  (b[off] | (b[off + 1] << 8) | (b[off + 2] << 16) | (b[off + 3] << 24)) >>> 0;

/**
 * Timestamps in the ring's storage are big-endian, per y5.b.f() in RWfit
 * (the `length == 4` branch shifts bArr[0] << 24). We had this as LE
 * originally and got timestamps in 2084 / 2106 — fixed here.
 */
const readTs = (b: Uint8Array, off: number): number =>
  (((b[off] & 0xff) << 24) | ((b[off + 1] & 0xff) << 16) | ((b[off + 2] & 0xff) << 8) | (b[off + 3] & 0xff)) >>> 0;

// ── Sample types ────────────────────────────────────────────────────────
export interface TsSample {
  ringTs: number;         // seconds since 2000-01-01 UTC
  timestamp: Date;
}
export interface HrSample extends TsSample { hr: number; }
export interface Spo2Sample extends TsSample { spo2: number; }
export interface BpSample extends TsSample { systolic: number; diastolic: number; }
export interface HrvSample extends TsSample { hrv: number; }
export interface TempSample extends TsSample { tempCx10: number; }  // tenths of °C (0.1°C resolution)
export interface StressSample extends TsSample { stress: number; }
export interface SugarSample extends TsSample { sugar: number; }
export interface SleepSample extends TsSample {
  /** Raw sleep-model code from firmware. Map to a stage with `sleepModelToStage`. */
  sleepModel: number;
}
export interface StepSample extends TsSample {
  steps: number;
  calorieKcal: number;
  distanceKm: number;
}
export interface TasbihSample extends TsSample {
  /** Accumulated count as of `timestamp`. Ring stores hourly snapshots. */
  count: number;
}

/**
 * Raw sleep codes from `JLSleepSyncBean.sleepModel` → 4-stage classification.
 * Path B semantics per RWfit study §7.1 — session markers 17 (onset) / 34 (end)
 * are surfaced as their own sentinel stages so callers can compute totals.
 */
export type SleepStage = 'deep' | 'light' | 'rem' | 'awake' | 'onset' | 'end';
export function sleepModelToStage(code: number): SleepStage {
  switch (code) {
    case 1: return 'deep';
    case 2: return 'light';
    case 4: return 'rem';
    case 17: return 'onset';
    case 34: return 'end';
    // 0 and 3 are both awake per the study
    default: return 'awake';
  }
}

// ── Decoders ────────────────────────────────────────────────────────────
type Decoder<T> = (payload: Uint8Array) => T[];

const decode6ByteScalar = <T extends TsSample>(field: keyof Omit<T, 'ringTs' | 'timestamp'>): Decoder<T> => (
  payload
) => {
  const out: T[] = [];
  for (let off = 0; off + 6 <= payload.length; off += 6) {
    const ts = readTs(payload, off);
    const value = payload[off + 4] & 0xff;
    if (value === 0) continue; // skip empty slots — RWfit does the same
    out.push({ ringTs: ts, timestamp: ringTsToDate(ts), [field]: value } as unknown as T);
  }
  return out;
};

const decodeBp: Decoder<BpSample> = (payload) => {
  const out: BpSample[] = [];
  // Records are 8 bytes; layout inferred from BloodPressItemBean setters in T().
  for (let off = 0; off + 8 <= payload.length; off += 8) {
    const ts = readTs(payload, off);
    const sp = payload[off + 4] & 0xff;
    const dp = payload[off + 5] & 0xff;
    if (sp === 0 && dp === 0) continue;
    out.push({ ringTs: ts, timestamp: ringTsToDate(ts), systolic: sp, diastolic: dp });
  }
  return out;
};

const decodeTemp: Decoder<TempSample> = (payload) => {
  const out: TempSample[] = [];
  // 8-byte records; temperature is stored as a 16-bit LE integer in tenths of °C.
  for (let off = 0; off + 8 <= payload.length; off += 8) {
    const ts = readTs(payload, off);
    const t = (payload[off + 4] & 0xff) | ((payload[off + 5] & 0xff) << 8);
    if (t === 0) continue;
    out.push({ ringTs: ts, timestamp: ringTsToDate(ts), tempCx10: t });
  }
  return out;
};

const decodeSleep: Decoder<SleepSample> = (payload) => {
  // Z() handler — 7-byte records, byte 4 is sleepModel raw code.
  const out: SleepSample[] = [];
  for (let off = 0; off + 7 <= payload.length; off += 7) {
    const ts = readTs(payload, off);
    const sleepModel = payload[off + 4] & 0xff;
    out.push({ ringTs: ts, timestamp: ringTsToDate(ts), sleepModel });
  }
  return out;
};

const readU24BE = (b: Uint8Array, off: number): number =>
  ((b[off] & 0xff) << 16) | ((b[off + 1] & 0xff) << 8) | (b[off + 2] & 0xff);
const readU32BE = (b: Uint8Array, off: number): number =>
  (((b[off] & 0xff) << 24) | ((b[off + 1] & 0xff) << 16) | ((b[off + 2] & 0xff) << 8) | (b[off + 3] & 0xff)) >>> 0;

const decodeTasbih: Decoder<TasbihSample> = (payload) => {
  // X() handler at x5/b.java:1430 — 8-byte records: [ts32_BE, count32_BE].
  const out: TasbihSample[] = [];
  for (let off = 0; off + 8 <= payload.length; off += 8) {
    const ts = readTs(payload, off);
    const count = readTs(payload, off + 4);  // same BE-32 as timestamp
    if (count === 0) continue;
    out.push({ ringTs: ts, timestamp: ringTsToDate(ts), count });
  }
  return out;
};

const decodeSteps: Decoder<StepSample> = (payload) => {
  // a0() handler — 16-byte records: [ts32_LE, pad, steps24_BE, cal32_BE/10, dist32_BE/10000]
  const out: StepSample[] = [];
  for (let off = 0; off + 16 <= payload.length; off += 16) {
    const ts = readTs(payload, off);
    const steps = readU24BE(payload, off + 5);
    const calorie = readU32BE(payload, off + 8) / 10;    // kcal (stored as centi-kcal — /10 = kcal)
    const distance = readU32BE(payload, off + 12) / 10000; // km  (stored as cm — /10000 = km)
    if (steps === 0 && calorie === 0 && distance === 0) continue;
    out.push({
      ringTs: ts,
      timestamp: ringTsToDate(ts),
      steps,
      calorieKcal: calorie,
      distanceKm: distance,
    });
  }
  return out;
};

/**
 * Metric ↔ opcode table. Verified from the x5/b.java dispatcher in RWfit:
 *   -60 → a0() JLStepSyncBean   ⇒ {5, 2, 16}  steps
 *   -62 → V()  HeartRateItemBean⇒ {5, 3, 16}  hr
 *   -64 → T()  BloodPressItem   ⇒ {5, 4, 16}  bp
 *   -66 → Z()  JLSleepSyncBean  ⇒ {5, 5, 16}  sleep       *(was mistyped as spo2)*
 *   -68 → U()  BodyTempItem     ⇒ {5, 8, 16}  temp
 *   -70 → S()  BloodOxyItem     ⇒ {5, 9, 16}  spo2        *(actual location)*
 *   -72 → W()  HrvItem          ⇒ {5, 10, 16} hrv
 *   -74 → Y()  PressureItem     ⇒ {5, 13, 16} stress
 *   -112 → R() BloodSugarItem   ⇒ {5, 16, 16} sugar
 */
const DECODER: Record<string, { op: Opcode; ack: Opcode; label: string; decode: (p: Uint8Array) => TsSample[] }> = {
  hr:      { op: OP(5, 3, 0x10),  ack: OP(5, 3, 0x30),  label: 'HR',         decode: decode6ByteScalar<HrSample>('hr') },
  spo2:    { op: OP(5, 9, 0x10),  ack: OP(5, 9, 0x30),  label: 'SpO2',       decode: decode6ByteScalar<Spo2Sample>('spo2') },
  hrv:     { op: OP(5, 10, 0x10), ack: OP(5, 10, 0x30), label: 'HRV',        decode: decode6ByteScalar<HrvSample>('hrv') },
  stress:  { op: OP(5, 13, 0x10), ack: OP(5, 13, 0x30), label: 'Stress',     decode: decode6ByteScalar<StressSample>('stress') },
  bp:      { op: OP(5, 4, 0x10),  ack: OP(5, 4, 0x30),  label: 'BP',         decode: decodeBp },
  temp:    { op: OP(5, 8, 0x10),  ack: OP(5, 8, 0x30),  label: 'Body temp',  decode: decodeTemp },
  sugar:   { op: OP(5, 16, 0x10), ack: OP(5, 16, 0x30), label: 'Blood sugar', decode: decode6ByteScalar<SugarSample>('sugar') },
  sleep:   { op: OP(5, 5, 0x10),  ack: OP(5, 5, 0x30),  label: 'Sleep',      decode: decodeSleep },
  steps:   { op: OP(5, 2, 0x10),  ack: OP(5, 2, 0x30),  label: 'Steps',      decode: decodeSteps },
  japa:    { op: OP(5, 23, 0x10), ack: OP(5, 23, 0x30), label: 'Japa/Tasbih', decode: decodeTasbih },
};

export type SyncMetric = keyof typeof DECODER;
export const SYNC_METRICS = Object.keys(DECODER) as SyncMetric[];

export interface SyncResult<T extends TsSample = TsSample> {
  metric: SyncMetric;
  label: string;
  samples: T[];
  rawPayload: Uint8Array;
  rawFrame: JieliFrame;
}

export class SyncApi {
  constructor(private readonly ring: SadhanaRing) {}

  /**
   * Write the ring's onboard tasbih/japa counter to a specific value.
   * Called when the user switches deity in the app so the ring's own
   * counter display reflects the new deity's running japa count.
   *
   * Wire (best-guess from the Jieli sync-cluster pattern):
   *   {5, 23, 0}  = set/write counterpart of the {5, 23, 16} read.
   *   Payload    = 4-byte BE count.
   *
   * If the ring nacks (unsupported opcode), we swallow — falling back to
   * the app-side count. Non-fatal.
   */
  async setTasbihCount(count: number): Promise<void> {
    // Not in generated registry; construct the triple by hand.
    const setOp = {
      cmd: 0x05, key: 0x17, keyFlag: 0x00,
      sendMsgId: 0x94, category: 'SYNC' as const,
      name: 'OP_TASBIH_SET_5_23_0',
    };
    const n = Math.max(0, Math.min(0xffffffff, Math.floor(count)));
    const payload = new Uint8Array(4);
    payload[0] = (n >> 24) & 0xff;
    payload[1] = (n >> 16) & 0xff;
    payload[2] = (n >>  8) & 0xff;
    payload[3] =  n        & 0xff;
    await this.ring.queue.send(setOp, payload, {
      expectReply: false,
      timeoutMs: 2000,
      maxRetries: 0,
    });
  }

  /**
   * Fetch all stored samples for a given metric. Sends the request, awaits
   * the multi-packet reply (auto-reassembled), then sends the 0x30 ACK the
   * ring expects (fire-and-forget).
   */
  async sync<T extends TsSample>(metric: SyncMetric): Promise<SyncResult<T>> {
    const spec = DECODER[metric];
    if (!spec) throw new Error(`unknown metric: ${metric}`);

    const frame = await this.ring.queue.send(spec.op, new Uint8Array(0), {
      expectReply: true,
      timeoutMs: 6000,   // sync replies can be large
      maxRetries: 1,
    });

    // Fire the 0x30 ACK — RWfit doesn't wait for its reply, and neither do we.
    this.ring.queue
      .send(spec.ack, new Uint8Array(0), { expectReply: false, maxRetries: 0 })
      .catch(() => {
        /* ACK is best-effort */
      });

    return {
      metric,
      label: spec.label,
      samples: spec.decode(frame.payload) as T[],
      rawPayload: frame.payload,
      rawFrame: frame,
    };
  }
}
