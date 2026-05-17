import { clearMetOfficeScrapeCache } from '../../src/lib/metofficeScrape';

export const config = { runtime: 'edge' };

const SECRET = '4891';

// Secret endpoint to drop the in-process scrape cache. Lives at
//   GET /api/admin/clear-cache?secret=4891[&geohash=<g>]
// Vercel's edge cache for /api/forecast can still serve stale responses for
// up to s-maxage after this — it'll catch up on its own.
export default async function handler(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  if ((searchParams.get('secret') ?? '') !== SECRET) {
    return new Response(
      JSON.stringify({ error: 'unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
    );
  }

  const geohash = searchParams.get('geohash')?.trim().toLowerCase() || undefined;
  const { cleared } = clearMetOfficeScrapeCache(geohash);

  return new Response(
    JSON.stringify({ ok: true, cleared, scope: geohash ?? 'all' }),
    { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
  );
}
