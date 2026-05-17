interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const STORAGE_VERSION_KEY = 'wx_storage_version';
const STORAGE_VERSION = '1';

let hasCheckedStorageVersion = false;

function ensureStorageVersion(): void {
  if (hasCheckedStorageVersion) return;
  hasCheckedStorageVersion = true;

  try {
    const savedVersion = localStorage.getItem(STORAGE_VERSION_KEY);
    if (savedVersion !== STORAGE_VERSION) {
      localStorage.clear();
      localStorage.setItem(STORAGE_VERSION_KEY, STORAGE_VERSION);
    }
  } catch {
    // storage unavailable
  }
}

export function getCached<T>(key: string): T | null {
  ensureStorageVersion();
  try {
    const raw = localStorage.getItem(`wx_${key}`);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() > entry.expiresAt) {
      localStorage.removeItem(`wx_${key}`);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

export function setCached<T>(key: string, data: T, ttlMs: number): void {
  ensureStorageVersion();
  try {
    localStorage.setItem(`wx_${key}`, JSON.stringify({ data, expiresAt: Date.now() + ttlMs }));
  } catch {
    // storage full
  }
}

export function clearCache(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('wx_') && k !== STORAGE_VERSION_KEY) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
  } catch {
    // storage unavailable
  }
}

export const TTL = {
  FORECAST: 30 * 60 * 1000,
  TIDES:    4  * 60 * 60 * 1000,
  SUN:      24 * 60 * 60 * 1000,
  LIVE_WIND: 15 * 1000,
  LIVE_WIND_HISTORY: 60 * 1000,
  STATIONS: 24 * 60 * 60 * 1000,
};
