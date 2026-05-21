export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get('lat') ?? '');
  const lon = parseFloat(searchParams.get('lon') ?? '');

  if (isNaN(lat) || isNaN(lon)) {
    return new Response(JSON.stringify({ error: 'lat and lon required' }), { status: 400 });
  }

  const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&hourly=sea_level_height_msl,ocean_current_velocity,ocean_current_direction&forecast_days=5&timezone=UTC`;

  const res = await fetch(url);
  if (!res.ok) {
    return new Response(JSON.stringify({ error: 'Open-Meteo marine error' }), { status: res.status });
  }
  const data = await res.json() as {
    hourly?: {
      time?: string[];
      sea_level_height_msl?: (number | null)[];
      ocean_current_velocity?: (number | null)[];
      ocean_current_direction?: (number | null)[];
    };
  };

  const h = data.hourly ?? {};
  const times = h.time ?? [];
  const seaLevel = h.sea_level_height_msl ?? [];
  const currentVel = h.ocean_current_velocity ?? [];
  const currentDir = h.ocean_current_direction ?? [];

  const points = times.map((t, i) => ({
    time: t,
    seaLevelMsl: seaLevel[i] ?? null,
    currentVelocity: currentVel[i] ?? null,
    currentDirection: currentDir[i] ?? null,
  }));

  return new Response(JSON.stringify({ points }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 's-maxage=3600, stale-while-revalidate=600',
    },
  });
}
