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
        // Edge cache for 30 min (Vercel dedupes per region within this window),
        // serve-stale-while-revalidate for an hour, and serve-stale-if-error
        // for a day so a Met Office hiccup doesn't take the app down.
        'Cache-Control': 's-maxage=1800, stale-while-revalidate=3600, stale-if-error=86400',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 502 });
  }
}
