import { fetchElevations, parseCoordinateLists } from './elevation';

export const config = { runtime: 'edge' };

interface MarineLocationResponse {
  elevation?: number;
  hourly?: {
    time?: string[];
    sea_level_height_msl?: (number | null)[];
    ocean_current_velocity?: (number | null)[];
    ocean_current_direction?: (number | null)[];
  };
}

function buildPoints(loc: MarineLocationResponse) {
  const h = loc.hourly ?? {};
  const times = h.time ?? [];
  const seaLevel = h.sea_level_height_msl ?? [];
  const currentVel = h.ocean_current_velocity ?? [];
  const currentDir = h.ocean_current_direction ?? [];
  return times.map((t, i) => ({
    time: t,
    seaLevelMsl: seaLevel[i] ?? null,
    currentVelocity: currentVel[i] ?? null,
    currentDirection: currentDir[i] ?? null,
  }));
}

export default async function handler(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const latParam = searchParams.get('lat') ?? '';
  const lonParam = searchParams.get('lon') ?? '';
  const { lats, lons } = parseCoordinateLists(latParam, lonParam);

  if (!lats.length || lats.length !== lons.length) {
    return new Response(JSON.stringify({ error: 'lat and lon required, equal length' }), { status: 400 });
  }

  const latStr = lats.map(n => n.toFixed(4)).join(',');
  const lonStr = lons.map(n => n.toFixed(4)).join(',');
  const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${latStr}&longitude=${lonStr}&hourly=sea_level_height_msl,ocean_current_velocity,ocean_current_direction&forecast_days=5&timezone=UTC`;
  const [marineRes, topoElevations] = await Promise.all([fetch(marineUrl), fetchElevations(lats, lons)]);
  if (!marineRes.ok) {
    return new Response(JSON.stringify({ error: 'Open-Meteo marine error' }), { status: marineRes.status });
  }
  const raw = await marineRes.json() as MarineLocationResponse | MarineLocationResponse[];

  const pickElevation = (i: number, marineElev: number | undefined): number | null =>
    topoElevations[i] != null ? topoElevations[i] : (marineElev ?? null);

  if (lats.length === 1) {
    const single = Array.isArray(raw) ? raw[0] : raw;
    return new Response(JSON.stringify({
      elevation: pickElevation(0, single.elevation),
      points: buildPoints(single),
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=3600, stale-while-revalidate=600',
      },
    });
  }

  const locations = Array.isArray(raw) ? raw : [raw];
  const locationsOut = locations.map((loc, i) => ({
    lat: lats[i],
    lon: lons[i],
    elevation: pickElevation(i, loc.elevation),
    points: buildPoints(loc),
  }));

  return new Response(JSON.stringify({ locations: locationsOut }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 's-maxage=3600, stale-while-revalidate=600',
    },
  });
}
