/**
 * Jieli send queue — mirrors x5/c.java (CmdHandlerJLUtils) behavior:
 *
 *  • Serialize writes on the b002 characteristic (only one in-flight).
 *  • After each write, wait for either:
 *      – a matching notify frame  {cmd,key,keyFlag} from the ring, OR
 *      – the "auto-reply" ACK (sendMsgId 0x11) which we send back and treat
 *        as a synthetic completion for opcodes that don't reply on their own.
 *  • Up to 3 retries with per-attempt timeout (RWfit uses ~230ms → 3 tries).
 *  • Multi-packet responses are reassembled by the caller (see codec.ts);
 *    the queue just delivers each completed JieliFrame to a global bus,
 *    and pending requests filter by (cmd,key,keyFlag).
 *
 * Callers use send({op, payload}) → Promise<JieliFrame>. The promise resolves
 * with the ring's reply frame (payload only — codec.ts already stripped the
 * 3-byte header). File-transfer opcodes (CMD 7) don't wait for a body reply
 * and complete on GATT-write-finish; expose that via `{expectReply: false}`.
 */

import type { ConnectedRing } from './transport';
import {
  buildFrame,
  buildAutoReply,
  parseFirstPacket,
  FrameReassembler,
  FLAG_REPLY,
  FLAG_REQUEST,
  type JieliFrame,
} from './codec';
import type { Opcode } from './opcodes.generated';

export interface SendOptions {
  /** Reply-carrying opcodes: wait for the ring to notify a matching frame. */
  expectReply?: boolean;
  /** ms per attempt — RWfit defaults to ~230ms; long-running requests can extend. */
  timeoutMs?: number;
  /** how many times to resend on timeout before rejecting. */
  maxRetries?: number;
  /** override the flag byte (default: FLAG_REQUEST). */
  flag?: number;
}

interface PendingRequest {
  op: Opcode;
  resolve: (frame: JieliFrame) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
  expectReply: boolean;
  retriesLeft: number;
  bytes: Uint8Array;
  timeoutMs: number;
}

export interface QueueEvents {
  /** Any frame from the ring, whether or not it matched a pending request. */
  onIncomingFrame?: (frame: JieliFrame) => void;
  onSendError?: (err: Error, op?: Opcode) => void;
}

export class RingCommandQueue {
  private queue: PendingRequest[] = [];
  private inFlight: PendingRequest | null = null;
  private reassembler: FrameReassembler | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly ring: ConnectedRing, private readonly events: QueueEvents = {}) {}

  /** Start listening on b003. Idempotent. */
  attach(): void {
    if (this.unsubscribe) return;
    const sub = this.ring.onNotify((bytes) => this.handleNotify(bytes));
    this.unsubscribe = () => sub.remove();
  }

  detach(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    // fail any in-flight/queued requests
    const err = new Error('queue detached');
    if (this.inFlight) {
      this.clearTimer(this.inFlight);
      this.inFlight.reject(err);
      this.inFlight = null;
    }
    for (const p of this.queue) p.reject(err);
    this.queue.length = 0;
    this.reassembler = null;
  }

  send(op: Opcode, payload: Uint8Array = new Uint8Array(0), opts: SendOptions = {}): Promise<JieliFrame> {
    const {
      expectReply = true,
      timeoutMs = 2500,
      maxRetries = 3,
      flag = FLAG_REQUEST,
    } = opts;

    const bytes = buildFrame({ flag, cmd: op.cmd, key: op.key, keyFlag: op.keyFlag, payload });

    return new Promise((resolve, reject) => {
      const req: PendingRequest = {
        op,
        resolve,
        reject,
        timer: null,
        expectReply,
        retriesLeft: maxRetries,
        bytes,
        timeoutMs,
      };
      this.queue.push(req);
      void this.pump();
    });
  }

  private async pump(): Promise<void> {
    if (this.inFlight || this.queue.length === 0) return;
    const req = this.queue.shift()!;
    this.inFlight = req;
    await this.attemptSend(req);
  }

  private async attemptSend(req: PendingRequest): Promise<void> {
    try {
      await this.writeChunked(req.bytes);
    } catch (err) {
      this.events.onSendError?.(err as Error, req.op);
      this.finishInFlight();
      req.reject(err as Error);
      void this.pump();
      return;
    }

    if (!req.expectReply) {
      this.finishInFlight();
      // Synthesize a frame indicating write-only success.
      req.resolve({
        flag: FLAG_REQUEST,
        cmd: req.op.cmd,
        key: req.op.key,
        keyFlag: req.op.keyFlag,
        payload: new Uint8Array(0),
      });
      void this.pump();
      return;
    }

    req.timer = setTimeout(() => this.onTimeout(req), req.timeoutMs);
  }

  private async writeChunked(bytes: Uint8Array): Promise<void> {
    const chunkSize = this.ring.effectivePayload;
    for (let off = 0; off < bytes.length; off += chunkSize) {
      const slice = bytes.subarray(off, off + chunkSize);
      await this.ring.write(slice);
    }
  }

  private handleNotify(bytes: Uint8Array): void {
    if (this.reassembler) {
      this.reassembler.append(bytes);
      if (this.reassembler.done()) {
        const { frame, crcOk } = this.reassembler.finalize();
        this.reassembler = null;
        if (!crcOk) {
          // Silent drop — mirrors RWfit's "包校验失败" behavior.
          return;
        }
        this.dispatchFrame(frame);
      }
      return;
    }

    const parsed = parseFirstPacket(bytes);
    switch (parsed.kind) {
      case 'complete':
        this.dispatchFrame(parsed.frame);
        return;
      case 'multi_start':
        this.reassembler = new FrameReassembler(parsed.header, parsed.firstChunk);
        return;
      case 'bad_magic':
      case 'short':
        return;
    }
  }

  private dispatchFrame(frame: JieliFrame): void {
    this.events.onIncomingFrame?.(frame);

    // Auto-reply per r5/b.java:450 — anything that isn't already a reply gets
    // an echo back so the ring stops resending. Fire-and-forget; the ring
    // doesn't ACK the ACK, and errors here shouldn't fail the read path.
    if (frame.flag !== FLAG_REPLY) {
      const ack = buildAutoReply(frame.cmd, frame.key, frame.keyFlag);
      void this.ring.write(ack).catch(() => {});
    }

    // Match against in-flight request. RWfit's x5.c.f() matches on the
    // {CMD,Key,KeyFlag} triple stored at willSendData[6..8].
    const req = this.inFlight;
    if (
      req &&
      req.expectReply &&
      frame.cmd === req.op.cmd &&
      frame.key === req.op.key &&
      frame.keyFlag === req.op.keyFlag
    ) {
      this.clearTimer(req);
      this.finishInFlight();
      req.resolve(frame);
      void this.pump();
    }
  }

  private onTimeout(req: PendingRequest): void {
    if (this.inFlight !== req) return; // stale timer
    if (req.retriesLeft > 0) {
      req.retriesLeft--;
      void this.attemptSend(req);
      return;
    }
    this.finishInFlight();
    req.reject(new Error(`timeout waiting for ${req.op.name}`));
    void this.pump();
  }

  private clearTimer(req: PendingRequest): void {
    if (req.timer) {
      clearTimeout(req.timer);
      req.timer = null;
    }
  }

  private finishInFlight(): void {
    if (this.inFlight) this.clearTimer(this.inFlight);
    this.inFlight = null;
  }
}
