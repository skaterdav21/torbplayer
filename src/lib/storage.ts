import AsyncStorage from '@react-native-async-storage/async-storage';

export const KEYS = {
  addons: 'beam.addons.v1',
  recents: 'beam.recents.v1',
  lastDevice: 'beam.lastDevice.v1',
  partyDevices: 'beam.partyDevices.v1',
} as const;

export async function loadJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export async function saveJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable: the app still works, it just won't remember.
  }
}
