export const config = { runtime: 'edge' };

const LOCATIONS: { key: string; lat: number; lon: number }[] = [
  { key: 'poole', lat: 50.695, lon: -1.987 },
];

const MAX_ENTRIES = 300;

interface Snapshot {
  t: string;
  s: number;
  g: number;
}

async function redis(command: (string | number)[]): Promise<unknown> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('KV not configured');

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`Redis error: ${res.status} ${await res.text()}`);
  const body = await res.json() as { result?: unknown; error?: string };
  if (body.error) throw new Error(`Redis error: ${body.error}`);
  return body.result;
}

function pickCurrentSample(timeSeries: { time: string; windSpeed10m?: number; windGustSpeed10m?: number }[]): Snapshot | null {
  if (!timeSeries.length) return null;
  const now = Date.now();
  let best: typeof timeSeries[number] | null = null;
  let bestDelta = Infinity;
  for (const entry of timeSeries) {
    const t = new Date(entry.time).getTime();
    if (!Number.isFinite(t)) continue;
    const delta = Math.abs(t - now);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = entry;
    }
  }
  if (!best) return null;
  const s = best.windSpeed10m;
  const g = best.windGustSpeed10m;
  if (typeof s !== 'number' || typeof g !== 'number') return null;
  return { t: new Date().toISOString(), s, g };
}

export default async function handler(req: Request): Promise<Response> {
  const secret = process.env.SNAPSHOT_SECRET;
  if (!secret) {
    return new Response(JSON.stringify({ error: 'SNAPSHOT_SECRET not configured' }), { status: 500 });
  }

  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${secret}`) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  const apiKey = process.env.METOFFICE_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'METOFFICE_API_KEY not configured' }), { status: 500 });
  }

  const results: Record<string, string> = {};

  for (const loc of LOCATIONS) {
    try {
      const upstream = await fetch(
        `https://data.hub.api.metoffice.gov.uk/sitespecific/v0/point/hourly?latitude=${loc.lat}&longitude=${loc.lon}`,
        { headers: { apikey: apiKey } }
      );
      if (!upstream.ok) {
        results[loc.key] = `upstream ${upstream.status}`;
        continue;
      }
      const data = await upstream.json() as { features?: { properties?: { timeSeries?: unknown[] } }[] };
      const timeSeries = (data.features?.[0]?.properties?.timeSeries ?? []) as { time: string; windSpeed10m?: number; windGustSpeed10m?: number }[];
      const snap = pickCurrentSample(timeSeries);
      if (!snap) {
        results[loc.key] = 'no sample';
        continue;
      }

      const key = `forecast_history:${loc.key}`;
      await redis(['LPUSH', key, JSON.stringify(snap)]);
      await redis(['LTRIM', key, 0, MAX_ENTRIES - 1]);
      results[loc.key] = 'ok';
    } catch (e) {
      results[loc.key] = `error: ${(e as Error).message}`;
    }
  }

  return new Response(JSON.stringify({ status: 'ok', results }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
