# anatomy.md

> Auto-maintained by OpenWolf. Last scanned: 2026-05-17T18:46:10.629Z
> Files: 12 tracked | Anatomy hits: 0 | Misses: 0

## ./

- `vite.config.ts` — API routes: GET (5 endpoints) (~2182 tok)

## api/

- `forecast.ts` — API routes: GET (1 endpoints) (~232 tok)

## src/

- `App.tsx` — useThemeMode (~4094 tok)

## src/components/

- `ForecastStrip.tsx` — ForecastStrip (~1801 tok)
- `RaceCalendar.tsx` — parseEventTime (~6622 tok)
- `SettingsPage.tsx` — THEMES (~3128 tok)
- `WindCard.tsx` — WindCard (~3330 tok)

## src/lib/

- `api.ts` — Exports HourlyForecast, WindForecastPoint, TideExtreme, TideHeight + 10 more (~3064 tok)
- `cache.ts` — Exports getCached, setCached, clearCache, TTL (~519 tok)
- `metofficeScrape.ts` — Met Office public-site scraper. (~2704 tok)
- `settings.ts` — Exports Theme, WindUnit, Location, DEFAULT_LOCATION + 5 more (~507 tok)
- `units.ts` — Exports MS_TO_KNOTS, MS_TO_MPH, MS_TO_KMH, msToKnots + 7 more (~792 tok)
