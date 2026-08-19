/**
 * Candidate vibration/buzz opcodes to probe on unknown SR16 firmware.
 *
 * NOTE: the real command is no longer a guess. RWfit's TRingVibrationPresenter
 * (w1.java:150) sends {2,0x0b,0x00} with payload [level, count] — wired up as
 * DeviceApi.setVibration(). It leads the list below as candidate 1; the rest
 * are kept only for firmware variants that ignore it.
 *
 * Each row is one thing to try. We fire them one at a time with a delay
 * between so the user can hear/feel which pulse buzzed. The diagnostic
 * screen prints a numbered log line before each attempt; user reports
 * the winning number and we promote it to the primary in device.ts.
 *
 * All payloads are best-guess "please buzz once" bytes. Real firmware
 * may take longer arrays; we keep it short so a wrong length just gets
 * ignored rather than mis-fires.
 */

import { lookupOpcode, type Opcode } from './opcodes.generated';

export interface VibCandidate {
  n: number;             // sequence number shown in log
  label: string;         // human-friendly name
  cmd: number;
  key: number;
  keyFlag: number;
  payload: number[];
}

export const VIB_CANDIDATES: VibCandidate[] = [
  // Verified against the RWfit SDK — this is the real one.
  { n: 1,  label: '0xE5 · {2,11,0}   SDK setVibration', cmd: 0x02, key: 0x0b, keyFlag: 0x00, payload: [2, 1] },
  // Previously-primary; registered in the SDK map but never sent by RWfit,
  // and keyFlag 0x10 is the read flavour — kept only as a fallback probe.
  { n: 12, label: '0xDF · {2,16,16}  buzz+mode',       cmd: 0x02, key: 0x10, keyFlag: 0x10, payload: [1, 1] },
  { n: 2,  label: '0xF9 · {6,1,0}    info-find',        cmd: 0x06, key: 0x01, keyFlag: 0x00, payload: [1, 1] },
  { n: 3,  label: '{2,29,0}          legacy find',      cmd: 0x02, key: 0x1d, keyFlag: 0x00, payload: [1] },
  // Alarm-family — many Jieli firmwares vibrate on any alarm-cluster write
  { n: 4,  label: '{2,24,0}          alarm-vib',        cmd: 0x02, key: 0x18, keyFlag: 0x00, payload: [1, 1] },
  { n: 5,  label: '{2,24,16}         alarm-vib set',    cmd: 0x02, key: 0x18, keyFlag: 0x10, payload: [1, 1] },
  { n: 6,  label: '{2,25,0}          drink-buzz',       cmd: 0x02, key: 0x19, keyFlag: 0x00, payload: [1, 1] },
  { n: 7,  label: '{2,26,0}          sedentary',        cmd: 0x02, key: 0x1a, keyFlag: 0x00, payload: [1, 1] },
  { n: 8,  label: '{2,30,16}         find-2',           cmd: 0x02, key: 0x1e, keyFlag: 0x10, payload: [1, 1] },
  { n: 9,  label: '{2,34,0}          buzz-alt',         cmd: 0x02, key: 0x22, keyFlag: 0x00, payload: [1] },
  { n: 10, label: '{4,1,0}           notify-nudge',     cmd: 0x04, key: 0x01, keyFlag: 0x00, payload: [1, 0, 0, 4, 0, 4, ...new Array(68).fill(0), 0x42, 0x55, 0x5a, 0x5a] }, // header + "BUZZ"
  { n: 11, label: '{6,5,0}           info-alt',         cmd: 0x06, key: 0x05, keyFlag: 0x00, payload: [1, 1] },
];

/** Resolve a candidate to its registered Opcode entry, or undefined if missing. */
export function resolveCandidate(c: VibCandidate): Opcode | undefined {
  return lookupOpcode(c.cmd, c.key, c.keyFlag);
}
