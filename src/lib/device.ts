import { useSyncExternalStore } from 'react';
import { generateDeviceName } from './utils';

const DEVICE_NAME_KEY = 'dropfile_device_name';
const DEVICE_ID_KEY = 'dropfile_device_id';
const DIRECT_TRANSFERS_KEY = 'dropfile_direct_transfers';

const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === DEVICE_NAME_KEY || event.key === DIRECT_TRANSFERS_KEY) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

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
  notify();
}

/** Current device name; re-renders when it is changed anywhere (including other tabs). */
export function useDeviceName(): string {
  return useSyncExternalStore(subscribe, getOrCreateDeviceName);
}

/** Listen for device-name changes outside React rendering (e.g. to notify the server). */
export function onDeviceNameChange(listener: (name: string) => void): () => void {
  return subscribe(() => listener(getOrCreateDeviceName()));
}

/** Whether to try direct (WebRTC) transfers before the server relay. Enabled by default. */
export function getDirectTransfersEnabled(): boolean {
  return localStorage.getItem(DIRECT_TRANSFERS_KEY) !== 'off';
}

export function setDirectTransfersEnabled(enabled: boolean): void {
  localStorage.setItem(DIRECT_TRANSFERS_KEY, enabled ? 'on' : 'off');
  notify();
}

export function useDirectTransfersEnabled(): boolean {
  return useSyncExternalStore(subscribe, getDirectTransfersEnabled);
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
