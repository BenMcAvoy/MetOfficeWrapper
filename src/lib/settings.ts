import { useSyncExternalStore } from 'react';

export type Theme = 'auto' | 'light' | 'dark';
export type WindUnit = 'kn' | 'mph' | 'kmh' | 'ms';

export interface Location {
  geohash: string;
  name: string;
  liveWindId: string;
}

export const DEFAULT_LOCATION: Location = {
  geohash: 'gcn86rd2z',
  name: 'Poole Harbour',
  liveWindId: 'GBR00015',
};

export interface Settings {
  theme: Theme;
  windUnit: WindUnit;
  location: Location;
}

const DEFAULTS: Settings = {
  theme: 'auto',
  windUnit: 'kn',
  location: DEFAULT_LOCATION,
};

const STORAGE_KEY = 'wx_settings_v1';

function read(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      theme: parsed.theme ?? DEFAULTS.theme,
      windUnit: parsed.windUnit ?? DEFAULTS.windUnit,
      location: { ...DEFAULTS.location, ...(parsed.location ?? {}) },
    };
  } catch {
    return DEFAULTS;
  }
}

let current: Settings = read();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function getSettings(): Settings {
  return current;
}

export function setSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // ignore
  }
  emit();
}

export function resetSettings(): void {
  current = DEFAULTS;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  emit();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings, getSettings);
}
