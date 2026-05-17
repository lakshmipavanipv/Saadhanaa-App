import { BleManager, Device, Subscription, Characteristic } from 'react-native-ble-plx';
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
  const seen = new Set<string>();
  manager.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
    if (error) {
      onError(error.message || 'Scan failed');
      return;
    }
    if (!device || !device.name || seen.has(device.id)) return;
    seen.add(device.id);
    onDevice({ id: device.id, name: device.name, rssi: device.rssi });
  });
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
