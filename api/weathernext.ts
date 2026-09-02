export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get('lat'));
  const lon = Number(searchParams.get('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return new Response(JSON.stringify({ error: 'valid latitude and longitude required' }), { status: 400 });
  }

  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    hourly: 'temperature_2m,pressure_msl,precipitation,wind_speed_10m,wind_direction_10m,weather_code',
    models: 'google_weathernext2_ensemble',
    forecast_days: '7',
    timezone: 'UTC',
    wind_speed_unit: 'kmh',
  });

  try {
    const upstream = await fetch(`https://ensemble-api.open-meteo.com/v1/ensemble?${params}`);
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
        'Cache-Control': 's-maxage=900, stale-while-revalidate=3600',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 502 });
  }
}
