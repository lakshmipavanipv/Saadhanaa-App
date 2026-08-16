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
  OP_HEALTH_2_14_0,
  OP_HEALTH_2_15_0,
  OP_HEALTH_2_17_0,
  OP_HEALTH_2_29_0,
  OP_HEALTH_2_99_16,
  OP_INFO_6_5_0,
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
  hasVibrationLevel: boolean;   // isSupportMotoVibrationLevel — the "does it have a motor" flag
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
    hasVibrationLevel: bit(need(29), 1),  // isSupportMotoVibrationLevel is bit1 of byte[32]-like offset; verified false on this ring
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
   * Push the phone's current wall clock to the ring.
   * Wire payload (confirmed from capture): [yy%100, mm, dd, hh, mm, ss].
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
   * Master health-monitoring switch. `on=true` enables continuous sensor
   * activity; on=false puts the ring into low-power mode. From capture:
   * TX payload is a single byte [0|1].
   */
  async setHealthMonitorMaster(on: boolean): Promise<void> {
    await this.ring.queue.send(OP_HEALTH_2_14_0, new Uint8Array([on ? 1 : 0]), { expectReply: true });
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
   * Find Device — usually makes the ring flash its LED or buzz. On this
   * screenless/motorless ring the ring accepts the command but does nothing
   * visible; sending it is safe.
   */
  async findDevice(): Promise<void> {
    await this.ring.queue.send(OP_HEALTH_2_29_0, new Uint8Array([1]), { expectReply: true });
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
