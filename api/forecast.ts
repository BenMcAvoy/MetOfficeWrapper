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
        // Short edge cache (5 min) so the admin clear-cache endpoint actually
        // takes effect quickly; the per-instance scraper memo (20 min) and the
        // client localStorage TTL (30 min) handle dedupe. stale-if-error keeps
        // the app up for a day if Met Office goes down.
        'Cache-Control': 's-maxage=300, stale-while-revalidate=1800, stale-if-error=86400',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 502 });
  }
}
