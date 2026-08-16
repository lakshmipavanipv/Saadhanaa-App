/**
 * OtaApi — Jieli RCSP-style firmware upgrade over CMD 7 (FILE_OTA).
 *
 * Wire (from y5/c.java + firmware feature table):
 *   INIT   0x0E   → OP_FILE_OTA_7_1_0  · {7, 1, 0}
 *                    payload = [size_LE32]
 *   CHUNK  0x17   → OP_FILE_OTA_7_8_0  · {7, 8, 0}
 *                    payload = [offset_LE32, len_LE16, bytes...]
 *   COMMIT 0x18   → OP_FILE_OTA_7_11_0 · {7, 11, 0}
 *                    payload = [size_LE32, crc16_LE]
 *   REBOOT 0x22   → OP_FILE_OTA_7_12_0 · {7, 12, 0}
 *                    payload = []
 *
 * Chunking:
 *   Jieli MTUs land around 240-247 bytes payload space per frame. With the
 *   9-byte frame overhead + our 6-byte CHUNK header (offset + len), a safe
 *   chunk size is 200 bytes. Callers can override via opts.chunkSize.
 *
 * CRC16-ARC:
 *   Same polynomial/init the codec uses for frame integrity (crc16arc).
 *
 * Usage:
 *   const ota = ring.ota;
 *   await ota.upload(binaryBytes, { onProgress: (pct) => console.log(pct) });
 *   // Ring resets itself; connection drops. Rescan/pair afterwards.
 *
 * SAFETY: OTA can brick the ring if power is lost mid-upload or the wrong
 * binary is flashed. Never call upload() outside a hard user-confirmed flow.
 */

import type { SadhanaRing } from './SadhanaRing';
import { crc16arc } from './codec';
import {
  OP_FILE_OTA_7_1_0,
  OP_FILE_OTA_7_8_0,
  OP_FILE_OTA_7_11_0,
  OP_FILE_OTA_7_12_0,
} from './opcodes.generated';

const DEFAULT_CHUNK_SIZE = 200;

export interface OtaUploadOpts {
  /** Bytes per CHUNK write. Default 200 — safe for Jieli 247-byte MTU. */
  chunkSize?: number;
  /** Called after each chunk with the fraction [0, 1]. */
  onProgress?: (fraction: number, bytesSent: number, totalBytes: number) => void;
  /** Called if a chunk needs retry. */
  onRetry?: (offset: number, attempt: number) => void;
  /** Called with the final CRC + total bytes right before commit. */
  onCommit?: (crc: number, total: number) => void;
  /** Milliseconds between chunks (throttle). Default 10ms. */
  delayBetweenChunksMs?: number;
}

export class OtaApi {
  constructor(private readonly ring: SadhanaRing) {}

  /**
   * Announce a firmware transfer to the ring. Ring returns an ACK we don't
   * inspect; if it nacks (unsupported opcode) it throws.
   */
  async init(sizeBytes: number): Promise<void> {
    const payload = u32le(sizeBytes);
    await this.ring.queue.send(OP_FILE_OTA_7_1_0, payload, {
      expectReply: true,
      timeoutMs: 4000,
      maxRetries: 1,
    });
  }

  /**
   * Write one chunk at the given offset. Firmware maintains an internal
   * write cursor; we send the offset explicitly for resilience across drops.
   */
  async writeChunk(offset: number, data: Uint8Array): Promise<void> {
    const header = new Uint8Array(6);
    // offset LE32
    header[0] = offset & 0xff;
    header[1] = (offset >> 8) & 0xff;
    header[2] = (offset >> 16) & 0xff;
    header[3] = (offset >> 24) & 0xff;
    // length LE16
    header[4] = data.length & 0xff;
    header[5] = (data.length >> 8) & 0xff;
    const payload = new Uint8Array(header.length + data.length);
    payload.set(header, 0);
    payload.set(data, header.length);
    await this.ring.queue.send(OP_FILE_OTA_7_8_0, payload, {
      expectReply: false,
      maxRetries: 2,
    });
  }

  /**
   * Finalise the transfer. Ring recomputes the CRC over the received bytes
   * and, if it matches, commits the new firmware image to flash.
   */
  async commit(sizeBytes: number, crc16: number): Promise<void> {
    const payload = new Uint8Array(6);
    // size LE32
    payload[0] = sizeBytes & 0xff;
    payload[1] = (sizeBytes >> 8) & 0xff;
    payload[2] = (sizeBytes >> 16) & 0xff;
    payload[3] = (sizeBytes >> 24) & 0xff;
    // crc LE16
    payload[4] = crc16 & 0xff;
    payload[5] = (crc16 >> 8) & 0xff;
    await this.ring.queue.send(OP_FILE_OTA_7_11_0, payload, {
      expectReply: true,
      timeoutMs: 8000,
      maxRetries: 0,
    });
  }

  /**
   * Reboot the ring so it boots the freshly-committed firmware. Fire-and-
   * forget — the ring drops the link before the ACK arrives.
   */
  async reboot(): Promise<void> {
    try {
      await this.ring.queue.send(OP_FILE_OTA_7_12_0, new Uint8Array(0), {
        expectReply: false,
        maxRetries: 0,
      });
    } catch { /* expected — link goes down */ }
  }

  /**
   * Full upload: init → chunk loop → commit → reboot. Non-blocking on retry;
   * caller gets granular progress and can abort by throwing from onProgress.
   */
  async upload(bin: Uint8Array, opts: OtaUploadOpts = {}): Promise<void> {
    if (!bin || bin.length === 0) throw new Error('empty firmware binary');
    const chunkSize = opts.chunkSize ?? DEFAULT_CHUNK_SIZE;
    const delay = opts.delayBetweenChunksMs ?? 10;
    const total = bin.length;
    const crc = crc16arc(bin);

    await this.init(total);

    let sent = 0;
    while (sent < total) {
      const remaining = Math.min(chunkSize, total - sent);
      const chunk = bin.subarray(sent, sent + remaining);
      let attempt = 0;
      // Two-shot retry on the chunk before bailing out.
      while (true) {
        try {
          await this.writeChunk(sent, chunk);
          break;
        } catch (e) {
          attempt++;
          if (attempt >= 3) throw new Error(`chunk @${sent} failed: ${(e as Error).message}`);
          opts.onRetry?.(sent, attempt);
          await sleep(200 * attempt);
        }
      }
      sent += remaining;
      opts.onProgress?.(sent / total, sent, total);
      if (delay > 0 && sent < total) await sleep(delay);
    }

    opts.onCommit?.(crc, total);
    await this.commit(total, crc);
    await this.reboot();
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function u32le(n: number): Uint8Array {
  return new Uint8Array([
    n & 0xff,
    (n >> 8) & 0xff,
    (n >> 16) & 0xff,
    (n >> 24) & 0xff,
  ]);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
