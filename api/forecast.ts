import { scrapeMetOfficeForecast } from '../src/lib/metofficeScrape';

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const geohash = (searchParams.get('geohash') ?? '').trim().toLowerCase();

  if (!geohash) {
    return new Response(JSON.stringify({ error: 'geohash required' }), { status: 400 });
  }

  try {
    const forecasts = await scrapeMetOfficeForecast(geohash);
    return new Response(JSON.stringify({ forecasts }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=900, stale-while-revalidate=300',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 502 });
  }
}
