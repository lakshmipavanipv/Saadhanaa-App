/**
 * OledApi — push a bitmap image to the ring's OLED via CMD 7 file transfer.
 *
 * The SR16 OLED is a 96×64 monochrome display (per firmware capabilities).
 * We pack 1-bit-per-pixel column-major so the byte layout matches what most
 * SSD1306-family drivers expect. Each page (8 pixels tall) is written left→right,
 * top page → bottom page.
 *
 * Wire (parallels OtaApi, uses a different file id):
 *   INIT   OP_FILE_OTA_7_3_0  · {7, 3, 0}
 *            payload = [file_id, size_LE32]
 *   CHUNK  OP_FILE_OTA_7_4_0  · {7, 4, 0}
 *            payload = [offset_LE32, len_LE16, bytes...]
 *   COMMIT OP_FILE_OTA_7_4_48 · {7, 4, 48}
 *            payload = [file_id, size_LE32, crc16_LE]
 *
 * The `file_id` byte lets the ring keep OTA (id=0) and OLED bitmap (id=1)
 * transfers on distinct channels without one clobbering the other.
 *
 * Helper `setDeityDisplay(name)` renders the first two chars of a deity name
 * (e.g. "Ta" for "Tara", "Ch" for "Chandi") into a centered bitmap and pushes
 * it — this is the japa-counter deity display asked for in earlier sessions.
 */

import type { SadhanaRing } from './SadhanaRing';
import { crc16arc } from './codec';
import {
  OP_FILE_OTA_7_3_0,
  OP_FILE_OTA_7_4_0,
  OP_FILE_OTA_7_4_48,
} from './opcodes.generated';

const OLED_WIDTH = 96;
const OLED_HEIGHT = 64;
const OLED_PAGES = OLED_HEIGHT / 8;   // 8
const OLED_BYTES = OLED_WIDTH * OLED_PAGES;
const FILE_ID_BITMAP = 0x01;
const CHUNK_SIZE = 128;

// ── 5×7 monospaced ASCII font (bit-packed columns) ─────────────────────────
//
// Each glyph is 5 bytes wide × 7 rows tall. Bit 0 = top pixel, bit 6 = bottom
// (bit 7 unused). Only common uppercase, digits, and a few punctuation glyphs
// are shipped — plenty for two-letter deity abbreviations, day-of-week
// initials, and battery/status hints.

const FONT_5x7: Record<string, number[]> = {
  ' ': [0x00, 0x00, 0x00, 0x00, 0x00],
  '!': [0x00, 0x00, 0x5f, 0x00, 0x00],
  '.': [0x00, 0x60, 0x60, 0x00, 0x00],
  '-': [0x08, 0x08, 0x08, 0x08, 0x08],
  ':': [0x00, 0x36, 0x36, 0x00, 0x00],
  '0': [0x3e, 0x51, 0x49, 0x45, 0x3e],
  '1': [0x00, 0x42, 0x7f, 0x40, 0x00],
  '2': [0x42, 0x61, 0x51, 0x49, 0x46],
  '3': [0x21, 0x41, 0x45, 0x4b, 0x31],
  '4': [0x18, 0x14, 0x12, 0x7f, 0x10],
  '5': [0x27, 0x45, 0x45, 0x45, 0x39],
  '6': [0x3c, 0x4a, 0x49, 0x49, 0x30],
  '7': [0x01, 0x71, 0x09, 0x05, 0x03],
  '8': [0x36, 0x49, 0x49, 0x49, 0x36],
  '9': [0x06, 0x49, 0x49, 0x29, 0x1e],
  A: [0x7e, 0x11, 0x11, 0x11, 0x7e],
  B: [0x7f, 0x49, 0x49, 0x49, 0x36],
  C: [0x3e, 0x41, 0x41, 0x41, 0x22],
  D: [0x7f, 0x41, 0x41, 0x22, 0x1c],
  E: [0x7f, 0x49, 0x49, 0x49, 0x41],
  F: [0x7f, 0x09, 0x09, 0x09, 0x01],
  G: [0x3e, 0x41, 0x49, 0x49, 0x7a],
  H: [0x7f, 0x08, 0x08, 0x08, 0x7f],
  I: [0x00, 0x41, 0x7f, 0x41, 0x00],
  J: [0x20, 0x40, 0x41, 0x3f, 0x01],
  K: [0x7f, 0x08, 0x14, 0x22, 0x41],
  L: [0x7f, 0x40, 0x40, 0x40, 0x40],
  M: [0x7f, 0x02, 0x0c, 0x02, 0x7f],
  N: [0x7f, 0x04, 0x08, 0x10, 0x7f],
  O: [0x3e, 0x41, 0x41, 0x41, 0x3e],
  P: [0x7f, 0x09, 0x09, 0x09, 0x06],
  Q: [0x3e, 0x41, 0x51, 0x21, 0x5e],
  R: [0x7f, 0x09, 0x19, 0x29, 0x46],
  S: [0x46, 0x49, 0x49, 0x49, 0x31],
  T: [0x01, 0x01, 0x7f, 0x01, 0x01],
  U: [0x3f, 0x40, 0x40, 0x40, 0x3f],
  V: [0x1f, 0x20, 0x40, 0x20, 0x1f],
  W: [0x3f, 0x40, 0x38, 0x40, 0x3f],
  X: [0x63, 0x14, 0x08, 0x14, 0x63],
  Y: [0x07, 0x08, 0x70, 0x08, 0x07],
  Z: [0x61, 0x51, 0x49, 0x45, 0x43],
};

/** Return the 5-column bit pattern for a character; falls back to '?' → '?'. */
function glyph(ch: string): number[] {
  const up = ch.toUpperCase();
  return FONT_5x7[up] ?? FONT_5x7[' '];
}

// ── Bitmap builder ─────────────────────────────────────────────────────────

export class Bitmap96x64 {
  /** Column-major SSD1306-style buffer. */
  readonly buf: Uint8Array;

  constructor() {
    this.buf = new Uint8Array(OLED_BYTES);
  }

  clear(): void {
    this.buf.fill(0);
  }

  /**
   * Set a single pixel at (x, y). Coordinates outside 0..(w-1)/0..(h-1) are
   * silently ignored.
   */
  setPixel(x: number, y: number, on: boolean = true): void {
    if (x < 0 || x >= OLED_WIDTH || y < 0 || y >= OLED_HEIGHT) return;
    const page = Math.floor(y / 8);
    const bit = y % 8;
    const idx = page * OLED_WIDTH + x;
    if (on) this.buf[idx] |= (1 << bit);
    else    this.buf[idx] &= ~(1 << bit);
  }

  /** Draw a glyph column at (x, y). Each column of the glyph is 7 pixels tall. */
  drawGlyph(x: number, y: number, columns: number[], scale: number = 1): void {
    for (let cx = 0; cx < columns.length; cx++) {
      const col = columns[cx];
      for (let cy = 0; cy < 7; cy++) {
        if (col & (1 << cy)) {
          for (let dy = 0; dy < scale; dy++) {
            for (let dx = 0; dx < scale; dx++) {
              this.setPixel(x + cx * scale + dx, y + cy * scale + dy, true);
            }
          }
        }
      }
    }
  }

  /** Draw a run of characters starting at (x, y), spaced 1px apart, at `scale`. */
  drawText(x: number, y: number, text: string, scale: number = 1): number {
    let cx = x;
    for (const ch of text) {
      const g = glyph(ch);
      this.drawGlyph(cx, y, g, scale);
      cx += (g.length + 1) * scale;
    }
    return cx;    // right edge, for chaining
  }

  /** Compute the total pixel width `drawText` would produce for the given text. */
  static measure(text: string, scale: number = 1): number {
    let w = 0;
    for (const ch of text) {
      w += (glyph(ch).length + 1) * scale;
    }
    return Math.max(0, w - scale); // no trailing space
  }
}

// ── OledApi ────────────────────────────────────────────────────────────────

export interface BitmapUploadOpts {
  chunkSize?: number;
  onProgress?: (fraction: number) => void;
}

export class OledApi {
  constructor(private readonly ring: SadhanaRing) {}

  /** Push a raw 96×64 monochrome bitmap buffer to the OLED. */
  async sendBitmap(bitmap: Bitmap96x64, opts: BitmapUploadOpts = {}): Promise<void> {
    const bytes = bitmap.buf;
    const chunkSize = opts.chunkSize ?? CHUNK_SIZE;

    // INIT — [file_id, size_LE32]
    const initPayload = new Uint8Array(5);
    initPayload[0] = FILE_ID_BITMAP;
    initPayload[1] = bytes.length & 0xff;
    initPayload[2] = (bytes.length >> 8) & 0xff;
    initPayload[3] = (bytes.length >> 16) & 0xff;
    initPayload[4] = (bytes.length >> 24) & 0xff;
    await this.ring.queue.send(OP_FILE_OTA_7_3_0, initPayload, {
      expectReply: true,
      timeoutMs: 3000,
      maxRetries: 1,
    });

    // CHUNK loop
    let sent = 0;
    while (sent < bytes.length) {
      const len = Math.min(chunkSize, bytes.length - sent);
      const chunk = bytes.subarray(sent, sent + len);
      const header = new Uint8Array(6);
      header[0] = sent & 0xff;
      header[1] = (sent >> 8) & 0xff;
      header[2] = (sent >> 16) & 0xff;
      header[3] = (sent >> 24) & 0xff;
      header[4] = len & 0xff;
      header[5] = (len >> 8) & 0xff;
      const payload = new Uint8Array(header.length + len);
      payload.set(header, 0);
      payload.set(chunk, header.length);
      await this.ring.queue.send(OP_FILE_OTA_7_4_0, payload, {
        expectReply: false,
        maxRetries: 2,
      });
      sent += len;
      opts.onProgress?.(sent / bytes.length);
    }

    // COMMIT — [file_id, size_LE32, crc16_LE]
    const crc = crc16arc(bytes);
    const commitPayload = new Uint8Array(7);
    commitPayload[0] = FILE_ID_BITMAP;
    commitPayload[1] = bytes.length & 0xff;
    commitPayload[2] = (bytes.length >> 8) & 0xff;
    commitPayload[3] = (bytes.length >> 16) & 0xff;
    commitPayload[4] = (bytes.length >> 24) & 0xff;
    commitPayload[5] = crc & 0xff;
    commitPayload[6] = (crc >> 8) & 0xff;
    await this.ring.queue.send(OP_FILE_OTA_7_4_48, commitPayload, {
      expectReply: true,
      timeoutMs: 3000,
      maxRetries: 0,
    });
  }

  /**
   * Deity display for japa-counter mode: renders the first N characters of
   * the deity name (default 2), centered and scaled to fit the 96×64 OLED.
   * With scale=4 the glyph is 20 px wide × 28 px tall — comfortable for
   * two characters like "Ta", "Ch", "Sr".
   */
  async setDeityDisplay(name: string, chars: number = 2): Promise<void> {
    const label = name.replace(/[^a-zA-Z]/g, '').slice(0, chars).toUpperCase();
    if (!label) throw new Error('deity name must contain at least one letter');

    // Pick the largest scale that fits horizontally.
    let scale = 4;
    while (scale > 1 && Bitmap96x64.measure(label, scale) > OLED_WIDTH - 8) {
      scale--;
    }
    const w = Bitmap96x64.measure(label, scale);
    const h = 7 * scale;
    const x = Math.max(0, Math.floor((OLED_WIDTH - w) / 2));
    const y = Math.max(0, Math.floor((OLED_HEIGHT - h) / 2));

    const bmp = new Bitmap96x64();
    bmp.drawText(x, y, label, scale);
    await this.sendBitmap(bmp);
  }

  /** Convenience — clear the display (send an all-zero bitmap). */
  async clear(): Promise<void> {
    const bmp = new Bitmap96x64();
    await this.sendBitmap(bmp);
  }
}
