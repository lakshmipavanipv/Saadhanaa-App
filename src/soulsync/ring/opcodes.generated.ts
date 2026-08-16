/**
 * Jieli opcode registry — GENERATED from y5/c.java (com.rw.revivalfit v6.0.5).
 * Do not edit by hand; re-run scratchpad/gen_opcodes.mjs.
 *
 * Each opcode is a triple {cmd, key, keyFlag} the app writes at frame offsets
 * 6/7/8 of the 0xAB Jieli frame. `sendMsgId` is the byte the internal
 * BleSendBean uses to identify the queued command; keeping the same
 * numbering lets us cross-reference log/debug output verbatim.
 */

export interface Opcode {
  readonly cmd: number;
  readonly key: number;
  readonly keyFlag: number;
  readonly sendMsgId: number;
  readonly category: OpcodeCategory;
  readonly name: string;
}

export type OpcodeCategory = 'HEALTH' | 'DEVICE_A' | 'DEVICE_B' | 'SYNC' | 'INFO' | 'FILE_OTA' | 'UNKNOWN';

export const OP_HEALTH_2_1_0: Opcode = { cmd: 0x02, key: 0x01, keyFlag: 0x00, sendMsgId: 0xf5, category: 'HEALTH', name: 'OP_HEALTH_2_1_0' };
export const OP_HEALTH_2_2_0: Opcode = { cmd: 0x02, key: 0x02, keyFlag: 0x00, sendMsgId: 0xf4, category: 'HEALTH', name: 'OP_HEALTH_2_2_0' };
export const OP_HEALTH_2_3_16: Opcode = { cmd: 0x02, key: 0x03, keyFlag: 0x10, sendMsgId: 0xf3, category: 'HEALTH', name: 'OP_HEALTH_2_3_16' };
export const OP_HEALTH_2_4_16: Opcode = { cmd: 0x02, key: 0x04, keyFlag: 0x10, sendMsgId: 0xf2, category: 'HEALTH', name: 'OP_HEALTH_2_4_16' };
export const OP_HEALTH_2_6_0: Opcode = { cmd: 0x02, key: 0x06, keyFlag: 0x00, sendMsgId: 0xec, category: 'HEALTH', name: 'OP_HEALTH_2_6_0' };
export const OP_HEALTH_2_7_0: Opcode = { cmd: 0x02, key: 0x07, keyFlag: 0x00, sendMsgId: 0xed, category: 'HEALTH', name: 'OP_HEALTH_2_7_0' };
export const OP_HEALTH_2_8_0: Opcode = { cmd: 0x02, key: 0x08, keyFlag: 0x00, sendMsgId: 0xeb, category: 'HEALTH', name: 'OP_HEALTH_2_8_0' };
export const OP_HEALTH_2_8_16: Opcode = { cmd: 0x02, key: 0x08, keyFlag: 0x10, sendMsgId: 0xea, category: 'HEALTH', name: 'OP_HEALTH_2_8_16' };
export const OP_HEALTH_2_9_0: Opcode = { cmd: 0x02, key: 0x09, keyFlag: 0x00, sendMsgId: 0xe9, category: 'HEALTH', name: 'OP_HEALTH_2_9_0' };
export const OP_HEALTH_2_9_16: Opcode = { cmd: 0x02, key: 0x09, keyFlag: 0x10, sendMsgId: 0xe8, category: 'HEALTH', name: 'OP_HEALTH_2_9_16' };
export const OP_HEALTH_2_10_0: Opcode = { cmd: 0x02, key: 0x0a, keyFlag: 0x00, sendMsgId: 0xe7, category: 'HEALTH', name: 'OP_HEALTH_2_10_0' };
export const OP_HEALTH_2_10_16: Opcode = { cmd: 0x02, key: 0x0a, keyFlag: 0x10, sendMsgId: 0xe6, category: 'HEALTH', name: 'OP_HEALTH_2_10_16' };
export const OP_HEALTH_2_11_0: Opcode = { cmd: 0x02, key: 0x0b, keyFlag: 0x00, sendMsgId: 0xe5, category: 'HEALTH', name: 'OP_HEALTH_2_11_0' };
export const OP_HEALTH_2_11_16: Opcode = { cmd: 0x02, key: 0x0b, keyFlag: 0x10, sendMsgId: 0xe4, category: 'HEALTH', name: 'OP_HEALTH_2_11_16' };
export const OP_HEALTH_2_12_0: Opcode = { cmd: 0x02, key: 0x0c, keyFlag: 0x00, sendMsgId: 0xe3, category: 'HEALTH', name: 'OP_HEALTH_2_12_0' };
export const OP_HEALTH_2_12_16: Opcode = { cmd: 0x02, key: 0x0c, keyFlag: 0x10, sendMsgId: 0xe2, category: 'HEALTH', name: 'OP_HEALTH_2_12_16' };
export const OP_HEALTH_2_13_0: Opcode = { cmd: 0x02, key: 0x0d, keyFlag: 0x00, sendMsgId: 0xe1, category: 'HEALTH', name: 'OP_HEALTH_2_13_0' };
export const OP_HEALTH_2_14_0: Opcode = { cmd: 0x02, key: 0x0e, keyFlag: 0x00, sendMsgId: 0xf0, category: 'HEALTH', name: 'OP_HEALTH_2_14_0' };
export const OP_HEALTH_2_15_0: Opcode = { cmd: 0x02, key: 0x0f, keyFlag: 0x00, sendMsgId: 0xf1, category: 'HEALTH', name: 'OP_HEALTH_2_15_0' };
export const OP_HEALTH_2_16_0: Opcode = { cmd: 0x02, key: 0x10, keyFlag: 0x00, sendMsgId: 0xe0, category: 'HEALTH', name: 'OP_HEALTH_2_16_0' };
export const OP_HEALTH_2_16_16: Opcode = { cmd: 0x02, key: 0x10, keyFlag: 0x10, sendMsgId: 0xdf, category: 'HEALTH', name: 'OP_HEALTH_2_16_16' };
export const OP_HEALTH_2_16_32: Opcode = { cmd: 0x02, key: 0x10, keyFlag: 0x20, sendMsgId: 0xde, category: 'HEALTH', name: 'OP_HEALTH_2_16_32' };
export const OP_HEALTH_2_16_48: Opcode = { cmd: 0x02, key: 0x10, keyFlag: 0x30, sendMsgId: 0xdd, category: 'HEALTH', name: 'OP_HEALTH_2_16_48' };
export const OP_HEALTH_2_17_0: Opcode = { cmd: 0x02, key: 0x11, keyFlag: 0x00, sendMsgId: 0xef, category: 'HEALTH', name: 'OP_HEALTH_2_17_0' };
export const OP_HEALTH_2_18_0: Opcode = { cmd: 0x02, key: 0x12, keyFlag: 0x00, sendMsgId: 0xda, category: 'HEALTH', name: 'OP_HEALTH_2_18_0' };
export const OP_HEALTH_2_18_16: Opcode = { cmd: 0x02, key: 0x12, keyFlag: 0x10, sendMsgId: 0xd9, category: 'HEALTH', name: 'OP_HEALTH_2_18_16' };
export const OP_HEALTH_2_19_0: Opcode = { cmd: 0x02, key: 0x13, keyFlag: 0x00, sendMsgId: 0xd8, category: 'HEALTH', name: 'OP_HEALTH_2_19_0' };
export const OP_HEALTH_2_20_0: Opcode = { cmd: 0x02, key: 0x14, keyFlag: 0x00, sendMsgId: 0xd7, category: 'HEALTH', name: 'OP_HEALTH_2_20_0' };
export const OP_HEALTH_2_20_16: Opcode = { cmd: 0x02, key: 0x14, keyFlag: 0x10, sendMsgId: 0xa6, category: 'HEALTH', name: 'OP_HEALTH_2_20_16' };
export const OP_HEALTH_2_22_0: Opcode = { cmd: 0x02, key: 0x16, keyFlag: 0x00, sendMsgId: 0xd5, category: 'HEALTH', name: 'OP_HEALTH_2_22_0' };
export const OP_HEALTH_2_22_16: Opcode = { cmd: 0x02, key: 0x16, keyFlag: 0x10, sendMsgId: 0xd4, category: 'HEALTH', name: 'OP_HEALTH_2_22_16' };
export const OP_HEALTH_2_25_0: Opcode = { cmd: 0x02, key: 0x19, keyFlag: 0x00, sendMsgId: 0xd3, category: 'HEALTH', name: 'OP_HEALTH_2_25_0' };
export const OP_HEALTH_2_26_0: Opcode = { cmd: 0x02, key: 0x1a, keyFlag: 0x00, sendMsgId: 0xd2, category: 'HEALTH', name: 'OP_HEALTH_2_26_0' };
export const OP_HEALTH_2_26_16: Opcode = { cmd: 0x02, key: 0x1a, keyFlag: 0x10, sendMsgId: 0x9f, category: 'HEALTH', name: 'OP_HEALTH_2_26_16' };
export const OP_HEALTH_2_27_0: Opcode = { cmd: 0x02, key: 0x1b, keyFlag: 0x00, sendMsgId: 0xd1, category: 'HEALTH', name: 'OP_HEALTH_2_27_0' };
export const OP_HEALTH_2_27_16: Opcode = { cmd: 0x02, key: 0x1b, keyFlag: 0x10, sendMsgId: 0xd0, category: 'HEALTH', name: 'OP_HEALTH_2_27_16' };
export const OP_HEALTH_2_28_0: Opcode = { cmd: 0x02, key: 0x1c, keyFlag: 0x00, sendMsgId: 0xcf, category: 'HEALTH', name: 'OP_HEALTH_2_28_0' };
export const OP_HEALTH_2_28_16: Opcode = { cmd: 0x02, key: 0x1c, keyFlag: 0x10, sendMsgId: 0xce, category: 'HEALTH', name: 'OP_HEALTH_2_28_16' };
export const OP_HEALTH_2_29_0: Opcode = { cmd: 0x02, key: 0x1d, keyFlag: 0x00, sendMsgId: 0xee, category: 'HEALTH', name: 'OP_HEALTH_2_29_0' };
export const OP_HEALTH_2_30_0: Opcode = { cmd: 0x02, key: 0x1e, keyFlag: 0x00, sendMsgId: 0xcd, category: 'HEALTH', name: 'OP_HEALTH_2_30_0' };
export const OP_HEALTH_2_30_16: Opcode = { cmd: 0x02, key: 0x1e, keyFlag: 0x10, sendMsgId: 0xcc, category: 'HEALTH', name: 'OP_HEALTH_2_30_16' };
export const OP_HEALTH_2_33_0: Opcode = { cmd: 0x02, key: 0x21, keyFlag: 0x00, sendMsgId: 0xdc, category: 'HEALTH', name: 'OP_HEALTH_2_33_0' };
export const OP_HEALTH_2_33_16: Opcode = { cmd: 0x02, key: 0x21, keyFlag: 0x10, sendMsgId: 0xdb, category: 'HEALTH', name: 'OP_HEALTH_2_33_16' };
export const OP_HEALTH_2_34_0: Opcode = { cmd: 0x02, key: 0x22, keyFlag: 0x00, sendMsgId: 0xc7, category: 'HEALTH', name: 'OP_HEALTH_2_34_0' };
export const OP_HEALTH_2_35_0: Opcode = { cmd: 0x02, key: 0x23, keyFlag: 0x00, sendMsgId: 0xc6, category: 'HEALTH', name: 'OP_HEALTH_2_35_0' };
export const OP_HEALTH_2_36_0: Opcode = { cmd: 0x02, key: 0x24, keyFlag: 0x00, sendMsgId: 0xc5, category: 'HEALTH', name: 'OP_HEALTH_2_36_0' };
export const OP_HEALTH_2_37_0: Opcode = { cmd: 0x02, key: 0x25, keyFlag: 0x00, sendMsgId: 0xcb, category: 'HEALTH', name: 'OP_HEALTH_2_37_0' };
export const OP_HEALTH_2_37_16: Opcode = { cmd: 0x02, key: 0x25, keyFlag: 0x10, sendMsgId: 0xca, category: 'HEALTH', name: 'OP_HEALTH_2_37_16' };
export const OP_HEALTH_2_38_0: Opcode = { cmd: 0x02, key: 0x26, keyFlag: 0x00, sendMsgId: 0xc9, category: 'HEALTH', name: 'OP_HEALTH_2_38_0' };
export const OP_HEALTH_2_38_16: Opcode = { cmd: 0x02, key: 0x26, keyFlag: 0x10, sendMsgId: 0xc8, category: 'HEALTH', name: 'OP_HEALTH_2_38_16' };
export const OP_HEALTH_2_49_0: Opcode = { cmd: 0x02, key: 0x31, keyFlag: 0x00, sendMsgId: 0x75, category: 'HEALTH', name: 'OP_HEALTH_2_49_0' };
export const OP_HEALTH_2_52_0: Opcode = { cmd: 0x02, key: 0x34, keyFlag: 0x00, sendMsgId: 0xd6, category: 'HEALTH', name: 'OP_HEALTH_2_52_0' };
export const OP_HEALTH_2_77_0: Opcode = { cmd: 0x02, key: 0x4d, keyFlag: 0x00, sendMsgId: 0x9d, category: 'HEALTH', name: 'OP_HEALTH_2_77_0' };
export const OP_HEALTH_2_78_0: Opcode = { cmd: 0x02, key: 0x4e, keyFlag: 0x00, sendMsgId: 0x9c, category: 'HEALTH', name: 'OP_HEALTH_2_78_0' };
export const OP_HEALTH_2_79_0: Opcode = { cmd: 0x02, key: 0x4f, keyFlag: 0x00, sendMsgId: 0x9b, category: 'HEALTH', name: 'OP_HEALTH_2_79_0' };
export const OP_HEALTH_2_83_0: Opcode = { cmd: 0x02, key: 0x53, keyFlag: 0x00, sendMsgId: 0x2e, category: 'HEALTH', name: 'OP_HEALTH_2_83_0' };
export const OP_HEALTH_2_96_0: Opcode = { cmd: 0x02, key: 0x60, keyFlag: 0x00, sendMsgId: 0x2a, category: 'HEALTH', name: 'OP_HEALTH_2_96_0' };
export const OP_HEALTH_2_96_16: Opcode = { cmd: 0x02, key: 0x60, keyFlag: 0x10, sendMsgId: 0x2f, category: 'HEALTH', name: 'OP_HEALTH_2_96_16' };
export const OP_HEALTH_2_97_0: Opcode = { cmd: 0x02, key: 0x61, keyFlag: 0x00, sendMsgId: 0x94, category: 'HEALTH', name: 'OP_HEALTH_2_97_0' };
export const OP_HEALTH_2_97_16: Opcode = { cmd: 0x02, key: 0x61, keyFlag: 0x10, sendMsgId: 0x95, category: 'HEALTH', name: 'OP_HEALTH_2_97_16' };
export const OP_HEALTH_2_98_16: Opcode = { cmd: 0x02, key: 0x62, keyFlag: 0x10, sendMsgId: 0x98, category: 'HEALTH', name: 'OP_HEALTH_2_98_16' };
export const OP_HEALTH_2_99_16: Opcode = { cmd: 0x02, key: 0x63, keyFlag: 0x10, sendMsgId: 0x12, category: 'HEALTH', name: 'OP_HEALTH_2_99_16' };
export const OP_HEALTH_2_100_0: Opcode = { cmd: 0x02, key: 0x64, keyFlag: 0x00, sendMsgId: 0x13, category: 'HEALTH', name: 'OP_HEALTH_2_100_0' };
export const OP_HEALTH_2_100_16: Opcode = { cmd: 0x02, key: 0x64, keyFlag: 0x10, sendMsgId: 0x14, category: 'HEALTH', name: 'OP_HEALTH_2_100_16' };
export const OP_HEALTH_2_101_0: Opcode = { cmd: 0x02, key: 0x65, keyFlag: 0x00, sendMsgId: 0x16, category: 'HEALTH', name: 'OP_HEALTH_2_101_0' };
export const OP_HEALTH_2_101_16: Opcode = { cmd: 0x02, key: 0x65, keyFlag: 0x10, sendMsgId: 0x17, category: 'HEALTH', name: 'OP_HEALTH_2_101_16' };
export const OP_HEALTH_2_102_0: Opcode = { cmd: 0x02, key: 0x66, keyFlag: 0x00, sendMsgId: 0x18, category: 'HEALTH', name: 'OP_HEALTH_2_102_0' };
export const OP_HEALTH_2_102_16: Opcode = { cmd: 0x02, key: 0x66, keyFlag: 0x10, sendMsgId: 0x19, category: 'HEALTH', name: 'OP_HEALTH_2_102_16' };
export const OP_HEALTH_2_103_0: Opcode = { cmd: 0x02, key: 0x67, keyFlag: 0x00, sendMsgId: 0x1a, category: 'HEALTH', name: 'OP_HEALTH_2_103_0' };
export const OP_HEALTH_2_103_16: Opcode = { cmd: 0x02, key: 0x67, keyFlag: 0x10, sendMsgId: 0x1b, category: 'HEALTH', name: 'OP_HEALTH_2_103_16' };
export const OP_HEALTH_2_104_0: Opcode = { cmd: 0x02, key: 0x68, keyFlag: 0x00, sendMsgId: 0x1d, category: 'HEALTH', name: 'OP_HEALTH_2_104_0' };
export const OP_HEALTH_2_104_16: Opcode = { cmd: 0x02, key: 0x68, keyFlag: 0x10, sendMsgId: 0x1e, category: 'HEALTH', name: 'OP_HEALTH_2_104_16' };
export const OP_HEALTH_2_105_0: Opcode = { cmd: 0x02, key: 0x69, keyFlag: 0x00, sendMsgId: 0x22, category: 'HEALTH', name: 'OP_HEALTH_2_105_0' };
export const OP_HEALTH_2_106_0: Opcode = { cmd: 0x02, key: 0x6a, keyFlag: 0x00, sendMsgId: 0x20, category: 'HEALTH', name: 'OP_HEALTH_2_106_0' };
export const OP_HEALTH_2_106_16: Opcode = { cmd: 0x02, key: 0x6a, keyFlag: 0x10, sendMsgId: 0x21, category: 'HEALTH', name: 'OP_HEALTH_2_106_16' };
export const OP_HEALTH_2_107_0: Opcode = { cmd: 0x02, key: 0x6b, keyFlag: 0x00, sendMsgId: 0x23, category: 'HEALTH', name: 'OP_HEALTH_2_107_0' };
export const OP_HEALTH_2_107_16: Opcode = { cmd: 0x02, key: 0x6b, keyFlag: 0x10, sendMsgId: 0x24, category: 'HEALTH', name: 'OP_HEALTH_2_107_16' };
export const OP_HEALTH_2_108_0: Opcode = { cmd: 0x02, key: 0x6c, keyFlag: 0x00, sendMsgId: 0x25, category: 'HEALTH', name: 'OP_HEALTH_2_108_0' };
export const OP_HEALTH_2_109_0: Opcode = { cmd: 0x02, key: 0x6d, keyFlag: 0x00, sendMsgId: 0x28, category: 'HEALTH', name: 'OP_HEALTH_2_109_0' };
export const OP_HEALTH_2_109_16: Opcode = { cmd: 0x02, key: 0x6d, keyFlag: 0x10, sendMsgId: 0x29, category: 'HEALTH', name: 'OP_HEALTH_2_109_16' };
export const OP_HEALTH_2_110_0: Opcode = { cmd: 0x02, key: 0x6e, keyFlag: 0x00, sendMsgId: 0x26, category: 'HEALTH', name: 'OP_HEALTH_2_110_0' };
export const OP_HEALTH_2_110_16: Opcode = { cmd: 0x02, key: 0x6e, keyFlag: 0x10, sendMsgId: 0x27, category: 'HEALTH', name: 'OP_HEALTH_2_110_16' };
export const OP_HEALTH_2_111_0: Opcode = { cmd: 0x02, key: 0x6f, keyFlag: 0x00, sendMsgId: 0x2c, category: 'HEALTH', name: 'OP_HEALTH_2_111_0' };
export const OP_HEALTH_2_111_16: Opcode = { cmd: 0x02, key: 0x6f, keyFlag: 0x10, sendMsgId: 0x2d, category: 'HEALTH', name: 'OP_HEALTH_2_111_16' };
export const OP_HEALTH_2_112_16: Opcode = { cmd: 0x02, key: 0x70, keyFlag: 0x10, sendMsgId: 0x31, category: 'HEALTH', name: 'OP_HEALTH_2_112_16' };
export const OP_HEALTH_2_114_0: Opcode = { cmd: 0x02, key: 0x72, keyFlag: 0x00, sendMsgId: 0x32, category: 'HEALTH', name: 'OP_HEALTH_2_114_0' };
export const OP_HEALTH_2_114_16: Opcode = { cmd: 0x02, key: 0x72, keyFlag: 0x10, sendMsgId: 0x33, category: 'HEALTH', name: 'OP_HEALTH_2_114_16' };
export const OP_HEALTH_2_115_0: Opcode = { cmd: 0x02, key: 0x73, keyFlag: 0x00, sendMsgId: 0x34, category: 'HEALTH', name: 'OP_HEALTH_2_115_0' };
export const OP_HEALTH_2_115_16: Opcode = { cmd: 0x02, key: 0x73, keyFlag: 0x10, sendMsgId: 0x35, category: 'HEALTH', name: 'OP_HEALTH_2_115_16' };
export const OP_HEALTH_2_116_0: Opcode = { cmd: 0x02, key: 0x74, keyFlag: 0x00, sendMsgId: 0x39, category: 'HEALTH', name: 'OP_HEALTH_2_116_0' };
export const OP_HEALTH_2_118_0: Opcode = { cmd: 0x02, key: 0x76, keyFlag: 0x00, sendMsgId: 0x3a, category: 'HEALTH', name: 'OP_HEALTH_2_118_0' };
export const OP_HEALTH_2_119_0: Opcode = { cmd: 0x02, key: 0x77, keyFlag: 0x00, sendMsgId: 0x3c, category: 'HEALTH', name: 'OP_HEALTH_2_119_0' };
export const OP_HEALTH_2_119_16: Opcode = { cmd: 0x02, key: 0x77, keyFlag: 0x10, sendMsgId: 0x3d, category: 'HEALTH', name: 'OP_HEALTH_2_119_16' };
export const OP_HEALTH_2_120_0: Opcode = { cmd: 0x02, key: 0x78, keyFlag: 0x00, sendMsgId: 0x41, category: 'HEALTH', name: 'OP_HEALTH_2_120_0' };
export const OP_HEALTH_2_120_16: Opcode = { cmd: 0x02, key: 0x78, keyFlag: 0x10, sendMsgId: 0x48, category: 'HEALTH', name: 'OP_HEALTH_2_120_16' };
export const OP_HEALTH_2_121_0: Opcode = { cmd: 0x02, key: 0x79, keyFlag: 0x00, sendMsgId: 0x42, category: 'HEALTH', name: 'OP_HEALTH_2_121_0' };
export const OP_HEALTH_2_121_16: Opcode = { cmd: 0x02, key: 0x79, keyFlag: 0x10, sendMsgId: 0x43, category: 'HEALTH', name: 'OP_HEALTH_2_121_16' };
export const OP_HEALTH_2_122_0: Opcode = { cmd: 0x02, key: 0x7a, keyFlag: 0x00, sendMsgId: 0x44, category: 'HEALTH', name: 'OP_HEALTH_2_122_0' };
export const OP_HEALTH_2_122_16: Opcode = { cmd: 0x02, key: 0x7a, keyFlag: 0x10, sendMsgId: 0x45, category: 'HEALTH', name: 'OP_HEALTH_2_122_16' };
export const OP_HEALTH_2_123_0: Opcode = { cmd: 0x02, key: 0x7b, keyFlag: 0x00, sendMsgId: 0x46, category: 'HEALTH', name: 'OP_HEALTH_2_123_0' };
export const OP_HEALTH_2_124_0: Opcode = { cmd: 0x02, key: 0x7c, keyFlag: 0x00, sendMsgId: 0x4b, category: 'HEALTH', name: 'OP_HEALTH_2_124_0' };
export const OP_HEALTH_2_124_16: Opcode = { cmd: 0x02, key: 0x7c, keyFlag: 0x10, sendMsgId: 0x4a, category: 'HEALTH', name: 'OP_HEALTH_2_124_16' };
export const OP_DEVICE_A_3_1_0: Opcode = { cmd: 0x03, key: 0x01, keyFlag: 0x00, sendMsgId: 0xfd, category: 'DEVICE_A', name: 'OP_DEVICE_A_3_1_0' };
export const OP_DEVICE_A_3_1_32: Opcode = { cmd: 0x03, key: 0x01, keyFlag: 0x20, sendMsgId: 0xfc, category: 'DEVICE_A', name: 'OP_DEVICE_A_3_1_32' };
export const OP_DEVICE_A_3_2_32: Opcode = { cmd: 0x03, key: 0x02, keyFlag: 0x20, sendMsgId: 0xfb, category: 'DEVICE_A', name: 'OP_DEVICE_A_3_2_32' };
export const OP_DEVICE_B_4_1_0: Opcode = { cmd: 0x04, key: 0x01, keyFlag: 0x00, sendMsgId: 0xfa, category: 'DEVICE_B', name: 'OP_DEVICE_B_4_1_0' };
export const OP_DEVICE_B_4_2_0: Opcode = { cmd: 0x04, key: 0x02, keyFlag: 0x00, sendMsgId: 0xa0, category: 'DEVICE_B', name: 'OP_DEVICE_B_4_2_0' };
export const OP_DEVICE_B_4_3_0: Opcode = { cmd: 0x04, key: 0x03, keyFlag: 0x00, sendMsgId: 0xb1, category: 'DEVICE_B', name: 'OP_DEVICE_B_4_3_0' };
export const OP_DEVICE_B_4_3_16: Opcode = { cmd: 0x04, key: 0x03, keyFlag: 0x10, sendMsgId: 0xb0, category: 'DEVICE_B', name: 'OP_DEVICE_B_4_3_16' };
export const OP_DEVICE_B_4_3_32: Opcode = { cmd: 0x04, key: 0x03, keyFlag: 0x20, sendMsgId: 0xaf, category: 'DEVICE_B', name: 'OP_DEVICE_B_4_3_32' };
export const OP_DEVICE_B_4_3_48: Opcode = { cmd: 0x04, key: 0x03, keyFlag: 0x30, sendMsgId: 0xae, category: 'DEVICE_B', name: 'OP_DEVICE_B_4_3_48' };
export const OP_DEVICE_B_4_4_0: Opcode = { cmd: 0x04, key: 0x04, keyFlag: 0x00, sendMsgId: 0xb4, category: 'DEVICE_B', name: 'OP_DEVICE_B_4_4_0' };
export const OP_DEVICE_B_4_5_0: Opcode = { cmd: 0x04, key: 0x05, keyFlag: 0x00, sendMsgId: 0xb3, category: 'DEVICE_B', name: 'OP_DEVICE_B_4_5_0' };
export const OP_DEVICE_B_4_10_0: Opcode = { cmd: 0x04, key: 0x0a, keyFlag: 0x00, sendMsgId: 0xa8, category: 'DEVICE_B', name: 'OP_DEVICE_B_4_10_0' };
export const OP_SYNC_5_2_16: Opcode = { cmd: 0x05, key: 0x02, keyFlag: 0x10, sendMsgId: 0xc4, category: 'SYNC', name: 'OP_SYNC_5_2_16' };
export const OP_SYNC_5_2_48: Opcode = { cmd: 0x05, key: 0x02, keyFlag: 0x30, sendMsgId: 0xc3, category: 'SYNC', name: 'OP_SYNC_5_2_48' };
export const OP_SYNC_5_3_16: Opcode = { cmd: 0x05, key: 0x03, keyFlag: 0x10, sendMsgId: 0xc2, category: 'SYNC', name: 'OP_SYNC_5_3_16' };
export const OP_SYNC_5_3_48: Opcode = { cmd: 0x05, key: 0x03, keyFlag: 0x30, sendMsgId: 0xc1, category: 'SYNC', name: 'OP_SYNC_5_3_48' };
export const OP_SYNC_5_4_16: Opcode = { cmd: 0x05, key: 0x04, keyFlag: 0x10, sendMsgId: 0xc0, category: 'SYNC', name: 'OP_SYNC_5_4_16' };
export const OP_SYNC_5_4_48: Opcode = { cmd: 0x05, key: 0x04, keyFlag: 0x30, sendMsgId: 0xbf, category: 'SYNC', name: 'OP_SYNC_5_4_48' };
export const OP_SYNC_5_5_16: Opcode = { cmd: 0x05, key: 0x05, keyFlag: 0x10, sendMsgId: 0xbe, category: 'SYNC', name: 'OP_SYNC_5_5_16' };
export const OP_SYNC_5_5_48: Opcode = { cmd: 0x05, key: 0x05, keyFlag: 0x30, sendMsgId: 0xbd, category: 'SYNC', name: 'OP_SYNC_5_5_48' };
export const OP_SYNC_5_8_16: Opcode = { cmd: 0x05, key: 0x08, keyFlag: 0x10, sendMsgId: 0xbc, category: 'SYNC', name: 'OP_SYNC_5_8_16' };
export const OP_SYNC_5_8_48: Opcode = { cmd: 0x05, key: 0x08, keyFlag: 0x30, sendMsgId: 0xbb, category: 'SYNC', name: 'OP_SYNC_5_8_48' };
export const OP_SYNC_5_9_16: Opcode = { cmd: 0x05, key: 0x09, keyFlag: 0x10, sendMsgId: 0xba, category: 'SYNC', name: 'OP_SYNC_5_9_16' };
export const OP_SYNC_5_9_48: Opcode = { cmd: 0x05, key: 0x09, keyFlag: 0x30, sendMsgId: 0xb9, category: 'SYNC', name: 'OP_SYNC_5_9_48' };
export const OP_SYNC_5_10_16: Opcode = { cmd: 0x05, key: 0x0a, keyFlag: 0x10, sendMsgId: 0xb8, category: 'SYNC', name: 'OP_SYNC_5_10_16' };
export const OP_SYNC_5_10_48: Opcode = { cmd: 0x05, key: 0x0a, keyFlag: 0x30, sendMsgId: 0xb7, category: 'SYNC', name: 'OP_SYNC_5_10_48' };
export const OP_SYNC_5_11_16: Opcode = { cmd: 0x05, key: 0x0b, keyFlag: 0x10, sendMsgId: 0x96, category: 'SYNC', name: 'OP_SYNC_5_11_16' };
export const OP_SYNC_5_13_16: Opcode = { cmd: 0x05, key: 0x0d, keyFlag: 0x10, sendMsgId: 0xb6, category: 'SYNC', name: 'OP_SYNC_5_13_16' };
export const OP_SYNC_5_13_48: Opcode = { cmd: 0x05, key: 0x0d, keyFlag: 0x30, sendMsgId: 0xb5, category: 'SYNC', name: 'OP_SYNC_5_13_48' };
export const OP_SYNC_5_14_16: Opcode = { cmd: 0x05, key: 0x0e, keyFlag: 0x10, sendMsgId: 0xad, category: 'SYNC', name: 'OP_SYNC_5_14_16' };
export const OP_SYNC_5_14_48: Opcode = { cmd: 0x05, key: 0x0e, keyFlag: 0x30, sendMsgId: 0xac, category: 'SYNC', name: 'OP_SYNC_5_14_48' };
export const OP_SYNC_5_16_16: Opcode = { cmd: 0x05, key: 0x10, keyFlag: 0x10, sendMsgId: 0x90, category: 'SYNC', name: 'OP_SYNC_5_16_16' };
export const OP_SYNC_5_16_48: Opcode = { cmd: 0x05, key: 0x10, keyFlag: 0x30, sendMsgId: 0x91, category: 'SYNC', name: 'OP_SYNC_5_16_48' };
export const OP_SYNC_5_23_16: Opcode = { cmd: 0x05, key: 0x17, keyFlag: 0x10, sendMsgId: 0x92, category: 'SYNC', name: 'OP_SYNC_5_23_16' };
export const OP_SYNC_5_23_48: Opcode = { cmd: 0x05, key: 0x17, keyFlag: 0x30, sendMsgId: 0x93, category: 'SYNC', name: 'OP_SYNC_5_23_48' };
export const OP_SYNC_5_26_16: Opcode = { cmd: 0x05, key: 0x1a, keyFlag: 0x10, sendMsgId: 0x97, category: 'SYNC', name: 'OP_SYNC_5_26_16' };
export const OP_SYNC_5_26_48: Opcode = { cmd: 0x05, key: 0x1a, keyFlag: 0x30, sendMsgId: 0x1c, category: 'SYNC', name: 'OP_SYNC_5_26_48' };
export const OP_SYNC_5_27_16: Opcode = { cmd: 0x05, key: 0x1b, keyFlag: 0x10, sendMsgId: 0x99, category: 'SYNC', name: 'OP_SYNC_5_27_16' };
export const OP_SYNC_5_27_48: Opcode = { cmd: 0x05, key: 0x1b, keyFlag: 0x30, sendMsgId: 0x9a, category: 'SYNC', name: 'OP_SYNC_5_27_48' };
export const OP_SYNC_5_28_16: Opcode = { cmd: 0x05, key: 0x1c, keyFlag: 0x10, sendMsgId: 0x71, category: 'SYNC', name: 'OP_SYNC_5_28_16' };
export const OP_SYNC_5_28_48: Opcode = { cmd: 0x05, key: 0x1c, keyFlag: 0x30, sendMsgId: 0x72, category: 'SYNC', name: 'OP_SYNC_5_28_48' };
export const OP_SYNC_5_29_16: Opcode = { cmd: 0x05, key: 0x1d, keyFlag: 0x10, sendMsgId: 0x3e, category: 'SYNC', name: 'OP_SYNC_5_29_16' };
export const OP_SYNC_5_29_48: Opcode = { cmd: 0x05, key: 0x1d, keyFlag: 0x30, sendMsgId: 0x3f, category: 'SYNC', name: 'OP_SYNC_5_29_48' };
export const OP_INFO_6_1_0: Opcode = { cmd: 0x06, key: 0x01, keyFlag: 0x00, sendMsgId: 0xf9, category: 'INFO', name: 'OP_INFO_6_1_0' };
export const OP_INFO_6_3_0: Opcode = { cmd: 0x06, key: 0x03, keyFlag: 0x00, sendMsgId: 0xa7, category: 'INFO', name: 'OP_INFO_6_3_0' };
export const OP_INFO_6_4_0: Opcode = { cmd: 0x06, key: 0x04, keyFlag: 0x00, sendMsgId: 0xb2, category: 'INFO', name: 'OP_INFO_6_4_0' };
export const OP_INFO_6_4_16: Opcode = { cmd: 0x06, key: 0x04, keyFlag: 0x10, sendMsgId: 0x47, category: 'INFO', name: 'OP_INFO_6_4_16' };
export const OP_INFO_6_5_0: Opcode = { cmd: 0x06, key: 0x05, keyFlag: 0x00, sendMsgId: 0xf8, category: 'INFO', name: 'OP_INFO_6_5_0' };
export const OP_INFO_6_9_0: Opcode = { cmd: 0x06, key: 0x09, keyFlag: 0x00, sendMsgId: 0x1f, category: 'INFO', name: 'OP_INFO_6_9_0' };
export const OP_INFO_6_16_0: Opcode = { cmd: 0x06, key: 0x10, keyFlag: 0x00, sendMsgId: 0x36, category: 'INFO', name: 'OP_INFO_6_16_0' };
export const OP_INFO_6_17_0: Opcode = { cmd: 0x06, key: 0x11, keyFlag: 0x00, sendMsgId: 0x3b, category: 'INFO', name: 'OP_INFO_6_17_0' };
export const OP_INFO_6_18_0: Opcode = { cmd: 0x06, key: 0x12, keyFlag: 0x00, sendMsgId: 0x40, category: 'INFO', name: 'OP_INFO_6_18_0' };
export const OP_FILE_OTA_7_1_0: Opcode = { cmd: 0x07, key: 0x01, keyFlag: 0x00, sendMsgId: 0xf7, category: 'FILE_OTA', name: 'OP_FILE_OTA_7_1_0' };
export const OP_FILE_OTA_7_3_0: Opcode = { cmd: 0x07, key: 0x03, keyFlag: 0x00, sendMsgId: 0xab, category: 'FILE_OTA', name: 'OP_FILE_OTA_7_3_0' };
export const OP_FILE_OTA_7_4_0: Opcode = { cmd: 0x07, key: 0x04, keyFlag: 0x00, sendMsgId: 0xf6, category: 'FILE_OTA', name: 'OP_FILE_OTA_7_4_0' };
export const OP_FILE_OTA_7_4_48: Opcode = { cmd: 0x07, key: 0x04, keyFlag: 0x30, sendMsgId: 0x9e, category: 'FILE_OTA', name: 'OP_FILE_OTA_7_4_48' };
export const OP_FILE_OTA_7_8_0: Opcode = { cmd: 0x07, key: 0x08, keyFlag: 0x00, sendMsgId: 0xa9, category: 'FILE_OTA', name: 'OP_FILE_OTA_7_8_0' };
export const OP_FILE_OTA_7_11_0: Opcode = { cmd: 0x07, key: 0x0b, keyFlag: 0x00, sendMsgId: 0xaa, category: 'FILE_OTA', name: 'OP_FILE_OTA_7_11_0' };
export const OP_FILE_OTA_7_12_0: Opcode = { cmd: 0x07, key: 0x0c, keyFlag: 0x00, sendMsgId: 0x15, category: 'FILE_OTA', name: 'OP_FILE_OTA_7_12_0' };

export const ALL_OPCODES: readonly Opcode[] = [
  OP_HEALTH_2_1_0,
  OP_HEALTH_2_2_0,
  OP_HEALTH_2_3_16,
  OP_HEALTH_2_4_16,
  OP_HEALTH_2_6_0,
  OP_HEALTH_2_7_0,
  OP_HEALTH_2_8_0,
  OP_HEALTH_2_8_16,
  OP_HEALTH_2_9_0,
  OP_HEALTH_2_9_16,
  OP_HEALTH_2_10_0,
  OP_HEALTH_2_10_16,
  OP_HEALTH_2_11_0,
  OP_HEALTH_2_11_16,
  OP_HEALTH_2_12_0,
  OP_HEALTH_2_12_16,
  OP_HEALTH_2_13_0,
  OP_HEALTH_2_14_0,
  OP_HEALTH_2_15_0,
  OP_HEALTH_2_16_0,
  OP_HEALTH_2_16_16,
  OP_HEALTH_2_16_32,
  OP_HEALTH_2_16_48,
  OP_HEALTH_2_17_0,
  OP_HEALTH_2_18_0,
  OP_HEALTH_2_18_16,
  OP_HEALTH_2_19_0,
  OP_HEALTH_2_20_0,
  OP_HEALTH_2_20_16,
  OP_HEALTH_2_22_0,
  OP_HEALTH_2_22_16,
  OP_HEALTH_2_25_0,
  OP_HEALTH_2_26_0,
  OP_HEALTH_2_26_16,
  OP_HEALTH_2_27_0,
  OP_HEALTH_2_27_16,
  OP_HEALTH_2_28_0,
  OP_HEALTH_2_28_16,
  OP_HEALTH_2_29_0,
  OP_HEALTH_2_30_0,
  OP_HEALTH_2_30_16,
  OP_HEALTH_2_33_0,
  OP_HEALTH_2_33_16,
  OP_HEALTH_2_34_0,
  OP_HEALTH_2_35_0,
  OP_HEALTH_2_36_0,
  OP_HEALTH_2_37_0,
  OP_HEALTH_2_37_16,
  OP_HEALTH_2_38_0,
  OP_HEALTH_2_38_16,
  OP_HEALTH_2_49_0,
  OP_HEALTH_2_52_0,
  OP_HEALTH_2_77_0,
  OP_HEALTH_2_78_0,
  OP_HEALTH_2_79_0,
  OP_HEALTH_2_83_0,
  OP_HEALTH_2_96_0,
  OP_HEALTH_2_96_16,
  OP_HEALTH_2_97_0,
  OP_HEALTH_2_97_16,
  OP_HEALTH_2_98_16,
  OP_HEALTH_2_99_16,
  OP_HEALTH_2_100_0,
  OP_HEALTH_2_100_16,
  OP_HEALTH_2_101_0,
  OP_HEALTH_2_101_16,
  OP_HEALTH_2_102_0,
  OP_HEALTH_2_102_16,
  OP_HEALTH_2_103_0,
  OP_HEALTH_2_103_16,
  OP_HEALTH_2_104_0,
  OP_HEALTH_2_104_16,
  OP_HEALTH_2_105_0,
  OP_HEALTH_2_106_0,
  OP_HEALTH_2_106_16,
  OP_HEALTH_2_107_0,
  OP_HEALTH_2_107_16,
  OP_HEALTH_2_108_0,
  OP_HEALTH_2_109_0,
  OP_HEALTH_2_109_16,
  OP_HEALTH_2_110_0,
  OP_HEALTH_2_110_16,
  OP_HEALTH_2_111_0,
  OP_HEALTH_2_111_16,
  OP_HEALTH_2_112_16,
  OP_HEALTH_2_114_0,
  OP_HEALTH_2_114_16,
  OP_HEALTH_2_115_0,
  OP_HEALTH_2_115_16,
  OP_HEALTH_2_116_0,
  OP_HEALTH_2_118_0,
  OP_HEALTH_2_119_0,
  OP_HEALTH_2_119_16,
  OP_HEALTH_2_120_0,
  OP_HEALTH_2_120_16,
  OP_HEALTH_2_121_0,
  OP_HEALTH_2_121_16,
  OP_HEALTH_2_122_0,
  OP_HEALTH_2_122_16,
  OP_HEALTH_2_123_0,
  OP_HEALTH_2_124_0,
  OP_HEALTH_2_124_16,
  OP_DEVICE_A_3_1_0,
  OP_DEVICE_A_3_1_32,
  OP_DEVICE_A_3_2_32,
  OP_DEVICE_B_4_1_0,
  OP_DEVICE_B_4_2_0,
  OP_DEVICE_B_4_3_0,
  OP_DEVICE_B_4_3_16,
  OP_DEVICE_B_4_3_32,
  OP_DEVICE_B_4_3_48,
  OP_DEVICE_B_4_4_0,
  OP_DEVICE_B_4_5_0,
  OP_DEVICE_B_4_10_0,
  OP_SYNC_5_2_16,
  OP_SYNC_5_2_48,
  OP_SYNC_5_3_16,
  OP_SYNC_5_3_48,
  OP_SYNC_5_4_16,
  OP_SYNC_5_4_48,
  OP_SYNC_5_5_16,
  OP_SYNC_5_5_48,
  OP_SYNC_5_8_16,
  OP_SYNC_5_8_48,
  OP_SYNC_5_9_16,
  OP_SYNC_5_9_48,
  OP_SYNC_5_10_16,
  OP_SYNC_5_10_48,
  OP_SYNC_5_11_16,
  OP_SYNC_5_13_16,
  OP_SYNC_5_13_48,
  OP_SYNC_5_14_16,
  OP_SYNC_5_14_48,
  OP_SYNC_5_16_16,
  OP_SYNC_5_16_48,
  OP_SYNC_5_23_16,
  OP_SYNC_5_23_48,
  OP_SYNC_5_26_16,
  OP_SYNC_5_26_48,
  OP_SYNC_5_27_16,
  OP_SYNC_5_27_48,
  OP_SYNC_5_28_16,
  OP_SYNC_5_28_48,
  OP_SYNC_5_29_16,
  OP_SYNC_5_29_48,
  OP_INFO_6_1_0,
  OP_INFO_6_3_0,
  OP_INFO_6_4_0,
  OP_INFO_6_4_16,
  OP_INFO_6_5_0,
  OP_INFO_6_9_0,
  OP_INFO_6_16_0,
  OP_INFO_6_17_0,
  OP_INFO_6_18_0,
  OP_FILE_OTA_7_1_0,
  OP_FILE_OTA_7_3_0,
  OP_FILE_OTA_7_4_0,
  OP_FILE_OTA_7_4_48,
  OP_FILE_OTA_7_8_0,
  OP_FILE_OTA_7_11_0,
  OP_FILE_OTA_7_12_0,
];

const BY_TUPLE = new Map<string, Opcode>();
const BY_SENDMSGID = new Map<number, Opcode>();
for (const op of ALL_OPCODES) {
  BY_TUPLE.set(`${op.cmd},${op.key},${op.keyFlag}`, op);
  BY_SENDMSGID.set(op.sendMsgId, op);
}

export function lookupOpcode(cmd: number, key: number, keyFlag: number): Opcode | undefined {
  return BY_TUPLE.get(`${cmd & 0xff},${key & 0xff},${keyFlag & 0xff}`);
}

export function lookupBySendMsgId(id: number): Opcode | undefined {
  return BY_SENDMSGID.get(id & 0xff);
}
