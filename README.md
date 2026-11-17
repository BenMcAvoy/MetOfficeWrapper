# MetOfficeWrapper

An independent, sailing-focused weather dashboard. I built it to bring wind, tides, forecasts and race-day conditions together around a location.

[Open the live app](https://met-office-pooleyc.vercel.app)

## What it does

- Shows current conditions and an hourly forecast, with up to seven days ahead.
- Compares Met Office forecasts with Google WeatherNext forecasts when enabled.
- Puts forecast wind beside live observations and recent history.
- Charts tide heights and high/low times, with marine conditions on a map.
- Connects local sailing events to the weather around each race.
- Remembers location, units and display preferences, and can be installed as a PWA.

The default location is Poole Harbour. The app is designed to work at other locations too.

## How it is put together

The frontend is React and TypeScript, built with Vite. Charts and the tide map are rendered in the browser; API handlers keep data-provider requests and credentials on the server. The development server includes local API middleware, while the deployed app uses Vercel functions.

Forecasts come from the Met Office, with WeatherNext available as an alternate or comparison source. Tide predictions use the UKHO Admiralty API. Marine data comes from Open-Meteo.

## Run locally

You will need Node.js and npm.

```sh
npm install
npm run dev
```

Copy `.env.example` to `.env` before using API-backed features. `UKHO_API_KEY` enables tide predictions. `METOFFICE_API_KEY` is used by the optional Met Office wind-history snapshot job; the normal forecast route reads the public Met Office forecast page. Keep real keys server-side and out of commits.

## Useful commands

```sh
npm run build
npm run lint
npm run test
```

This is a personal project and is not affiliated with the Met Office, UKHO or Open-Meteo.
