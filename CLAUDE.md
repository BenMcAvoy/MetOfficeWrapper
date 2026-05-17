# OpenWolf

@.wolf/OPENWOLF.md

This project uses OpenWolf for context management. Read and follow .wolf/OPENWOLF.md every session. Check .wolf/cerebrum.md before generating code. Check .wolf/anatomy.md before reading files.


# MetOfficeWrapper

PWA dashboard for Poole Harbour: wind (forecast vs live), tides, 5-day forecast, race calendar.
Vite + React 19 + TS + Tailwind 4 + shadcn/ui + Recharts. Bun for installs, Vercel for hosting.

## Commands

- `bun run dev` — Vite dev server (no API routes; uses deployed prod APIs via proxy)
- `bun run dev:api` — `vercel dev` with API routes
- `bunx tsc --noEmit -p tsconfig.app.json` — typecheck
- `bun run build` — tsc + vite build
- `bun run lint`

## Layout

```
api/                Vercel edge functions, one per upstream
  forecast.ts         Met Office hourly forecast
  forecast-history.ts Past forecast snapshots (KV-backed)
  forecast-snapshot.ts Cron: writes hourly snapshots
  live-wind.ts        weatherfile.com (station GBR00015 Poole)
  tides.ts            UKHO
  sun.ts              sunrise-sunset.org
src/
  App.tsx             Root: fetching, state, tab routing
  lib/
    api.ts            All fetchers + types (HourlyForecast, LiveWind, LiveWindHistoryPoint, TideData, WindForecastPoint)
    cache.ts          localStorage TTL cache; bump STORAGE_VERSION to invalidate
    units.ts          msToKnots, beaufortScale, degreesToCardinal
    chartUtils.tsx    YAxisTick, tooltipStyle
    geohash.ts        Decode LOCATION_GEOHASH constant in App.tsx
  components/
    WindCard.tsx, WindChartCard.tsx, charts.tsx (WindChart + TideChartInner)
    TideChart.tsx, ForecastStrip.tsx, RaceCalendar.tsx
    WeatherOverview.tsx, InstallButton.tsx
    ui/               shadcn primitives — don't hand-edit
.wolf/                openwolf tooling, not source
```

## Conventions

- **Units**: all wind speeds stored as **m/s** internally (Met Office native). Convert to knots at display via `msToKnots`. weatherfile.com `wsa`/`wsh`/`wsc` are also m/s — do NOT add a second conversion.
- **Times**: forecast and live-wind timestamps from upstream are UTC; both parsers append `Z` if missing. Render with `date-fns` `format` (local tz).
- **Path alias**: `@/` → `src/`.
- **Imports**: use `import type` for type-only.
- **Caching**: every `fetch*` in `lib/api.ts` checks `getCached` first; TTLs live in `cache.ts`. If you change cached data shape, bump `STORAGE_VERSION` in `cache.ts`.
- **Refresh cadences (App.tsx)**: forecast/tides every 30 min, live wind 15 s, live wind history 60 s.
- **shadcn/ui**: configured via `components.json`. Add components with `bunx shadcn@latest add <name>`.

## Data flow gotchas

- `App.tsx` owns all fetched state and passes down. Components are presentational + small derived calcs only.
- `WindChart` (charts.tsx) takes two parallel forecast inputs — `historyForecasts` (past, from KV snapshots) and `forecasts` (current + future). They're merged into one continuous series; future overwrites history on time-key collisions.
- Live wind history is bucketed to 10-min buckets in the chart; forecast is linearly interpolated to the same 10-min grid.
- "Today" gating: live data only renders when `isSameDay(selectedDay, new Date())` — see `WindCard.tsx` and `RaceCalendar.tsx`.
- Forecast snapshot cron is configured in `vercel.json` and disabled in CI (see commit `0b55917`).

## Don'ts

- Don't introduce new wind unit conversions; the codebase assumes m/s everywhere except display.
- Don't bypass `getCached`/`setCached` — adds inconsistency vs the rest of the app.
- Don't add a second YAxis to `WindChart`; observed vs forecast comparison requires a shared scale.
- Don't hand-edit `src/components/ui/*` — regenerate via shadcn.

## External APIs

- Met Office DataHub: `METOFFICE_API_KEY`. Hourly forecast.
- UKHO Admiralty Tides: `UKHO_API_KEY`. Station lookup by lat/lon.
- weatherfile.com V03: public token `PUBLIC`, no key required.
- Vercel KV (forecast snapshots): `KV_REST_API_URL`, `KV_REST_API_TOKEN`; snapshot cron auth via `SNAPSHOT_SECRET`.
