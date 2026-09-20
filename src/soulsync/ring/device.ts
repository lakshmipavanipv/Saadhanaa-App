/**
 * Device feature API — the fundamentals every consumer wants: battery,
 * firmware version, capability probe, clock, person profile.
 *
 * Opcode + payload layouts are grounded in either:
 *   [x5.b:C]  the RWfit receive-side parser for the reply (definitive), or
 *   [capture] the phone→ring frame captured live from RWfit v6.0.5, or
 *   [study]   the static analysis in RWFit_App_Study.md §12 (SDK menu).
 *
 * Anything marked (unverified) has an educated guess for the send-side
 * layout — callers can pass `raw` to override until we live-test it.
 */

import type { SadhanaRing } from './SadhanaRing';
import {
  OP_HEALTH_2_1_0,
  OP_HEALTH_2_4_16,
  OP_HEALTH_2_7_0,
  OP_HEALTH_2_102_0,
  OP_HEALTH_2_14_0,
  OP_HEALTH_2_15_0,
  OP_HEALTH_2_17_0,
  OP_HEALTH_2_29_0,
  OP_HEALTH_2_11_0,
  OP_HEALTH_2_11_16,
  OP_HEALTH_2_99_16,
  OP_INFO_6_5_0,
  OP_INFO_6_4_16,
  lookupOpcode,
} from './opcodes.generated';
import type { JieliFrame } from './codec';

export interface BatteryStatus {
  percent: number;      // 0..100
  voltageRaw: number | null;   // raw ADC (mV-ish, calibration unclear); null if the reply is 1-byte only
}

export interface FirmwareInfo {
  version: string;              // e.g. "2.5.4" — dotted, from body[3..5]
  screenType: number;
  screenWidth: number;
  screenHeight: number;
  deviceModel: string | null;   // 8 ASCII bytes at body[11..18], nulls trimmed
  uiVersion: string;            // dotted, or "1.0.0" if not supplied
}

/**
 * SupportMenuBean V2 (100+ flags). Deserialized from the {2,99,16} reply.
 * Field naming mirrors the Java source so cross-referencing stays cheap.
 * Missing bits are `undefined` — the ring only returns what it supports.
 */
export interface Capabilities {
  hasAddressBook: boolean;
  hasMsgNotification: boolean;
  hasTakePhoto: boolean;
  hasDND: boolean;
  hasLEDLight: boolean;
  hasWearDir: boolean;
  hasVideoHid: boolean;
  hasHealthMontior: boolean;
  hasSetBTName: boolean;
  hasFindDevice: boolean;
  hasRecovery: boolean;   // factory reset supported
  hasPowerOff: boolean;
  hasVideoHidBook: boolean;
  hasVideoHidMusic: boolean;
  hasVideoHidAndroidBook: boolean;
  hasChildAppSwitch: boolean;
  hasPushMsgEnableSwitch: boolean;
  pushMsgSwitchValue: number;
  hasFunc2GirlCareGernal: boolean;
  hasAlarm: boolean;
  /**
   * Whether the motor's INTENSITY can be set — `isSupportMotoVibrationLevel`.
   *
   * NOT "does it have a motor". A ring with a fixed-strength motor reports
   * false here and still vibrates perfectly well, which is the case on this
   * SR16: the flag reads false and the device owner confirms it buzzes. The
   * old name invited exactly the wrong conclusion, and code acted on it.
   */
  supportsVibrationLevel: boolean;
  raw: Uint8Array;
}

export interface PersonProfile {
  /** cm, e.g. 175 */
  heightCm: number;
  /** kg, e.g. 70 */
  weightKg: number;
  /** 0 = female, 1 = male (mirrors PersonBean.gender) */
  gender: 0 | 1;
  birthYear: number;
  birthMonth: number; // 1..12
  birthDay: number;   // 1..31
  /** daily step goal (e.g. 8000) */
  stepTarget: number;
  /** 0 = metric, 1 = imperial */
  measureUnit: 0 | 1;
}

const bit = (byte: number, i: number): boolean => ((byte >> i) & 1) === 1;

function parsePower(payload: Uint8Array): BatteryStatus {
  // From x5.b.G: body[3] = percent; body[4..5] BE = voltage. `payload` is the
  // 3-byte-CMD-stripped body from JieliFrame, so payload[0] here is body[3].
  const percent = payload[0] ?? 0;
  let voltageRaw: number | null = null;
  if (payload.length >= 3) {
    voltageRaw = (payload[1] << 8) | payload[2];
  }
  return { percent, voltageRaw };
}

function parseFirmware(payload: Uint8Array): FirmwareInfo {
  // From x5.b.C: body[3..5] = "a.b.c" as ints (percent-decoded). payload here
  // starts at body[3] (JieliFrame strips CMD/Key/KeyFlag).
  const version = payload.length >= 3
    ? `${payload[0] & 0xff}.${payload[1] & 0xff}.${payload[2] & 0xff}`
    : '0.0.0';

  let screenType = 0, screenWidth = 240, screenHeight = 284;
  let deviceModel: string | null = null;
  let uiVersion = '1.0.0';

  // Body length > 16 in the Java parser corresponds to payload length > 13 here.
  if (payload.length > 13) {
    screenType = payload[3] & 0xff;
    screenWidth = (payload[4] & 0xff) | ((payload[5] & 0xff) << 8);
    screenHeight = (payload[6] & 0xff) | ((payload[7] & 0xff) << 8);
    const modelBytes = payload.slice(8, 16);
    deviceModel = new TextDecoder('utf-8').decode(modelBytes).replace(/\0+$/, '');
  }
  if (payload.length > 20) {
    uiVersion = `${payload[17] & 0xff}.${payload[18] & 0xff}.${payload[19] & 0xff}`;
  }
  return { version, screenType, screenWidth, screenHeight, deviceModel, uiVersion };
}

function parseCapabilitiesV2(payload: Uint8Array): Capabilities {
  // From x5.b.j: expects body starting at [3] to be capability bytes.
  // payload here begins at body[3].
  const b = payload;
  const need = (n: number, fallback = 0) => (b.length > n ? b[n] : fallback);

  const stepTargetBytes =
    b.length >= 21
      ? ((b[17] & 0xff) | ((b[18] & 0xff) << 8) | ((b[19] & 0xff) << 16) | ((b[20] & 0xff) << 24))
      : 0;

  return {
    hasAddressBook: bit(need(0), 0),
    hasMsgNotification: bit(need(1), 0),
    hasTakePhoto: bit(need(2), 0),
    hasDND: bit(need(3), 0),
    hasLEDLight: bit(need(4), 0),
    hasWearDir: bit(need(5), 0),
    hasVideoHid: bit(need(6), 0),
    hasHealthMontior: bit(need(7), 0),
    hasSetBTName: bit(need(8), 0),
    hasFindDevice: bit(need(9), 0),
    hasRecovery: bit(need(10), 0),
    hasPowerOff: bit(need(11), 0),
    hasVideoHidBook: bit(need(12), 0),
    hasVideoHidMusic: bit(need(13), 0),
    hasVideoHidAndroidBook: bit(need(14), 0),
    hasChildAppSwitch: bit(need(15), 0),
    hasPushMsgEnableSwitch: bit(need(16), 0),
    pushMsgSwitchValue: stepTargetBytes,
    hasFunc2GirlCareGernal: bit(need(21), 0),
    hasAlarm: bit(need(22), 0),
    supportsVibrationLevel: bit(need(29), 1),
    raw: b.slice(),
  };
}

export class DeviceApi {
  constructor(private readonly ring: SadhanaRing) {}

  /** Battery percent + raw voltage. Getter — reply-carrying. */
  async getBattery(): Promise<BatteryStatus> {
    const frame = await this.ring.queue.send(OP_INFO_6_5_0);
    return parsePower(frame.payload);
  }

  /** Firmware/screen/model info. Getter. */
  async getFirmwareInfo(): Promise<FirmwareInfo> {
    const frame = await this.ring.queue.send(OP_HEALTH_2_4_16);
    return parseFirmware(frame.payload);
  }

  /** Full V2 capability bitfield — 100+ flags. Getter. */
  async getCapabilities(): Promise<Capabilities> {
    const frame = await this.ring.queue.send(OP_HEALTH_2_99_16);
    return parseCapabilitiesV2(frame.payload);
  }

  /**
   * Push the phone's current wall clock to the ring, so the ring's own clock
   * and everything it timestamps match the user's local time.
   *
   * VERIFIED against RWfit's `CmdHelper.v(Date)`
   * (`mlkit_vision_common/p.java:820`, logged by the SDK as `getDateCmdJL`),
   * which builds exactly:
   *
   *     b3.g((byte) -11, new byte[]{ 2, 1, 0,
   *          year - 2000, month, day, hour, minute, second });
   *
   * {2,1,0} with sendMsgId 0xF5 is OP_HEALTH_2_1_0 here — a match on all four
   * bytes, so this is the real command and not a guess.
   *
   * LOCAL TIME, DELIBERATELY. The ring stores wall-clock time with no zone —
   * see ring/sync.ts, which reads history back as local fields for exactly
   * this reason. Sending UTC would put the ring's display out by the offset
   * (5½ hours in IST) and misdate every reading it records. RWfit uses
   * `Calendar.getInstance()`, which is local, and so does this.
   *
   * Month is 1-12 and the hour is 0-23: the source reads `calendar.get(2) + 1`
   * and `calendar.get(11)`, which is HOUR_OF_DAY rather than the 12-hour field.
   */
  async setDateTime(when: Date = new Date()): Promise<void> {
    const payload = new Uint8Array([
      when.getFullYear() % 100,
      when.getMonth() + 1,
      when.getDate(),
      when.getHours(),
      when.getMinutes(),
      when.getSeconds(),
    ]);
    await this.ring.queue.send(OP_HEALTH_2_1_0, payload, { expectReply: true });
  }

  /**
   * Tell the ring a call is ringing, answered or over, so it can show the
   * caller on its display.
   *
   * ═════════════════════════════════════════════════════════════════════
   * WHERE THIS WIRE FORMAT COMES FROM
   * ═════════════════════════════════════════════════════════════════════
   *
   * Not inferred. Read out of the reference app's own call handler —
   * `q0.c()` in the decompiled RWfit, which builds the frame byte by byte and
   * hands it to sendMsgId 71. That id maps to OP_INFO_6_4_16 in the opcode
   * table generated from the same APK, so the {6,4,16} triple is the app's,
   * not a guess.
   *
   * This matters because the last thing pushed to this ring's display — the
   * logo, through the OLED bitmap path — WAS inferred, and it failed: the
   * write timed out and took the BLE link down with it. A display command is
   * only worth sending when its bytes came from something that works.
   *
   *   [0]      state: 0 ringing · 1 answered · 2 ended
   *   [1..4]   time, epoch seconds, LITTLE-endian
   *   [5]      length of the number, in bytes
   *   [6..]    number, UTF-8
   *   [..]     caller name, UTF-8, to the end of the payload
   *
   * The ring scrolls the name itself when it is too wide for the display;
   * there is no scroll flag to set. Nothing here controls that.
   *
   * THE TIME IS LOCAL WALL-CLOCK, NOT UTC
   *
   * The source adds the zone's raw offset (plus an hour in DST) to the
   * calendar before taking its millis, which yields local wall-clock seconds
   * dressed as an epoch. That is the same convention `setDateTime` uses and
   * which this ring is known to accept — sending true UTC here would put the
   * call an offset away in the ring's own log.
   *
   * WHEN THE NAME IS BLANK
   *
   * The reference app clears the name when it merely repeats the number, and
   * so does this: a ring showing "9876543210" twice is worse than showing it
   * once.
   */
  async notifyCall(
    opts: { number: string; name?: string; state?: 'ringing' | 'answered' | 'ended'; at?: Date },
  ): Promise<void> {
    const state = opts.state ?? 'ringing';
    const code = state === 'ringing' ? 0 : state === 'answered' ? 1 : 2;

    const number = (opts.number ?? '').trim();
    let name = (opts.name ?? '').trim();
    if (name.replace(/\s/g, '') === number.replace(/\s/g, '')) name = '';

    const enc = new TextEncoder();
    // The ring's display is small and the frame is not unbounded; the
    // reference app truncates by BYTES, which is what matters for a name with
    // non-Latin characters in it.
    const numBytes = enc.encode(number).slice(0, 32);
    const nameBytes = enc.encode(name).slice(0, 64);

    const when = opts.at ?? new Date();
    // Local wall-clock seconds — see the note above.
    const localSecs = Math.floor(
      (when.getTime() - when.getTimezoneOffset() * 60_000) / 1000,
    );

    const payload = new Uint8Array(6 + numBytes.length + nameBytes.length);
    payload[0] = code & 0xff;
    payload[1] = localSecs & 0xff;
    payload[2] = (localSecs >> 8) & 0xff;
    payload[3] = (localSecs >> 16) & 0xff;
    payload[4] = (localSecs >> 24) & 0xff;
    payload[5] = numBytes.length & 0xff;
    payload.set(numBytes, 6);
    payload.set(nameBytes, 6 + numBytes.length);

    await this.ring.queue.send(OP_INFO_6_4_16, payload, { expectReply: false });
  }

  /**
   * Master health-monitoring switch. `on=true` enables continuous sensor
   * activity; on=false puts the ring into low-power mode. From capture:
   * TX payload is a single byte [0|1].
   */
  async setHealthMonitorMaster(on: boolean): Promise<void> {
    await this.ring.queue.send(OP_HEALTH_2_14_0, new Uint8Array([on ? 1 : 0]), { expectReply: true });
  }

  /**
   * Turn the ring's LED on or off.
   *
   * VERIFIED against RWfit's `CmdHelper.C(BrightScreenLedBean)`
   * (`mlkit_vision_common/p.java:101`, logged as `getLedLevelWCmdJL`):
   *
   *     b3.g((byte) 24, new byte[]{ 2, 102, 0, isOpen, lcdLevel });
   *
   * {2,102,0} with sendMsgId 0x18 is OP_HEALTH_2_102_0 here — matched on all
   * four bytes, so this is the real command.
   *
   * This ring reports `hasLEDLight = true` from its own SupportMenu flags,
   * which is worth stating because the written study of this hardware says it
   * "almost certainly has no LED". The ring disagrees with the study, and the
   * ring is the authority on itself.
   *
   * @param level Brightness 0-100 as the SDK sends it. Firmware may quantise.
   */
  async setLed(on: boolean, level: number = 100): Promise<void> {
    await this.ring.queue.send(
      OP_HEALTH_2_102_0,
      new Uint8Array([on ? 1 : 0, Math.max(0, Math.min(100, Math.round(level))) & 0xff]),
      { expectReply: true, timeoutMs: 2000 }
    );
  }

  /**
   * Blink the LED — an on-finger signal for a ring with no vibration motor.
   *
   * Sequential rather than concurrent: the send queue serialises commands
   * anyway, and overlapping on/off pairs would race to leave the LED in
   * whichever state finished last. Always ends off.
   */
  async blinkLed(times: number = 1, onMs: number = 220, offMs: number = 180): Promise<void> {
    for (let i = 0; i < times; i++) {
      await this.setLed(true);
      await new Promise((r) => setTimeout(r, onMs));
      await this.setLed(false);
      if (i < times - 1) await new Promise((r) => setTimeout(r, offMs));
    }
  }

  /**
   * Push units. RWfit exposes metric/imperial toggle at {2,7,0}.
   * Wire payload (best-effort from opcode registry position): [0=metric, 1=imperial].
   * (unverified — send-side capture didn't include this opcode.)
   */
  async setUnit(unit: 'metric' | 'imperial'): Promise<void> {
    await this.ring.queue.send(OP_HEALTH_2_7_0, new Uint8Array([unit === 'imperial' ? 1 : 0]), {
      expectReply: true,
    });
  }

  /**
   * Push the user's profile to the ring. The firmware uses it to parameterize
   * its own step/calorie/sleep algorithms.
   *
   * (unverified) The exact wire order of PersonBean fields wasn't captured;
   * we send them in the same order as `PersonBean` declares them:
   *   [gender, birthYear-2000, birthMonth, birthDay, height, weight_kgx2, stepTarget:2LE, measureUnit]
   * If the ring parses fields in a different order, override with `raw`.
   */
  async setPerson(p: PersonProfile, override?: { raw?: Uint8Array }): Promise<void> {
    const payload = override?.raw ?? new Uint8Array([
      p.gender & 0xff,
      Math.max(0, p.birthYear - 2000) & 0xff,
      p.birthMonth & 0xff,
      p.birthDay & 0xff,
      Math.round(p.heightCm) & 0xff,
      Math.round(p.weightKg * 2) & 0xff,       // 0.5 kg resolution — common in JL protocols
      p.stepTarget & 0xff,
      (p.stepTarget >> 8) & 0xff,
      p.measureUnit & 0xff,
    ]);
    await this.ring.queue.send(OP_HEALTH_2_15_0, payload, { expectReply: true });
  }

  /**
   * Ring calls this "recovery". Wipes stored history + settings.
   * Guard: throws unless `confirm==='DELETE_ALL'` — this is destructive.
   */
  async factoryReset(confirm: 'DELETE_ALL'): Promise<void> {
    if (confirm !== 'DELETE_ALL') throw new Error('factoryReset requires confirm=\'DELETE_ALL\'');
    await this.ring.queue.send(OP_HEALTH_2_17_0, new Uint8Array([1]), { expectReply: true });
  }

  /**
   * Vibration level + pulse count — the ring's real motor control.
   *
   * Taken from the RWfit SDK rather than guessed. TRingVibrationPresenter
   * (com/example/test/presenter/main/w1.java:150) sends:
   *
   *     b3.g((byte) -27, new byte[]{2, 11, 0, level, count})   // 0xE5 set
   *     b3.g((byte) -28, new byte[]{2, 11, 16})                // 0xE4 get
   *
   * which is {2,0x0b,0x00} with payload [level, count], and the matching
   * read at {2,0x0b,0x10}. Both are already in our generated registry as
   * OP_HEALTH_2_11_0 / OP_HEALTH_2_11_16 with the same sendMsgIds (0xe5 /
   * 0xe4) — they were simply never wired to vibration.
   *
   * The previous implementation sent [count, mode] to {2,16,16} (0xDF).
   * That opcode is registered in the SDK's table but nothing in the real
   * app ever sends it, and keyFlag 0x10 is the *read* flavour throughout
   * this protocol (compare {2,11,16} get vs {2,11,0} set) — so we were
   * writing a payload to a getter, which is why the ring never buzzed.
   *
   * @param level  motor strength, 1-3 (SDK's BrightVibrationBean default 1)
   * @param count  number of pulses
   */
  async setVibration(level: number = 2, count: number = 1): Promise<void> {
    const payload = new Uint8Array([
      Math.max(1, Math.min(level, 3)) & 0xff,
      Math.max(1, Math.min(count, 255)) & 0xff,
    ]);
    await this.ring.queue.send(OP_HEALTH_2_11_0, payload, {
      expectReply: true,
      timeoutMs: 2000,
      maxRetries: 1,
    });
  }

  /** Read the ring's current [level, count] vibration setting. */
  async getVibration(): Promise<{ level: number; count: number }> {
    const frame = await this.ring.queue.send(OP_HEALTH_2_11_16, new Uint8Array(0), {
      expectReply: true,
      timeoutMs: 2000,
    });
    // Reply payload mirrors analysisRingVibrationLevel (x5/b.java:4377):
    // bArr[3] = level, bArr[4] = count — i.e. payload[0], payload[1] once
    // the 3-byte {cmd,key,keyFlag} header is stripped by the codec.
    return {
      level: frame.payload[0] ?? 1,
      count: frame.payload[1] ?? 1,
    };
  }

  /**
   * Buzz the ring N times — used for pairing feedback and "find my ring".
   * Thin wrapper over setVibration at the default strength.
   */
  async vibrate(pulses: number = 1): Promise<void> {
    return this.setVibration(2, pulses);
  }

  /** @deprecated Kept as an alias so existing callers keep working. */
  async findDevice(times: number = 1): Promise<void> {
    return this.vibrate(times);
  }

  /**
   * Send an arbitrary command by triple. Escape hatch for opcodes not yet
   * wrapped with a typed helper.
   */
  async sendRaw(cmd: number, key: number, keyFlag: number, payload: Uint8Array = new Uint8Array(0)): Promise<JieliFrame> {
    const op = lookupOpcode(cmd, key, keyFlag);
    if (!op) throw new Error(`unknown opcode ${cmd}/${key}/${keyFlag}`);
    return this.ring.queue.send(op, payload);
  }
}
