/**
 * channelSweep — ask the ring what it will actually tell us, channel by
 * channel, without taking anything away.
 *
 * WHY
 *
 * The ring's own display shows a sleep total the app never receives: the
 * sleep history channel {5,5,16} answers with a header and no records at all.
 * Either the ring keeps that figure somewhere we have never asked, or it does
 * not expose it. Only the ring can settle that, and the opcode registry is
 * mostly unnamed — 165 opcodes generated from the RWfit APK, a handful of
 * which we have identified.
 *
 * SAFETY — WHY THIS CANNOT DESTROY DATA
 *
 * Requesting a page is read-only. It is the ACK, {5,key,0x30}, that makes the
 * ring drop a page, and this sweep never sends one. A channel that answers
 * with records keeps them, and the ordinary sync can collect them properly
 * afterwards.
 *
 * It is also restricted to cmd 5, the history family, with keyFlag 0x10 — the
 * read direction. Nothing here writes a setting (cmd 3/4), controls the device
 * (cmd 6) or touches file transfer and OTA (cmd 7). An unknown key in the read
 * family is answered or ignored; it does not change the ring.
 *
 * Results go to the log rather than the UI: this answers a question asked
 * once, and a screen for it would outlive its usefulness.
 *   adb logcat -s ReactNativeJS:V | grep SWEEP
 */

import type { SadhanaRing } from './SadhanaRing';
import type { Opcode } from './opcodes.generated';

const OP = (cmd: number, key: number, keyFlag: number): Opcode => ({
  cmd, key, keyFlag, sendMsgId: 0x00, category: 'UNKNOWN', name: `probe_${cmd}_${key}_${keyFlag}`,
});

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

/**
 * Sweep the history family and report every channel that answers with data.
 *
 * @param keys Which key bytes to try. Defaults to 1-40, which covers every
 *   key seen in the RWfit capture (2,3,4,5,9,10,13,23,26) with room either
 *   side for one we have never observed.
 */
export async function sweepHistoryChannels(
  ring: SadhanaRing,
  keys: number[] = Array.from({ length: 40 }, (_, i) => i + 1),
): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`[SWEEP] start — ${keys.length} channels, read-only, no ACK sent`);
  const withData: string[] = [];

  for (const key of keys) {
    try {
      const frame = await ring.queue.send(OP(5, key, 0x10), new Uint8Array(0), {
        expectReply: true,
        timeoutMs: 1800,
        maxRetries: 0,
      });
      const n = frame.payload.length;
      if (n > 0) {
        withData.push(`5/${key}/16`);
        // Full payload, not a preview: a truncated dump of an unknown record
        // layout is almost useless — the field we are hunting may sit anywhere
        // in it, and the channel cannot be asked twice without consuming it.
        // eslint-disable-next-line no-console
        console.log(`[SWEEP] 5/${key}/16  len=${n}  ${hex(frame.payload)}`);
      }
    } catch {
      /* no reply within the timeout — this ring does not use that key */
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `[SWEEP] done — channels carrying data: ${withData.length ? withData.join(' ') : 'none'}`
  );
}
