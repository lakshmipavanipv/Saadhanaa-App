/**
 * Sadhana Ring SDK — public entrypoint.
 *
 * Talks to Jieli-family smart rings (same protocol as the RWfit reference
 * device) over BLE. Layered as codec → transport → send queue → feature APIs.
 *
 * Usage:
 *   import { SadhanaRing } from './soulsync/ring';
 *
 *   const ring = await SadhanaRing.connectByScan();
 *   const battery = await ring.device.getBattery();
 *   const fw = await ring.device.getFirmwareInfo();
 *   await ring.device.setDateTime();
 *
 *   // Live frames (any incoming ring→phone packet):
 *   ring.queue.attach();
 *   // Subscribe via constructor events, or read raw notifications through queue.
 */

export { SadhanaRing, type SadhanaRingInfo, type FrameObserver } from './SadhanaRing';
export {
  DeviceApi,
  type BatteryStatus,
  type FirmwareInfo,
  type Capabilities,
  type PersonProfile,
} from './device';
export {
  scanForRings,
  requestRingPermissions,
  waitForBluetoothOn,
  SERVICE_DATA,
  CHAR_WRITE,
  CHAR_NOTIFY,
  type ScannedRing,
  type ConnectedRing,
  type RingPlatform,
} from './transport';
export {
  buildFrame,
  parseFirstPacket,
  crc16arc,
  FrameReassembler,
  FLAG_REQUEST,
  FLAG_REPLY,
  type JieliFrame,
} from './codec';
export {
  RingCommandQueue,
  type SendOptions,
  type QueueEvents,
} from './sendQueue';
export {
  lookupOpcode,
  lookupBySendMsgId,
  ALL_OPCODES,
  type Opcode,
  type OpcodeCategory,
} from './opcodes.generated';
export {
  SyncApi,
  SYNC_METRICS,
  ringTsToDate,
  sleepModelToStage,
  type SyncMetric,
  type SyncResult,
  type HrSample,
  type Spo2Sample,
  type BpSample,
  type HrvSample,
  type TempSample,
  type StressSample,
  type SugarSample,
  type SleepSample,
  type StepSample,
  type TasbihSample,
  type SleepStage,
  type TsSample,
} from './sync';
export {
  JapaRingCounter,
  saveSr16DeviceId,
  readSr16DeviceId,
  type TapHandler,
  type CounterEvents,
} from './japaCounter';
export { getRingStepsToday, type RingStepsToday } from './ringSteps';
export { syncAllRingVitals, type RingVitalsSyncResult } from './ringVitalsSync';
export {
  syncJapaHistory,
  readJapaWatermark,
  clearJapaWatermark,
  type JapaHistorySyncResult,
} from './japaHistorySync';
