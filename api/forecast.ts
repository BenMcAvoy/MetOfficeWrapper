export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get('lat');
  const lon = searchParams.get('lon');

  if (!lat || !lon) {
    return new Response(JSON.stringify({ error: 'lat and lon required' }), { status: 400 });
  }

  const apiKey = process.env.METOFFICE_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: 'API key not configured' }), { status: 500 });

  const upstream = await fetch(
    `https://data.hub.api.metoffice.gov.uk/sitespecific/v0/point/hourly?latitude=${lat}&longitude=${lon}`,
    { headers: { apikey: apiKey } }
  );

  if (!upstream.ok) {
    return new Response(JSON.stringify({ error: upstream.statusText }), { status: upstream.status });
  }

  return new Response(await upstream.text(), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 's-maxage=3600, stale-while-revalidate=300',
    },
  });
}
