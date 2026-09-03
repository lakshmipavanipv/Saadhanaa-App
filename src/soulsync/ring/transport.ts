/**
 * RingBleTransport — thin wrapper around react-native-ble-plx that owns the
 * GATT connection to a Jieli-family smart ring and exposes:
 *
 *   scan()      → stream of nearby ring candidates
 *   connect()   → complete the a00a/b002/b003 handshake
 *   write(bytes)→ GATT write to b002 (chunked to MTU-3)
 *   onNotify(cb)→ subscribe to b003; decodes base64 → Uint8Array
 *
 * UUIDs and scan/handshake sequence are lifted from the RWfit RE study:
 *   • Main data service      0x00a00a
 *   • Write characteristic   0x00b002
 *   • Notify characteristic  0x00b003
 *   • Jieli RCSP OTA service 0x00ae00 (presence ⇒ platform = Jieli)
 *
 * Scan matches by raw advertising bytes (RWfit scans with EMPTY_LIST and
 * matches prefixes). We approximate by looking at manufacturerData / service
 * UUIDs / name substrings — react-native-ble-plx does not expose the raw
 * ad-record bytes on every OS, so this is best-effort. On-device we can
 * fall back to a user-picker if the auto-match misses.
 */

import { BleManager, Device, Subscription, BleError, State } from 'react-native-ble-plx';
import { Platform, PermissionsAndroid } from 'react-native';
import { Buffer } from 'buffer';

export const SERVICE_DATA = '0000a00a-0000-1000-8000-00805f9b34fb';
export const CHAR_WRITE = '0000b002-0000-1000-8000-00805f9b34fb';
export const CHAR_NOTIFY = '0000b003-0000-1000-8000-00805f9b34fb';
export const SERVICE_JIELI_OTA = '0000ae00-0000-1000-8000-00805f9b34fb';
export const SERVICE_PXI_OTA = '0000ff00-0000-1000-8000-00805f9b34fb';
export const SERVICE_TELINK_OTA = '00010203-0405-0607-0809-0a0b0c0d1912';

export type RingPlatform = 'jieli' | 'realtek' | 'telink' | 'pxi' | 'unknown';

export interface ScannedRing {
  id: string;               // GATT device id (MAC on Android, UUID on iOS)
  name: string | null;
  rssi: number | null;
  manufacturerId: number | null;
  hint: 'a00a-service' | 'company-05d6' | 'company-06d6' | 'name-smartbox' | 'name-ac701n' | 'other';
}

export interface ConnectedRing {
  device: Device;
  platform: RingPlatform;
  mtu: number;
  effectivePayload: number;   // bytes we can write per GATT frame
  /** Data-service UUID the transport ended up binding to (may differ from SERVICE_DATA if we fell back). */
  dataServiceUuid: string;
  /** Write characteristic UUID actually used. */
  writeCharUuid: string;
  /** Notify characteristic UUID actually used. */
  notifyCharUuid: string;
  /** Every service+characteristic UUID the ring exposes, in discovery order (useful for debugging). */
  services: { service: string; characteristics: { uuid: string; write: boolean; notify: boolean; indicate: boolean }[] }[];
  write(bytes: Uint8Array): Promise<void>;
  onNotify(handler: (bytes: Uint8Array) => void): Subscription;
  onDisconnect(cb: (err: BleError | null) => void): Subscription;
  disconnect(): Promise<void>;
}

let managerRef: BleManager | null = null;
export const getBleManager = (): BleManager => {
  if (!managerRef) managerRef = new BleManager();
  return managerRef;
};

/**
 * Request Android runtime permissions the ring transport needs. Safe to call
 * multiple times — the platform de-duplicates.
 */
export async function requestRingPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const sdk = Platform.Version as number;
  try {
    if (sdk >= 31) {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
      return Object.values(granted).every((v) => v === PermissionsAndroid.RESULTS.GRANTED);
    }
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

export async function waitForBluetoothOn(timeoutMs = 6000): Promise<boolean> {
  const m = getBleManager();
  if ((await m.state()) === State.PoweredOn) return true;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      sub.remove();
      resolve(false);
    }, timeoutMs);
    const sub = m.onStateChange((s) => {
      if (s === State.PoweredOn) {
        clearTimeout(timer);
        sub.remove();
        resolve(true);
      }
    }, true);
  });
}

/**
 * Classify an advertising record against the four RWfit prefix rules.
 * `manufacturerData` (b64) format is [companyId_lo, companyId_hi, …].
 */
function classifyAd(
  name: string | null,
  serviceUUIDs: string[] | null,
  manufacturerDataB64: string | null
): { hint: ScannedRing['hint']; manufacturerId: number | null } | null {
  const lname = name?.toLowerCase() ?? '';
  if (lname.includes('smartbox')) return { hint: 'name-smartbox', manufacturerId: null };
  if (lname.includes('ac701n')) return { hint: 'name-ac701n', manufacturerId: null };

  if (serviceUUIDs?.some((u) => u.toLowerCase() === SERVICE_DATA)) {
    return { hint: 'a00a-service', manufacturerId: null };
  }

  if (manufacturerDataB64) {
    const buf = Buffer.from(manufacturerDataB64, 'base64');
    if (buf.length >= 2) {
      const companyId = buf[0] | (buf[1] << 8);
      if (companyId === 0x05d6) return { hint: 'company-05d6', manufacturerId: companyId };
      if (companyId === 0x06d6) return { hint: 'company-06d6', manufacturerId: companyId };
    }
  }
  return null;
}

/**
 * Begin scanning. `onCandidate` fires once per newly-seen ring. Call the
 * returned stop() function or wait for the internal timeout.
 */
export function scanForRings(
  onCandidate: (r: ScannedRing) => void,
  onError: (err: string) => void,
  opts: { timeoutMs?: number; permissive?: boolean } = {}
): () => void {
  const { timeoutMs = 15000, permissive = false } = opts;
  const m = getBleManager();
  const seen = new Set<string>();

  m.startDeviceScan(null, { allowDuplicates: false }, (err, device) => {
    if (err) {
      onError(err.message || 'scan failed');
      return;
    }
    if (!device || seen.has(device.id)) return;

    const cls = classifyAd(device.name, device.serviceUUIDs, device.manufacturerData);
    if (!cls && !permissive) return;
    if (!cls && permissive && !device.name) return;

    seen.add(device.id);
    onCandidate({
      id: device.id,
      name: device.name,
      rssi: device.rssi,
      manufacturerId: cls?.manufacturerId ?? null,
      hint: cls?.hint ?? 'other',
    });
  });

  const t = setTimeout(() => m.stopDeviceScan(), timeoutMs);
  return () => {
    clearTimeout(t);
    m.stopDeviceScan();
  };
}

async function pickMtuForPlatform(platform: RingPlatform, device: Device): Promise<number> {
  const target = platform === 'realtek' ? 239 : platform === 'jieli' || platform === 'pxi' ? 185 : 509;
  try {
    const d = await device.requestMTU(target);
    return d.mtu;
  } catch {
    return 23; // BLE default; keeps us alive on old stacks
  }
}

async function detectPlatform(device: Device): Promise<RingPlatform> {
  const services = await device.services();
  const ids = services.map((s) => s.uuid.toLowerCase());
  if (ids.includes(SERVICE_JIELI_OTA)) return 'jieli';
  if (ids.includes(SERVICE_TELINK_OTA)) return 'telink';
  if (ids.includes(SERVICE_PXI_OTA)) return 'pxi';
  // No OTA service ⇒ default to Jieli (main a00a still works) unless caller overrides.
  return 'jieli';
}

/**
 * Enumerate every service + characteristic the ring exposes, then pick the
 * data service. Prefers 0x00a00a/b002/b003 (RWfit white-label layout); if the
 * ring uses different UUIDs (e.g. "LIVSMT" variant), falls back to any service
 * whose characteristic UUIDs include the 16-bit b002/b003 pattern.
 */
async function pickDataChannel(device: Device): Promise<{
  dataServiceUuid: string;
  writeCharUuid: string;
  notifyCharUuid: string;
  services: ConnectedRing['services'];
}> {
  const services = await device.services();
  const summary: ConnectedRing['services'] = [];
  for (const s of services) {
    const chars = await s.characteristics();
    summary.push({
      service: s.uuid,
      characteristics: chars.map((c) => ({
        uuid: c.uuid,
        write: !!c.isWritableWithResponse || !!c.isWritableWithoutResponse,
        notify: !!c.isNotifiable,
        indicate: !!c.isIndicatable,
      })),
    });
  }

  const preferService = summary.find((s) => s.service.toLowerCase() === SERVICE_DATA);
  if (preferService) {
    const w = preferService.characteristics.find((c) => c.uuid.toLowerCase() === CHAR_WRITE && c.write);
    const n = preferService.characteristics.find((c) => c.uuid.toLowerCase() === CHAR_NOTIFY && c.notify);
    if (w && n) {
      return {
        dataServiceUuid: preferService.service,
        writeCharUuid: w.uuid,
        notifyCharUuid: n.uuid,
        services: summary,
      };
    }
  }

  // Fallback: some rings advertise a custom 128-bit vendor service that
  // wraps the same b002/b003 shape. Pick the first service that has BOTH a
  // writable characteristic and a notify characteristic; prefer ones whose
  // UUIDs contain "b002" / "b003".
  for (const s of summary) {
    const w = s.characteristics.find((c) => c.write && /b002/i.test(c.uuid))
      || s.characteristics.find((c) => c.write);
    const n = s.characteristics.find((c) => c.notify && /b003/i.test(c.uuid))
      || s.characteristics.find((c) => c.notify);
    if (w && n) {
      return {
        dataServiceUuid: s.service,
        writeCharUuid: w.uuid,
        notifyCharUuid: n.uuid,
        services: summary,
      };
    }
  }

  throw new Error(
    `no data service found; discovered ${summary.length} services: ` +
      summary.map((s) => s.service.slice(0, 8) + `(${s.characteristics.length}c)`).join(', ')
  );
}

/**
 * Connect + discover + subscribe. Resolves once b003 notifications are live
 * and b002 is ready to write.
 */
export async function connectRing(deviceId: string): Promise<ConnectedRing> {
  const m = getBleManager();
  m.stopDeviceScan();

  const raw = await m.connectToDevice(deviceId, { requestMTU: 185, timeout: 10000 });
  await raw.discoverAllServicesAndCharacteristics();

  const platform = await detectPlatform(raw);
  const mtu = await pickMtuForPlatform(platform, raw);
  const effectivePayload = Math.max(20, mtu - (platform === 'realtek' ? 16 : 3));

  try {
    await raw.requestConnectionPriority(1 /* HIGH */);
  } catch {
    /* not critical */
  }

  const { dataServiceUuid, writeCharUuid, notifyCharUuid, services } = await pickDataChannel(raw);

  const write = async (bytes: Uint8Array): Promise<void> => {
    const b64 = Buffer.from(bytes).toString('base64');
    await raw.writeCharacteristicWithResponseForService(dataServiceUuid, writeCharUuid, b64);
  };

  const onNotify = (handler: (bytes: Uint8Array) => void): Subscription =>
    raw.monitorCharacteristicForService(dataServiceUuid, notifyCharUuid, (err, ch) => {
      if (err || !ch?.value) return;
      try {
        handler(new Uint8Array(Buffer.from(ch.value, 'base64')));
      } catch {
        /* drop malformed */
      }
    });

  const onDisconnect = (cb: (err: BleError | null) => void): Subscription =>
    m.onDeviceDisconnected(deviceId, (err) => cb(err));

  const disconnect = async () => {
    try {
      await m.cancelDeviceConnection(deviceId);
    } catch {
      /* device already gone */
    }
  };

  return {
    device: raw,
    platform,
    mtu,
    effectivePayload,
    dataServiceUuid,
    writeCharUuid,
    notifyCharUuid,
    services,
    write,
    onNotify,
    onDisconnect,
    disconnect,
  };
}
