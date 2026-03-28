export const config = { runtime: 'edge' };

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default async function handler(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get('lat') ?? '');
  const lon = parseFloat(searchParams.get('lon') ?? '');

  if (isNaN(lat) || isNaN(lon)) {
    return new Response(JSON.stringify({ error: 'lat and lon required' }), { status: 400 });
  }

  const apiKey = process.env.UKHO_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: 'API key not configured' }), { status: 500 });

  const headers = { 'Ocp-Apim-Subscription-Key': apiKey };

  const stationsRes = await fetch('https://admiraltyapi.azure-api.net/uktidalapi/api/V1/Stations', { headers });
  if (!stationsRes.ok) {
    return new Response(JSON.stringify({ error: 'UKHO stations error' }), { status: stationsRes.status });
  }
  const stationsData = await stationsRes.json() as { features: unknown[] };
  const stations = stationsData.features.map((f: unknown) => {
    const feat = f as Record<string, unknown>;
    const props = feat.properties as Record<string, unknown>;
    const coords = (feat.geometry as Record<string, unknown>).coordinates as number[];
    return { Id: props.Id as string, Name: props.Name as string, Latitude: coords[1], Longitude: coords[0] };
  });

  const nearest = stations.reduce((best, s) =>
    haversineKm(lat, lon, s.Latitude, s.Longitude) < haversineKm(lat, lon, best.Latitude, best.Longitude) ? s : best
  );

  const tidesRes = await fetch(
    `https://admiraltyapi.azure-api.net/uktidalapi/api/V1/Stations/${nearest.Id}/TidalEvents?duration=4`,
    { headers }
  );
  if (!tidesRes.ok) {
    return new Response(JSON.stringify({ error: 'UKHO tides error' }), { status: tidesRes.status });
  }

  const events = await tidesRes.json();
  return new Response(JSON.stringify({ stationName: nearest.Name, events }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 's-maxage=14400, stale-while-revalidate=600',
    },
  });
}
