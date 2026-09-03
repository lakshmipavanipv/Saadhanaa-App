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
 * Channel identities below are NOT inferred — each is the label the SDK's own
 * sync service logs for that opcode (com/example/blesdk/service/*.java):
 *
 *   {5, 2, 16}  步数            Steps            v.java
 *   {5, 3, 16}  心率            HR               p.java
 *   {5, 4, 16}  血压            Blood pressure   o.java
 *   {5, 5, 16}  睡眠            Sleep            t.java
 *   {5, 8, 16}  体温            Body temp        x.java
 *   {5, 9, 16}  血氧            SpO2             n.java
 *   {5, 10, 16} HRV             HRV              q.java
 *   {5, 13, 16} 压力            Stress           s.java
 *   {5, 16, 16} 血糖            Blood sugar      m.java
 *   {5, 23, 16} Muslim计数      Prayer count     r.java
 *   {5, 26, 16} 步数杰里2       Steps "Jieli-2"  w.java
 *
 * An earlier version of this comment had Sleep at {5,26,16} and Steps at
 * {5,23,16}. That was wrong on both counts — {5,23,16} is the prayer counter
 * and {5,26,16} is the platform's second steps channel. The DECODER map below
 * was always right; only this table was stale.
 *
 * Timestamps: 4-byte LE offset from the ring's epoch, which is 2000-01-01
 * UTC = Unix 946684800 (+ small tz adjustment done by the RWfit app; here we
 * return the raw offset + a helper to convert to a Date).
 */

import type { SadhanaRing } from './SadhanaRing';
import { OP_SYNC_5_2_16 as _op, OP_HEALTH_2_111_0, lookupOpcode, type Opcode } from './opcodes.generated';
import type { JieliFrame } from './codec';

const OP = (cmd: number, key: number, keyFlag: number): Opcode => {
  const op = lookupOpcode(cmd, key, keyFlag);
  if (!op) throw new Error(`opcode ${cmd}/${key}/${keyFlag} missing from registry`);
  return op;
};

// ── Ring epoch: 2000-01-01 UTC ───────────────────────────────────────────
export const RING_EPOCH_UNIX = 946_684_800;

/**
 * Ring timestamp -> Date, honouring the fact that the ring's clock is LOCAL.
 *
 * device.ts setDateTime() pushes the phone's wall clock using local fields
 * (getHours/getDate/...), so the ring counts seconds from 2000-01-01 00:00 in
 * whatever timezone the user is in — not from the UTC epoch. Adding
 * RING_EPOCH_UNIX and handing that to `new Date()` interprets the count as
 * UTC, which shifts every reading by the local offset: +5:30 in IST, so a
 * 04:30 sleep onset surfaced as 10:00.
 *
 * So: build the naive instant, read its UTC fields (which ARE the ring's wall
 * clock), and re-assemble them as local time.
 */
export const ringTsToDate = (ringTs32Le: number): Date => {
  const naive = new Date((RING_EPOCH_UNIX + ringTs32Le) * 1000);
  return new Date(
    naive.getUTCFullYear(),
    naive.getUTCMonth(),
    naive.getUTCDate(),
    naive.getUTCHours(),
    naive.getUTCMinutes(),
    naive.getUTCSeconds()
  );
};

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
  // Stride is 6 ([ts32_BE, value, pad]) but only 5 bytes are load-bearing, and
  // the ring's last record routinely arrives without its trailing pad. A real
  // HRV payload from the RWfit capture:
  //
  //   31fe69eb 21 00 | 31fe77fb 21        11 bytes, not 12
  //
  // Requiring a full 6 dropped that second pair — and since records run
  // oldest-to-newest, the one being thrown away was always the freshest
  // reading. Advance by 6, but only require the 5 bytes we actually read.
  for (let off = 0; off + 5 <= payload.length; off += 6) {
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
  // Same trailing-record situation as decode6ByteScalar: stride 7, but the
  // stage code sits at [4] so 5 bytes is enough to decode one.
  for (let off = 0; off + 5 <= payload.length; off += 7) {
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
  // Jieli-platform second steps channel. In the RWfit capture this is the
  // busiest channel on the device — 24 of 36 replies carried data (up to 163
  // bytes) while plain {5,2,16} produced data only 3 times. Same 16-byte
  // record layout, so it shares decodeSteps.
  steps2:  { op: OP(5, 26, 0x10), ack: OP(5, 26, 0x30), label: 'Steps (Jieli-2)', decode: decodeSteps },
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
   * Clear the ring's onboard prayer counter.
   *
   * This is the only write RWfit has for the counter — there is no "set it
   * to N" command anywhere in the SDK (I checked: {5,23,0} is not in the
   * opcode map at all). TRingMuslimProvider's `getMuslimCleanCmdJL`
   * (ui/testui/c0.java:141) sends:
   *
   *     b3.g((byte) 44, new byte[]{2, 111, 0, 0})
   *
   * i.e. {2,0x6f,0} with a single 0 byte, which is OP_HEALTH_2_111_0 in our
   * registry (sendMsgId 0x2c = 44, matching exactly).
   *
   * So app and ring can be brought into agreement by zeroing both together;
   * they cannot be forced to an arbitrary shared number.
   */
  async clearTasbihCount(): Promise<void> {
    await this.ring.queue.send(OP_HEALTH_2_111_0, new Uint8Array([0]), {
      expectReply: true,
      timeoutMs: 2000,
      maxRetries: 1,
    });
  }

  /**
   * Fetch all stored samples for a given metric. Sends the request, awaits
   * the multi-packet reply (auto-reassembled), then sends the 0x30 ACK the
   * ring expects (fire-and-forget).
   */
  async sync<T extends TsSample>(
    metric: SyncMetric,
    opts: { priority?: boolean; maxPages?: number } = {}
  ): Promise<SyncResult<T>> {
    const spec = DECODER[metric];
    if (!spec) throw new Error(`unknown metric: ${metric}`);

    // The ring pages its history: one request returns one page, and the
    // reader must ACK and ask again until a page comes back empty. Doing a
    // single request — which is what this used to do — silently truncates
    // every metric to its most recent page. It showed up worst on the japa
    // counter, where older prayer counts simply never arrived.
    //
    // Sequence, straight off the RWfit capture (rwfit_capture, {5,23,*}):
    //
    //   TX {5,23,16} len=3     request
    //   RX {5,23,16} len=147   a page of records
    //   TX {5,23,48} len=3     ACK this page
    //   RX {5,23,48} len=3
    //   TX {5,23,16} len=3     request again
    //   RX {5,23,16} len=3     header only, no records → drained
    //
    // SyncJLDataService in the SDK (blesdk/service/r.java:63-72) does the
    // same thing: ACK, hand the page to listeners, re-request; the empty
    // reply ends the loop.
    // ~40 pages of history is far past any real ring. Callers that only want
    // the freshest reading (the live-vitals cycler) pass a much smaller cap so
    // they cost one round-trip instead of draining the whole channel.
    const MAX_PAGES = opts.maxPages ?? 40;
    const samples: T[] = [];
    let lastFrame: JieliFrame | null = null;
    let firstPayload: Uint8Array = new Uint8Array(0);
    let pages = 0;

    while (pages < MAX_PAGES) {
      const frame = await this.ring.queue.send(spec.op, new Uint8Array(0), {
        expectReply: true,
        timeoutMs: 6000,   // sync replies can be large
        maxRetries: 1,
        priority: opts.priority,
      });
      pages += 1;
      lastFrame = frame;
      if (pages === 1) firstPayload = frame.payload;

      // Header-only reply = nothing left. Don't ACK an empty page; RWfit
      // doesn't either, it just stops.
      if (frame.payload.length === 0) break;

      const page = spec.decode(frame.payload) as T[];
      samples.push(...page);

      // ACK before re-requesting — the ring won't advance otherwise.
      // Fire-and-forget, exactly as RWfit does.
      this.ring.queue
        .send(spec.ack, new Uint8Array(0), {
          expectReply: false,
          maxRetries: 0,
          priority: opts.priority,
        })
        .catch(() => {
          /* ACK is best-effort */
        });

      // A page that decodes to nothing would loop forever if the ring keeps
      // returning it, so treat it as the end too.
      if (page.length === 0) break;
    }

    if (pages >= MAX_PAGES) {
      // eslint-disable-next-line no-console
      console.warn(`[sync] ${metric}: hit ${MAX_PAGES}-page cap — history may be truncated`);
    }

    return {
      metric,
      label: spec.label,
      samples,
      rawPayload: firstPayload,
      rawFrame: lastFrame as JieliFrame,
    };
  }
}
