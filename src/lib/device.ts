import { generateDeviceName } from './utils';

const DEVICE_NAME_KEY = 'dropfile_device_name';
const DEVICE_ID_KEY = 'dropfile_device_id';

/** Persistent, user-editable device name shared by rooms and nearby sharing. */
export function getOrCreateDeviceName(): string {
  let deviceName = localStorage.getItem(DEVICE_NAME_KEY);
  if (!deviceName) {
    deviceName = generateDeviceName();
    localStorage.setItem(DEVICE_NAME_KEY, deviceName);
  }
  return deviceName;
}

export function saveDeviceName(name: string): void {
  localStorage.setItem(DEVICE_NAME_KEY, name);
}

/** Persistent device ID shared by rooms and nearby sharing. */
export function getOrCreateDeviceId(): string {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = `device_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}
