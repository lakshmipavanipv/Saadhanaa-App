/**
 * Jieli ring framing codec (0xAB protocol).
 *
 * Wire layout — confirmed from r5/b.java onCharacteristicChanged parser:
 *
 *   [0]     0xAB           magic byte
 *   [1]     flag           0x11 = auto-reply / ACK, else request
 *   [2..3]  dataLen (BE)   length of CMD + Key + KeyFlag + payload
 *   [4..5]  CRC16 (BE)     CRC16/ARC over CMD + Key + KeyFlag + payload
 *   [6]     CMD            category (2=health,3/4=settings,5=sync,6=info,7=file/OTA)
 *   [7]     Key            command id
 *   [8]     KeyFlag        sub-type
 *   [9..]   payload        dataLen-3 bytes
 *
 * Multi-packet: if dataLen exceeds MTU payload, continuation packets carry
 * raw payload bytes with NO 6-byte header — they're concatenated to the
 * accumulator until dataLen bytes of body (CMD+Key+KeyFlag+payload) have
 * been received. See Reassembler.
 *
 * CRC16/ARC = reflected poly 0xA001, init 0x0000, no final XOR. Table lifted
 * from y5/d.java f20004a[] (256 entries). Comparison in RWfit is done as a
 * lowercase hex string (see r5/b.java:415 / :444), i.e. big-endian bytes.
 */

// prettier-ignore
const CRC16_ARC_TABLE = new Uint16Array([
  0,49345,49537,320,49921,960,640,49729,50689,1728,1920,51009,1280,50625,50305,1088,
  52225,3264,3456,52545,3840,53185,52865,3648,2560,51905,52097,2880,51457,2496,2176,51265,
  55297,6336,6528,55617,6912,56257,55937,6720,7680,57025,57217,8000,56577,7616,7296,56385,
  5120,54465,54657,5440,55041,6080,5760,54849,53761,4800,4992,54081,4352,53697,53377,4160,
  61441,12480,12672,61761,13056,62401,62081,12864,13824,63169,63361,14144,62721,13760,13440,62529,
  15360,64705,64897,15680,65281,16320,16000,65089,64001,15040,15232,64321,14592,63937,63617,14400,
  10240,59585,59777,10560,60161,11200,10880,59969,60929,11968,12160,61249,11520,60865,60545,11328,
  58369,9408,9600,58689,9984,59329,59009,9792,8704,58049,58241,9024,57601,8640,8320,57409,
  40961,24768,24960,41281,25344,41921,41601,25152,26112,42689,42881,26432,42241,26048,25728,42049,
  27648,44225,44417,27968,44801,28608,28288,44609,43521,27328,27520,43841,26880,43457,43137,26688,
  30720,47297,47489,31040,47873,31680,31360,47681,48641,32448,32640,48961,32000,48577,48257,31808,
  46081,29888,30080,46401,30464,47041,46721,30272,29184,45761,45953,29504,45313,29120,28800,45121,
  20480,37057,37249,20800,37633,21440,21120,37441,38401,22208,22400,38721,21760,38337,38017,21568,
  39937,23744,23936,40257,24320,40897,40577,24128,23040,39617,39809,23360,39169,22976,22656,38977,
  34817,18624,18816,35137,19200,35777,35457,19008,19968,36545,36737,20288,36097,19904,19584,35905,
  17408,33985,34177,17728,34561,18368,18048,34369,33281,17088,17280,33601,16640,33217,32897,16448,
]);

export function crc16arc(bytes: Uint8Array): number {
  let crc = 0;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC16_ARC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return crc & 0xffff;
}

export const MAGIC = 0xab;
// Confirmed empirically from HCI capture: every phone→ring request uses
// flag 0x01, and every non-reply ring→phone frame uses flag 0x01 too. The
// auto-ACK/echo in both directions uses flag 0x11.
export const FLAG_REQUEST = 0x01;
export const FLAG_REPLY = 0x11;

export interface JieliFrame {
  flag: number;      // 0x11 = reply, else request
  cmd: number;       // category byte at offset 6
  key: number;       // command id at offset 7
  keyFlag: number;   // sub-type at offset 8
  payload: Uint8Array; // bytes after KeyFlag
}

/**
 * Build a Jieli 0xAB frame ready for GATT write.
 *
 * dataLen = 3 (CMD+Key+KeyFlag) + payload.length
 * CRC over the same body bytes (offsets 6..6+dataLen).
 */
export function buildFrame(f: JieliFrame): Uint8Array {
  const dataLen = 3 + f.payload.length;
  if (dataLen > 0xffff) {
    throw new RangeError(`payload too long: ${f.payload.length} (dataLen ${dataLen} > 0xffff)`);
  }
  const body = new Uint8Array(dataLen);
  body[0] = f.cmd & 0xff;
  body[1] = f.key & 0xff;
  body[2] = f.keyFlag & 0xff;
  body.set(f.payload, 3);

  const crc = crc16arc(body);

  const out = new Uint8Array(6 + dataLen);
  out[0] = MAGIC;
  out[1] = f.flag & 0xff;
  out[2] = (dataLen >> 8) & 0xff;
  out[3] = dataLen & 0xff;
  out[4] = (crc >> 8) & 0xff;
  out[5] = crc & 0xff;
  out.set(body, 6);
  return out;
}

export type ParsedSingle =
  | { kind: 'complete'; frame: JieliFrame; consumed: number }
  | { kind: 'multi_start'; header: FrameHeader; firstChunk: Uint8Array }
  | { kind: 'bad_magic'; consumed: number }
  | { kind: 'short'; needed: number };

export interface FrameHeader {
  flag: number;
  dataLen: number;   // total body bytes expected (CMD+Key+KeyFlag+payload)
  crc: number;       // BE-encoded CRC as advertised
  cmd: number;
  key: number;
  keyFlag: number;
}

/**
 * Parse the first packet of a frame. If the whole frame fits in this one
 * BLE MTU-sized notification, returns {kind:'complete'}. If the ring is
 * about to spread the body across follow-up packets, returns the header
 * plus the first body chunk — feed subsequent packets to a Reassembler.
 */
export function parseFirstPacket(pkt: Uint8Array): ParsedSingle {
  if (pkt.length < 9) return { kind: 'short', needed: 9 - pkt.length };
  if (pkt[0] !== MAGIC) return { kind: 'bad_magic', consumed: 1 };

  const flag = pkt[1];
  const dataLen = ((pkt[2] & 0xff) << 8) | (pkt[3] & 0xff);
  const crc = ((pkt[4] & 0xff) << 8) | (pkt[5] & 0xff);
  const cmd = pkt[6];
  const key = pkt[7];
  const keyFlag = pkt[8];

  const bodyInThisPkt = pkt.length - 6;
  if (bodyInThisPkt >= dataLen) {
    const body = pkt.slice(6, 6 + dataLen);
    return {
      kind: 'complete',
      frame: {
        flag,
        cmd,
        key,
        keyFlag,
        payload: body.slice(3),
      },
      consumed: 6 + dataLen,
    };
  }

  return {
    kind: 'multi_start',
    header: { flag, dataLen, crc, cmd, key, keyFlag },
    firstChunk: pkt.slice(6), // includes CMD/Key/KeyFlag as first 3 bytes of body
  };
}

/**
 * CRC of an incoming body. Compare against the header's advertised value
 * before trusting the frame. The RWfit parser compares lowercase hex; we
 * compare integers.
 */
export function verifyCrc(body: Uint8Array, expectedCrc: number): boolean {
  return crc16arc(body) === (expectedCrc & 0xffff);
}

/**
 * Multi-packet reassembler. Feed the header + first chunk from parseFirstPacket,
 * then feed each subsequent notify packet (raw bytes, NO header) to append().
 * When the body is complete, done() returns true and the finalize() gives
 * you a JieliFrame ready to dispatch — CRC already checked.
 */
export class FrameReassembler {
  private buf: Uint8Array;
  private written = 0;
  constructor(private readonly header: FrameHeader, firstChunk: Uint8Array) {
    this.buf = new Uint8Array(header.dataLen);
    this.append(firstChunk);
  }

  append(chunk: Uint8Array): void {
    const room = this.buf.length - this.written;
    const take = Math.min(room, chunk.length);
    this.buf.set(chunk.subarray(0, take), this.written);
    this.written += take;
  }

  done(): boolean {
    return this.written >= this.buf.length;
  }

  finalize(): { frame: JieliFrame; crcOk: boolean } {
    const crcOk = verifyCrc(this.buf, this.header.crc);
    return {
      frame: {
        flag: this.header.flag,
        cmd: this.header.cmd,
        key: this.header.key,
        keyFlag: this.header.keyFlag,
        payload: this.buf.slice(3),
      },
      crcOk,
    };
  }
}

/**
 * Build the auto-reply frame the app is expected to send after any non-reply
 * frame is received (see r5/b.java:450-465). Body is just {cmd, key, keyFlag},
 * flag=0x11. Special case: cmd=6/key=9 pads body to 4 bytes with a zero.
 */
export function buildAutoReply(cmd: number, key: number, keyFlag: number): Uint8Array {
  const isPadded69 = cmd === 6 && key === 9;
  const payload = isPadded69 ? new Uint8Array([0]) : new Uint8Array(0);
  return buildFrame({ flag: FLAG_REPLY, cmd, key, keyFlag, payload });
}
