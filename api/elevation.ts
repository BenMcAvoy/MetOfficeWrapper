export const config = { runtime: 'edge' };

const ELEV_BATCH = 100;

export async function fetchElevations(lats: number[], lons: number[]): Promise<(number | null)[]> {
  const elevations: (number | null)[] = new Array(lats.length).fill(null);

  const requests: Promise<Response>[] = [];
  for (let i = 0; i < lats.length; i += ELEV_BATCH) {
    const bLats = lats.slice(i, i + ELEV_BATCH).map(n => n.toFixed(4)).join(',');
    const bLons = lons.slice(i, i + ELEV_BATCH).map(n => n.toFixed(4)).join(',');
    requests.push(fetch(`https://api.open-meteo.com/v1/elevation?latitude=${bLats}&longitude=${bLons}`));
  }

  const responses = await Promise.all(requests);
  for (let bi = 0; bi < responses.length; bi++) {
    const response = responses[bi];
    if (!response.ok) continue;
    const data = await response.json() as { elevation?: (number | null)[] };
    const arr = data.elevation ?? [];
    const offset = bi * ELEV_BATCH;
    for (let j = 0; j < arr.length; j++) {
      elevations[offset + j] = arr[j];
    }
  }

  return elevations;
}

export function parseCoordinateLists(latParam: string, lonParam: string): { lats: number[]; lons: number[] } {
  const lats = latParam.split(',').map(s => parseFloat(s.trim())).filter(n => !Number.isNaN(n));
  const lons = lonParam.split(',').map(s => parseFloat(s.trim())).filter(n => !Number.isNaN(n));
  return { lats, lons };
}

export default async function handler(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const { lats, lons } = parseCoordinateLists(
    searchParams.get('lat') ?? '',
    searchParams.get('lon') ?? '',
  );

  if (!lats.length || lats.length !== lons.length) {
    return new Response(JSON.stringify({ error: 'lat and lon required, equal length' }), { status: 400 });
  }

  const elevations = await fetchElevations(lats, lons);
  return new Response(JSON.stringify({
    locations: lats.map((lat, i) => ({
      lat,
      lon: lons[i],
      elevation: elevations[i],
    })),
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 's-maxage=3600, stale-while-revalidate=600',
    },
  });
}
