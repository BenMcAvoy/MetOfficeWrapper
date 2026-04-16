import path from "path"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import type { ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'http'

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function handleApiRequest(req: IncomingMessage, res: ServerResponse, env: Record<string, string>): Promise<boolean> {
  const url = new URL(req.url!, 'http://localhost');
  if (!url.pathname.startsWith('/api/')) return false;

  const lat = url.searchParams.get('lat');
  const lon = url.searchParams.get('lon');

  res.setHeader('Content-Type', 'application/json');

  try {
    if (url.pathname === '/api/live-wind') {
      const locId = url.searchParams.get('locId');
      if (!locId) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'locId required' }));
        return true;
      }

      const historyHours = url.searchParams.get('historyHours');

      if (historyHours) {
        const lastHours = Number.parseInt(historyHours, 10);
        if (!Number.isFinite(lastHours) || lastHours <= 0 || lastHours > 72) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'historyHours must be 1-72' }));
          return true;
        }

        const r = await fetch(
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

        res.statusCode = r.status;
        res.end(await r.text());
        return true;
      }

      const r = await fetch(
        `https://weatherfile.com/V03/loc/${encodeURIComponent(locId)}/latest.json`,
        {
          method: 'POST',
          headers: { 'wf-tkn': 'PUBLIC' },
        }
      );

      res.statusCode = r.status;
      res.end(await r.text());
      return true;
    }

    if (url.pathname === '/api/forecast') {
      const key = env.METOFFICE_API_KEY;
      if (!key) { res.statusCode = 503; res.end(JSON.stringify({ error: 'METOFFICE_API_KEY not set' })); return true; }
      const r = await fetch(
        `https://data.hub.api.metoffice.gov.uk/sitespecific/v0/point/hourly?latitude=${lat}&longitude=${lon}`,
        { headers: { apikey: key } }
      );
      res.statusCode = r.status;
      res.end(await r.text());
      return true;
    }

    if (url.pathname === '/api/sun') {
      const r = await fetch(`https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lon}&formatted=0`);
      res.statusCode = r.status;
      res.end(await r.text());
      return true;
    }

    if (url.pathname === '/api/tides') {
      const key = env.UKHO_API_KEY;
      if (!key) { res.statusCode = 503; res.end(JSON.stringify({ error: 'UKHO_API_KEY not set' })); return true; }
      const headers = { 'Ocp-Apim-Subscription-Key': key };

      const stationsRes = await fetch('https://admiraltyapi.azure-api.net/uktidalapi/api/V1/Stations', { headers });
      const stationsData = await stationsRes.json() as { features: unknown[] };
      const stations = stationsData.features.map((f: unknown) => {
        const feat = f as Record<string, unknown>;
        const props = feat.properties as Record<string, unknown>;
        const coords = (feat.geometry as Record<string, unknown>).coordinates as number[];
        return { Id: props.Id as string, Name: props.Name as string, Latitude: coords[1], Longitude: coords[0] };
      });
      const latN = parseFloat(lat!), lonN = parseFloat(lon!);
      const nearest = stations.reduce((best, s) =>
        haversineKm(latN, lonN, s.Latitude, s.Longitude) < haversineKm(latN, lonN, best.Latitude, best.Longitude) ? s : best
      );

      const startDatetime = new Date();
      startDatetime.setMinutes(0, 0, 0);
      const endDatetime = new Date(startDatetime.getTime() + 5 * 24 * 60 * 60 * 1000);
      const startStr = startDatetime.toISOString().replace(/\.\d{3}Z$/, 'Z');
      const endStr = endDatetime.toISOString().replace(/\.\d{3}Z$/, 'Z');

      const tidesRes = await fetch(
        `https://admiraltyapi.azure-api.net/uktidalapi/api/V1/Stations/${nearest.Id}/TidalEvents?duration=5`,
        { headers }
      );
      const events = await tidesRes.json();
      let heights: unknown[] = [];
      try {
        const heightsRes = await fetch(
          `https://admiraltyapi.azure-api.net/uktidalapi/api/V1/Stations/${nearest.Id}/TidalHeights?startDatetime=${encodeURIComponent(startStr)}&endDatetime=${encodeURIComponent(endStr)}&intervalInMinutes=30`,
          { headers }
        );
        if (heightsRes.ok) heights = await heightsRes.json() as unknown[];
      } catch { /* not available on this API tier */ }
      res.statusCode = tidesRes.status;
      res.end(JSON.stringify({ stationName: nearest.Name, events, heights }));
      return true;
    }
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: String(e) }));
    return true;
  }

  return false;
}

function makeApiPlugin(env: Record<string, string>) {
  return {
    name: 'api-dev',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        if (!req.url?.startsWith('/api/')) return next();
        handleApiRequest(req, res, env).then(handled => { if (!handled) next(); });
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
  plugins: [
    makeApiPlugin(env),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: "Weather App",
        short_name: "Weather App",
        description: 'Sailing-focused weather — tides, wind, rain',
        theme_color: '#2563eb',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,svg,png}'],
        runtimeCaching: [],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  }
})
