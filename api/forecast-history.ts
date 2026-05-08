export const config = { runtime: 'edge' };

const LOCATIONS: Record<string, { lat: number; lon: number }> = {
  poole: { lat: 50.695, lon: -1.987 },
};

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
  if (!res.ok) throw new Error(`Redis error: ${res.status}`);
  const body = await res.json() as { result?: unknown; error?: string };
  if (body.error) throw new Error(`Redis error: ${body.error}`);
  return body.result;
}

function resolveLocationKey(lat: string | null, lon: string | null): string | null {
  if (!lat || !lon) return null;
  const latN = Number.parseFloat(lat);
  const lonN = Number.parseFloat(lon);
  if (!Number.isFinite(latN) || !Number.isFinite(lonN)) return null;
  let bestKey: string | null = null;
  let bestDist = Infinity;
  for (const [key, loc] of Object.entries(LOCATIONS)) {
    const d = Math.hypot(loc.lat - latN, loc.lon - lonN);
    if (d < bestDist) {
      bestDist = d;
      bestKey = key;
    }
  }
  return bestDist <= 0.5 ? bestKey : null;
}

export default async function handler(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const historyHoursRaw = searchParams.get('historyHours') ?? '6';
  const historyHours = Number.parseFloat(historyHoursRaw);
  if (!Number.isFinite(historyHours) || historyHours <= 0 || historyHours > 48) {
    return new Response(JSON.stringify({ error: 'historyHours must be 1-48' }), { status: 400 });
  }

  const locationKey = resolveLocationKey(searchParams.get('lat'), searchParams.get('lon'));
  if (!locationKey) {
    return new Response(JSON.stringify({ error: 'unknown location' }), { status: 400 });
  }

  try {
    const raw = (await redis(['LRANGE', `forecast_history:${locationKey}`, 0, -1])) as string[] | null;
    const entries = (raw ?? [])
      .map(item => {
        try {
          const parsed = JSON.parse(item) as { t: string; s: number; g: number };
          return {
            time: parsed.t,
            windSpeed10m: parsed.s,
            windGustSpeed10m: parsed.g,
          };
        } catch {
          return null;
        }
      })
      .filter((x): x is { time: string; windSpeed10m: number; windGustSpeed10m: number } => x !== null);

    const cutoff = Date.now() - historyHours * 60 * 60 * 1000;
    const filtered = entries
      .filter(e => new Date(e.time).getTime() >= cutoff)
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    return new Response(JSON.stringify({ status: 'ok', data: filtered }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=60, stale-while-revalidate=30',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
  }
}
