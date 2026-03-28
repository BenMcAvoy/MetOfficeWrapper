interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export function getCached<T>(key: string): T | null {
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
  try {
    localStorage.setItem(`wx_${key}`, JSON.stringify({ data, expiresAt: Date.now() + ttlMs }));
  } catch {
    // storage full
  }
}

export const TTL = {
  FORECAST: 60 * 60 * 1000,
  TIDES:    4  * 60 * 60 * 1000,
  SUN:      24 * 60 * 60 * 1000,
  STATIONS: 24 * 60 * 60 * 1000,
};
