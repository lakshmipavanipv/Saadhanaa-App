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

import {
  BleManager, Device, Subscription, BleError, State,
  ScanMode, ScanCallbackType,
} from 'react-native-ble-plx';
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
  hint: 'a00a-service' | 'company-05d6' | 'company-06d6' | 'name-smartbox' | 'name-ac701n' | 'name-generic-ring' | 'jieli-ota-service' | 'pxi-ota-service' | 'other';
  /**
   * RWfit's own device-type code for the advertiser, for parity when
   * comparing our scan against theirs: 1 = 0xA00A service, 2 = company
   * 0x05D6, 3 = either of those on a SmartBox/AC701N_watch name, 4 = company
   * 0x06D6, 239 = the 0x05D6 "AT" record. Null when only our own looser
   * parsed-field rules matched.
   */
  rwType: 1 | 2 | 3 | 4 | 239 | null;
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
 * RWfit's four advertising patterns, matched against the raw record.
 *
 * Taken verbatim from its scanner (`r5/d.java`, tag "ScanBleService"). Two
 * details there are easy to get wrong and both matter:
 *
 *   • It matches `contains`, not a prefix. The class copies the first 9 bytes
 *     into an array and then never uses it — the comparison runs against the
 *     whole advertising record, so a ring whose flags or name push these
 *     bytes further along still matches.
 *   • It requires the advertiser to have a name. An unnamed device is dropped
 *     before the patterns are even tested.
 *
 * Ordering is RWfit's: 0xA00A first, then 0x06D6, then the "AT" record, with
 * plain 0x05D6 as the fallback.
 */
const RW_AD_PATTERNS: { hex: string; type: 1 | 2 | 4 | 239; hint: ScannedRing['hint'] }[] = [
  // 02 01 06 03 03 0a a0 — flags + 16-bit service 0xA00A
  { hex: '02010603030aa0', type: 1,   hint: 'a00a-service' },
  // d6 06 02 00 — company 0x06D6
  { hex: 'd6060200',       type: 4,   hint: 'company-06d6' },
  // 15 ff d6 05 41 54 — company 0x05D6 followed by ASCII "AT"
  { hex: '15ffd6054154',   type: 239, hint: 'company-05d6' },
  // d6 05 02 00 — company 0x05D6
  { hex: 'd6050200',       type: 2,   hint: 'company-05d6' },
];

const toHex = (buf: Buffer): string => buf.toString('hex').toLowerCase();

/**
 * Classify an advertising record.
 *
 * The raw-record rules above are RWfit's and are tried first, because they see
 * the bytes exactly as the ring sent them. The parsed-field rules that follow
 * are ours and strictly looser — react-native-ble-plx has already split out
 * service UUIDs and manufacturer data, which catches rings whose record is
 * laid out differently than the four shapes RWfit happens to know about.
 */
function classifyAd(
  name: string | null,
  serviceUUIDs: string[] | null,
  manufacturerDataB64: string | null,
  rawScanRecordB64: string | null
): { hint: ScannedRing['hint']; manufacturerId: number | null; rwType: ScannedRing['rwType'] } | null {
  const lname = name?.toLowerCase() ?? '';
  // RWfit treats these names as an upgrade of an already-matched advertiser
  // (type 1 or 2 becomes 3), never as a match on their own.
  const isBondableName = lname.includes('smartbox') || lname.includes('ac701n_watch');

  if (rawScanRecordB64 && name) {
    const raw = Buffer.from(rawScanRecordB64, 'base64');
    if (raw.length >= 9) {
      const hex = toHex(raw);
      for (const p of RW_AD_PATTERNS) {
        if (!hex.includes(p.hex)) continue;
        const rwType = (p.type === 1 || p.type === 2) && isBondableName ? 3 : p.type;
        const manufacturerId =
          p.hint === 'company-05d6' ? 0x05d6 : p.hint === 'company-06d6' ? 0x06d6 : null;
        return { hint: p.hint, manufacturerId, rwType };
      }
    }
  }

  // Our own rules. Unlike RWfit's, a bondable name alone is enough here — the
  // debug screen relies on it to surface a ring whose advertising is odd.
  if (lname.includes('smartbox')) return { hint: 'name-smartbox', manufacturerId: null, rwType: null };
  if (lname.includes('ac701n')) return { hint: 'name-ac701n', manufacturerId: null, rwType: null };

  if (serviceUUIDs?.some((u) => u.toLowerCase() === SERVICE_DATA)) {
    return { hint: 'a00a-service', manufacturerId: null, rwType: null };
  }

  // Vendor OTA services are a strong tell — these are the firmware-update
  // services Jieli/PXI rings advertise alongside their data service, and
  // they identify a ring even when the main data UUID is renamed.
  if (serviceUUIDs?.some((u) => u.toLowerCase() === SERVICE_JIELI_OTA)) {
    return { hint: 'jieli-ota-service', manufacturerId: null, rwType: null };
  }
  if (serviceUUIDs?.some((u) => u.toLowerCase() === SERVICE_PXI_OTA)) {
    return { hint: 'pxi-ota-service', manufacturerId: null, rwType: null };
  }

  if (manufacturerDataB64) {
    const buf = Buffer.from(manufacturerDataB64, 'base64');
    if (buf.length >= 2) {
      const companyId = buf[0] | (buf[1] << 8);
      if (companyId === 0x05d6) return { hint: 'company-05d6', manufacturerId: companyId, rwType: null };
      if (companyId === 0x06d6) return { hint: 'company-06d6', manufacturerId: companyId, rwType: null };
    }
  }

  // Name-based catch-all for rings whose advertising shape we don't know.
  // Other smart-ring apps pair with the user's ring and this app doesn't
  // because the four RWfit prefix rules only cover one OEM. These patterns
  // cover what every mainstream ring on the market names itself:
  //   SR16 / SR20 / SR21     → common Jieli-family SmartRings (user's ring)
  //   R02 / R06 / R09 / R10  → COLMI ring family
  //   LIVSMT-xx              → LIVSMT variant
  //   KSPM-xx                → KSPM / KSmart Pro
  //   FN-… / JL-…            → Jieli reference firmware name prefixes
  //   "…ring…"               → anything that calls itself a ring
  // A device whose name matches is advertised as what the user intends to
  // pair with; adding it to the ring list is accurate, not a guess.
  if (name) {
    if (
      /^sr\d/i.test(name) ||
      /^r\d{2,}/i.test(name) ||
      /^fn[-_ ]/i.test(name) ||
      /^jl[-_ ]/i.test(name) ||
      lname.includes('livsmt') ||
      lname.includes('kspm') ||
      lname.includes('colmi') ||
      lname.includes('smart ring') ||
      lname.includes('smartring') ||
      lname.includes('saadhana') ||
      lname.includes('sadhana') ||
      /\bring\b/i.test(name)
    ) {
      return { hint: 'name-generic-ring', manufacturerId: null, rwType: null };
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

  /*
   * Why this is not a simple "fire once per device" loop.
   *
   * A BLE advertiser sends two packets on each hop: the initial ADV_IND,
   * and — once the central asks — a SCAN_RSP. Many smart rings put only
   * their id in ADV_IND and keep the human-readable name in SCAN_RSP, so
   * the FIRST callback we get for a device has `name = null`. With the old
   * `allowDuplicates: false` setting react-native-ble-plx drops every
   * further callback for that device, so the name packet never reaches us
   * and the device stays unnamed forever. It also skipped past our
   * `permissive && !name` guard and was never reported at all, which is
   * why users saw "no rings found" while other apps listed theirs.
   *
   * So: allowDuplicates: TRUE, a per-id merge of whichever packet carried
   * the name, and onCandidate fires both when a device is first seen AND
   * when a name/better RSSI arrives for one we already reported — the UI
   * keys devices by id and simply replaces.
   *
   * ScanMode.LowLatency: the default LowPower mode has a long listen
   * window and drops short advertisers. Pairing is bursty and user-facing;
   * we accept the battery cost for the ten seconds the scan is live.
   */
  const seen = new Map<string, ScannedRing>();

  const handle = (err: BleError | null, device: Device | null) => {
    if (err) {
      onError(err.message || 'scan failed');
      return;
    }
    if (!device) return;

    const cls = classifyAd(
      device.name, device.serviceUUIDs, device.manufacturerData, device.rawScanRecord
    );
    if (!cls && !permissive) return;

    const prior = seen.get(device.id);
    // Merge: keep the best name we have (a later SCAN_RSP may fill it in),
    // keep the strongest RSSI we have seen, promote the hint if the newer
    // packet classifies when the earlier one did not.
    const merged: ScannedRing = {
      id: device.id,
      name: device.name ?? prior?.name ?? null,
      rssi: prior?.rssi != null && device.rssi != null
        ? Math.max(prior.rssi, device.rssi)
        : (device.rssi ?? prior?.rssi ?? null),
      manufacturerId: cls?.manufacturerId ?? prior?.manufacturerId ?? null,
      hint: cls?.hint ?? prior?.hint ?? 'other',
      rwType: cls?.rwType ?? prior?.rwType ?? null,
    };

    // Only publish once we have something to display: a name OR a
    // classifier hint. A device with neither is just a MAC floating in
    // the air — worth remembering in `seen` so a later packet upgrades it,
    // not worth showing until then.
    const displayable = !!merged.name || merged.hint !== 'other';
    const changed =
      !prior ||
      prior.name !== merged.name ||
      prior.hint !== merged.hint ||
      prior.rssi !== merged.rssi;

    seen.set(device.id, merged);
    if (displayable && changed) onCandidate(merged);
  };

  m.startDeviceScan(
    null,
    {
      allowDuplicates: true,
      scanMode: ScanMode.LowLatency,
      callbackType: ScanCallbackType.AllMatches,
    },
    handle,
  );

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
