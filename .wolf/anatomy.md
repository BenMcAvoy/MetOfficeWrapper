# anatomy.md

> Auto-maintained by OpenWolf. Last scanned: 2026-05-21T09:35:46.359Z
> Files: 12 tracked | Anatomy hits: 0 | Misses: 0

## ./

- `_cat_audit.ts` — Declares seen (~128 tok)
- `vite.config.ts` — API routes: GET (9 endpoints) (~3418 tok)

## api/

- `marine.ts` — API routes: GET (2 endpoints) (~1218 tok)

## api/admin/


## src/

- `App.tsx` — TideMap (~5218 tok)
- `main.tsx` — setupPwaUpdates (~954 tok)

## src/components/

- `charts.tsx` — COLORS (~5726 tok)
- `RaceCalendar.tsx` — CATEGORY_STYLES (~8453 tok)
- `TideChart.tsx` — KMH_TO_KNOTS (~3878 tok)
- `TideMap.tsx` — Watches the app's `.dark` class so map elements (arrows, popover) can (~5312 tok)

## src/lib/

- `api.ts` — Exports HourlyForecast, WindForecastPoint, TideExtreme, TideHeight + 15 more (~3992 tok)
- `cache.ts` — Exports getCached, setCached, clearCache, TTL (~528 tok)
- `calendar.ts` — Exports RaceEvent, RACE_CALENDAR (~11438 tok)
