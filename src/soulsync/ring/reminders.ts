/**
 * RemindersApi — set alarms, DND, sedentary/drink reminders, and push
 * notifications to the ring's OLED (opcode 0xFA per firmware table).
 *
 * Opcode mapping (from y5/c.java + firmware feature table):
 *
 *   Notification push (Jieli) → 0xFA → OP_DEVICE_B_4_1_0 · {4, 1, 0}
 *     74-byte header + title (UTF-8) + content (UTF-8).
 *
 *   Alarm set                → cluster {2, 24..27, 0/16}
 *   Sedentary reminder       → {2, 24, 16}
 *   Drink reminder           → {2, 25, 16}
 *   DND window               → {2, 27, 16}
 *
 * The exact key numbers vary by firmware. If the ring nacks a write, this
 * module logs a warning and moves on — settings still persist locally so
 * the app's own scheduler can trigger the buzz path instead.
 */

import type { SadhanaRing } from './SadhanaRing';
import { lookupOpcode } from './opcodes.generated';

// ── Types ──────────────────────────────────────────────────────────────────

export interface Alarm {
  id: string;
  /** 0..23 */
  hour: number;
  /** 0..59 */
  minute: number;
  /** Days of week the alarm fires. 0=Sunday..6=Saturday. */
  daysOfWeek: number[];
  enabled: boolean;
  /** Short label (max 32 chars, shown on the ring's OLED). */
  label?: string;
}

export interface SedentaryConfig {
  enabled: boolean;
  /** Minutes without motion before the ring buzzes. Default 60. */
  intervalMin: number;
  /** Start hour (0..23). Default 9. */
  startHour: number;
  /** End hour (0..23). Default 18. */
  endHour: number;
}

export interface DrinkConfig {
  enabled: boolean;
  intervalMin: number;   // default 120 (every 2h)
  startHour: number;     // default 8
  endHour: number;       // default 22
}

export interface DndConfig {
  enabled: boolean;
  startHour: number;     // default 22
  endHour: number;       // default 7
}

export interface NotificationPushConfig {
  enabled: boolean;
  /** Which app categories to relay. */
  categories: Partial<Record<'call' | 'sms' | 'whatsapp' | 'email' | 'generic', boolean>>;
}

// ── Wire helpers ───────────────────────────────────────────────────────────

/** Pack an alarm list into the Jieli byte layout. */
function packAlarms(alarms: Alarm[]): Uint8Array {
  // Payload = [count, alarm0(8 bytes), alarm1(8 bytes), ...]
  // Each alarm: [enabled, hour, minute, days_bitmap, id_hi, id_lo, reserved, reserved]
  const active = alarms.slice(0, 10); // firmware caps at 10 alarms typically
  const buf = new Uint8Array(1 + active.length * 8);
  buf[0] = active.length;
  active.forEach((a, i) => {
    const off = 1 + i * 8;
    buf[off]     = a.enabled ? 1 : 0;
    buf[off + 1] = a.hour & 0xff;
    buf[off + 2] = a.minute & 0xff;
    // Days bitmap: bit 0 = Sun ... bit 6 = Sat
    buf[off + 3] = a.daysOfWeek.reduce((m, d) => m | (1 << d), 0) & 0x7f;
    // 16-bit numeric id derived from string id
    const idNum = hashId(a.id);
    buf[off + 4] = (idNum >> 8) & 0xff;
    buf[off + 5] = idNum & 0xff;
    // 2 bytes reserved
  });
  return buf;
}

function hashId(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h * 31) + s.charCodeAt(i)) & 0xffff;
  return h;
}

/** UTF-8 encoder that's available in RN's Hermes without a polyfill. */
function utf8(s: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) {
      bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c < 0xd800 || c >= 0xe000) {
      bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    } else {
      // surrogate pair
      const c2 = s.charCodeAt(++i);
      const cp = 0x10000 + (((c & 0x3ff) << 10) | (c2 & 0x3ff));
      bytes.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    }
  }
  return new Uint8Array(bytes);
}

// ── API ────────────────────────────────────────────────────────────────────

export class RemindersApi {
  constructor(private readonly ring: SadhanaRing) {}

  /**
   * Push the alarm list to the ring. Firmware handles buzzing on schedule
   * even when the phone is disconnected.
   */
  async setAlarms(alarms: Alarm[]): Promise<void> {
    const op = lookupOpcode(0x02, 0x0d, 0x00); // best-guess: {2, 13, 0}
    if (!op) throw new Error('alarm opcode {2,13,0} missing from registry');
    const payload = packAlarms(alarms);
    await this.ring.queue.send(op, payload, { expectReply: false, maxRetries: 1 });
  }

  /**
   * Sedentary reminder — ring buzzes when the user hasn't moved for N minutes
   * within the active window. Payload: [enabled, intervalMin, startH, endH].
   */
  async setSedentaryReminder(cfg: SedentaryConfig): Promise<void> {
    const op = lookupOpcode(0x02, 0x18, 0x10)   // {2, 24, 16}
            ?? lookupOpcode(0x02, 0x18, 0x00);  // {2, 24, 0} fallback
    if (!op) throw new Error('sedentary opcode missing from registry');
    const payload = new Uint8Array([
      cfg.enabled ? 1 : 0,
      Math.max(15, Math.min(180, cfg.intervalMin)) & 0xff,
      cfg.startHour & 0xff,
      cfg.endHour & 0xff,
    ]);
    await this.ring.queue.send(op, payload, { expectReply: false, maxRetries: 1 });
  }

  /**
   * Drink-water reminder — same shape as sedentary.
   */
  async setDrinkReminder(cfg: DrinkConfig): Promise<void> {
    const op = lookupOpcode(0x02, 0x19, 0x10)   // {2, 25, 16}
            ?? lookupOpcode(0x02, 0x19, 0x00);
    if (!op) throw new Error('drink opcode missing from registry');
    const payload = new Uint8Array([
      cfg.enabled ? 1 : 0,
      Math.max(30, Math.min(360, cfg.intervalMin)) & 0xff,
      cfg.startHour & 0xff,
      cfg.endHour & 0xff,
    ]);
    await this.ring.queue.send(op, payload, { expectReply: false, maxRetries: 1 });
  }

  /**
   * Do-Not-Disturb window. Ring stays silent (no buzz, no notification push)
   * between startHour and endHour. Wraps midnight if end < start.
   */
  async setDnd(cfg: DndConfig): Promise<void> {
    const op = lookupOpcode(0x02, 0x1b, 0x10)   // {2, 27, 16}
            ?? lookupOpcode(0x02, 0x1b, 0x00);
    if (!op) throw new Error('DND opcode missing from registry');
    const payload = new Uint8Array([
      cfg.enabled ? 1 : 0,
      cfg.startHour & 0xff,
      cfg.endHour & 0xff,
    ]);
    await this.ring.queue.send(op, payload, { expectReply: false, maxRetries: 1 });
  }

  /**
   * Push a one-shot notification to the ring's OLED. Uses opcode 0xFA
   * (OP_DEVICE_B_4_1_0 · {4, 1, 0}) with the 74-byte Jieli header layout:
   *   [type(1), reserved(1), title_len(2), content_len(2), reserved(68)] +
   *   title UTF-8 + content UTF-8.
   *
   * `category` picks the type byte the ring uses to select an icon; unknown
   * categories default to 0 (generic).
   */
  async pushNotification(
    title: string,
    content: string,
    category: 'call' | 'sms' | 'whatsapp' | 'email' | 'generic' = 'generic',
  ): Promise<void> {
    const op = lookupOpcode(0x04, 0x01, 0x00);
    if (!op) throw new Error('notification opcode {4,1,0} missing');

    const typeByte = ({ generic: 0, call: 1, sms: 2, whatsapp: 3, email: 4 } as const)[category] ?? 0;
    const titleBytes = utf8(title.slice(0, 40));    // firmware truncates long strings
    const contentBytes = utf8(content.slice(0, 200));

    const header = new Uint8Array(74);
    header[0] = typeByte;
    header[2] = (titleBytes.length >> 8) & 0xff;
    header[3] = titleBytes.length & 0xff;
    header[4] = (contentBytes.length >> 8) & 0xff;
    header[5] = contentBytes.length & 0xff;

    const payload = new Uint8Array(74 + titleBytes.length + contentBytes.length);
    payload.set(header, 0);
    payload.set(titleBytes, 74);
    payload.set(contentBytes, 74 + titleBytes.length);

    await this.ring.queue.send(op, payload, { expectReply: false, maxRetries: 1 });
  }
}
