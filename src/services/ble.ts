import {
  BleManager, Device, Subscription, Characteristic,
  ScanMode, ScanCallbackType,
} from 'react-native-ble-plx';
import { Platform, PermissionsAndroid } from 'react-native';
import { Storage } from '../storage';

let bleManager: BleManager | null = null;

export const getBleManager = (): BleManager => {
  if (!bleManager) bleManager = new BleManager();
  return bleManager;
};

export const requestBlePermissions = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') return true;
  const sdk = Platform.Version as number;
  try {
    if (sdk >= 31) {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
      return Object.values(granted).every(v => v === PermissionsAndroid.RESULTS.GRANTED);
    } else {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }
  } catch {
    return false;
  }
};

export interface ScannedDevice {
  id: string;
  name: string;
  rssi: number | null;
}

export const scanForDevices = (
  onDevice: (device: ScannedDevice) => void,
  onError: (err: string) => void,
  timeoutMs = 12000
): (() => void) => {
  const manager = getBleManager();
  /*
   * See soulsync/ring/transport.ts for the long version. Short:
   *   - allowDuplicates: true, because many rings publish their NAME in
   *     the SCAN_RSP packet, not the initial ADV_IND. With duplicates
   *     off, we see the nameless advert, drop it, and never hear from
   *     the device again — which is why users saw an empty scan while
   *     RWfit listed their ring just fine.
   *   - scanMode: LowLatency, so Android doesn't collapse bursty
   *     advertisers to save battery during a 12-second pair window.
   *   - A per-id merge keeps the best name we have seen so far and the
   *     strongest RSSI, and fires onDevice the first time a device
   *     becomes displayable (acquires a name) and when its info
   *     improves.
   */
  const seen = new Map<string, ScannedDevice>();
  manager.startDeviceScan(
    null,
    {
      allowDuplicates: true,
      scanMode: ScanMode.LowLatency,
      callbackType: ScanCallbackType.AllMatches,
    },
    (error, device) => {
      if (error) {
        onError(error.message || 'Scan failed');
        return;
      }
      if (!device) return;
      const prior = seen.get(device.id);
      const name = device.name ?? prior?.name ?? null;
      if (!name) {
        // Nothing to show yet; remember the id so a later SCAN_RSP can
        // upgrade it.
        if (!prior) seen.set(device.id, { id: device.id, name: '', rssi: device.rssi });
        return;
      }
      const rssi = prior?.rssi != null && device.rssi != null
        ? Math.max(prior.rssi, device.rssi)
        : (device.rssi ?? prior?.rssi ?? null);
      const merged: ScannedDevice = { id: device.id, name, rssi };
      const changed =
        !prior || !prior.name || prior.name !== merged.name || prior.rssi !== merged.rssi;
      seen.set(device.id, merged);
      if (changed) onDevice(merged);
    },
  );
  const t = setTimeout(() => manager.stopDeviceScan(), timeoutMs);
  return () => {
    clearTimeout(t);
    manager.stopDeviceScan();
  };
};

export interface CounterConnection {
  device: Device;
  disconnect: () => Promise<void>;
}

/**
 * Connect to a device and subscribe to ALL notifiable characteristics.
 * On each notification, onTap() is called. This is a generic approach that
 * works for most simple "button press → BLE notification" microcontrollers
 * without knowing the exact service/characteristic UUID.
 */
export const connectAndListen = async (
  deviceId: string,
  onTap: (value: string) => void,
  onDisconnect: () => void
): Promise<CounterConnection> => {
  const manager = getBleManager();
  manager.stopDeviceScan();

  const device = await manager.connectToDevice(deviceId, {
    requestMTU: 256,
  });
  await device.discoverAllServicesAndCharacteristics();
  const services = await device.services();

  const subs: Subscription[] = [];

  // Subscribe to every notifiable / indicatable characteristic
  for (const svc of services) {
    const chars = await svc.characteristics();
    for (const ch of chars) {
      if (ch.isNotifiable || ch.isIndicatable) {
        try {
          const sub = ch.monitor((err, c) => {
            if (err || !c) return;
            const val = c.value || '';
            onTap(val);
          });
          subs.push(sub);
        } catch {
          // skip characteristics we can't subscribe to
        }
      }
    }
  }

  const disconnectListener = manager.onDeviceDisconnected(deviceId, () => {
    subs.forEach(s => s.remove());
    onDisconnect();
  });

  // Persist last connected device id
  Storage.set('lastBleDevice', { id: deviceId, name: device.name || 'Counter' });

  return {
    device,
    disconnect: async () => {
      subs.forEach(s => s.remove());
      disconnectListener.remove();
      await manager.cancelDeviceConnection(deviceId).catch(() => {});
    },
  };
};
