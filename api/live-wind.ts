export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const locId = searchParams.get('locId');
  const historyHours = searchParams.get('historyHours');

  if (!locId) {
    return new Response(JSON.stringify({ error: 'locId required' }), { status: 400 });
  }

  if (historyHours) {
    const lastHours = Number.parseInt(historyHours, 10);
    if (!Number.isFinite(lastHours) || lastHours <= 0 || lastHours > 72) {
      return new Response(JSON.stringify({ error: 'historyHours must be 1-72' }), { status: 400 });
    }

    const upstream = await fetch(
      `https://weatherfile.com/V03/loc/${encodeURIComponent(locId)}/averages.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'wf-tkn': 'PUBLIC',
        },
        body: `last_hrs=${encodeURIComponent(String(lastHours))}`,
      }
    );

    if (!upstream.ok) {
      return new Response(JSON.stringify({ error: upstream.statusText }), { status: upstream.status });
    }

    return new Response(await upstream.text(), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=30, stale-while-revalidate=10',
      },
    });
  }

  const upstream = await fetch(
    `https://weatherfile.com/V03/loc/${encodeURIComponent(locId)}/latest.json`,
    {
      method: 'POST',
      headers: {
        'wf-tkn': 'PUBLIC',
      },
    }
  );

  if (!upstream.ok) {
    return new Response(JSON.stringify({ error: upstream.statusText }), { status: upstream.status });
  }

  return new Response(await upstream.text(), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 's-maxage=10, stale-while-revalidate=5',
    },
  });
}
