import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function freshModule() {
  vi.resetModules();
  return await import('./cache');
}

describe('cache (localStorage backed)', () => {
  let getCached: typeof import('./cache').getCached;
  let setCached: typeof import('./cache').setCached;

  beforeEach(async () => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-15T12:00:00Z'));
    ({ getCached, setCached } = await freshModule());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null for a missing key', () => {
    expect(getCached('nope')).toBeNull();
  });

  it('round-trips a value under its TTL', () => {
    setCached('foo', { n: 1 }, 60_000);
    expect(getCached<{ n: number }>('foo')).toEqual({ n: 1 });
  });

  it('expires past the TTL and removes the entry', () => {
    setCached('foo', { n: 1 }, 60_000);
    vi.setSystemTime(new Date('2026-05-15T12:02:00Z'));
    expect(getCached('foo')).toBeNull();
    expect(localStorage.getItem('wx_foo')).toBeNull();
  });

  it('namespaces keys with wx_ prefix', () => {
    setCached('forecast', [1, 2, 3], 60_000);
    expect(localStorage.getItem('wx_forecast')).not.toBeNull();
  });

  it('clears storage when STORAGE_VERSION mismatches', async () => {
    localStorage.setItem('wx_storage_version', 'old');
    localStorage.setItem('wx_stale', 'something');
    const mod = await freshModule();
    mod.setCached('fresh', { ok: true }, 60_000);
    expect(localStorage.getItem('wx_stale')).toBeNull();
    expect(mod.getCached<{ ok: boolean }>('fresh')).toEqual({ ok: true });
  });
});
