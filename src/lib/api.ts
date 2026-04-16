import { getCached, setCached, TTL } from './cache';

export interface HourlyForecast {
  time: Date;
  screenTemperature: number;
  feelsLikeTemp: number;
  windSpeed10m: number;
  windGustSpeed10m: number;
  windDirectionFrom10m: number;
  precipitationRate: number;
  probOfPrecipitation: number;
  uvIndex: number;
  significantWeatherCode: number;
  visibility: number;
  mslp: number;
  humidity: number;
}

export interface TideExtreme {
  time: Date;
  height: number;
  type: 'High' | 'Low';
}

export interface TideHeight {
  time: Date;
  height: number;
}

export interface TideData {
  extremes: TideExtreme[];
  heights: TideHeight[];
  stationName: string;
}

export interface SunInfo {
  sunrise: Date;
  sunset: Date;
  dayLength: number;
}

export interface LiveWind {
  observedAt: Date;
  windSpeedMs: number;
  windDirectionDeg: number;
  locationId: string;
  locationName: string;
  delaySeconds: number | null;
}

export interface LiveWindHistoryPoint {
  time: Date;
  avgWindMs: number;
  gustWindMs: number;
  windDirectionDeg: number;
}

function interpolateTideCurve(extremes: TideExtreme[], stepMinutes = 10): TideHeight[] {
  if (extremes.length < 2) return [];
  const heights: TideHeight[] = [];
  for (let i = 0; i < extremes.length - 1; i++) {
    const t1 = extremes[i].time.getTime();
    const t2 = extremes[i + 1].time.getTime();
    const h1 = extremes[i].height;
    const h2 = extremes[i + 1].height;
    const steps = Math.round((t2 - t1) / (stepMinutes * 60000));
    for (let s = 0; s < steps; s++) {
      const ratio = s / steps;
      const height = h1 + (h2 - h1) * (1 - Math.cos(ratio * Math.PI)) / 2;
      heights.push({ time: new Date(t1 + s * stepMinutes * 60000), height });
    }
  }
  const last = extremes[extremes.length - 1];
  heights.push({ time: last.time, height: last.height });
  return heights;
}

function parseLiveWindTimestamp(ts: string): Date {
  const isoBase = ts.includes('T') ? ts : ts.replace(' ', 'T');
  const withZone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(isoBase) ? isoBase : `${isoBase}Z`;
  return new Date(withZone);
}

type SerialisedForecast = Omit<HourlyForecast, 'time'> & { time: string };

function parseForecastTimestamp(ts: string): Date {
  const withZone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(ts) ? ts : `${ts}Z`;
  return new Date(withZone);
}

export async function fetchMetOfficeHourly(lat: number, lon: number): Promise<HourlyForecast[]> {
  const cacheKey = `metoffice_v2_${lat.toFixed(3)}_${lon.toFixed(3)}`;
  const cached = getCached<SerialisedForecast[]>(cacheKey);
  if (cached) return cached.map(f => ({ ...f, time: parseForecastTimestamp(f.time) }));

  const res = await fetch(`/api/forecast?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`);
  if (!res.ok) throw new Error(`Met Office API error: ${res.status} ${res.statusText}`);
  const data = await res.json();

  const features = data.features ?? [];
  if (!features.length) throw new Error('No forecast data returned');

  const timeSeries: unknown[] = features[0]?.properties?.timeSeries ?? [];
  const forecasts: HourlyForecast[] = timeSeries.map((entry: unknown) => {
    const e = entry as Record<string, unknown>;
    const rawTime = String(e.time ?? '');
    return {
      time: parseForecastTimestamp(rawTime),
      screenTemperature:    (e.screenTemperature as number)     ?? 0,
      feelsLikeTemp:        (e.feelsLikeTemp as number)          ?? 0,
      windSpeed10m:         (e.windSpeed10m as number)           ?? 0,
      windGustSpeed10m:     (e.windGustSpeed10m as number)       ?? 0,
      windDirectionFrom10m: (e.windDirectionFrom10m as number)   ?? 0,
      precipitationRate:    (e.precipitationRate as number)      ?? 0,
      probOfPrecipitation:  (e.probOfPrecipitation as number)    ?? 0,
      uvIndex:              (e.uvIndex as number)                ?? 0,
      significantWeatherCode:(e.significantWeatherCode as number) ?? -1,
      visibility:           (e.visibility as number)             ?? 0,
      mslp:                 (e.mslp as number)                   ?? 1013,
      humidity:             (e.screenRelativeHumidity as number) ?? 0,
    };
  });

  setCached(cacheKey, forecasts, TTL.FORECAST);
  return forecasts;
}

type SerialisedExtreme = Omit<TideExtreme, 'time'> & { time: string };
type SerialisedHeight = Omit<TideHeight, 'time'> & { time: string };

export async function fetchTides(lat: number, lon: number): Promise<TideData> {
  const cacheKey = `ukho_tides_${lat.toFixed(3)}_${lon.toFixed(3)}`;
  const cached = getCached<{ extremes: SerialisedExtreme[]; heights: SerialisedHeight[]; stationName: string }>(cacheKey);
  if (cached) {
    const extremes = cached.extremes.map(e => ({ ...e, time: new Date(e.time) }));
    const heights = cached.heights.length
      ? cached.heights.map(h => ({ height: h.height, time: new Date(h.time) }))
      : interpolateTideCurve(extremes);
    return { extremes, heights, stationName: cached.stationName };
  }

  const res = await fetch(`/api/tides?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`);
  if (!res.ok) throw new Error(`Tides API error: ${res.status}`);
  const data = await res.json() as {
    stationName: string;
    events: Record<string, unknown>[];
    heights?: Record<string, unknown>[];
  };

  const extremes: TideExtreme[] = data.events.map(e => ({
    time: new Date(e.DateTime as string),
    height: e.Height as number,
    type: (e.EventType as string).includes('High') ? 'High' : 'Low',
  }));

  let heights: TideHeight[];
  if (data.heights && data.heights.length > 0) {
    heights = data.heights.map(h => ({
      time: new Date(h.DateTime as string),
      height: h.Height as number,
    }));
  } else {
    heights = interpolateTideCurve(extremes);
  }

  setCached(cacheKey, { extremes, heights, stationName: data.stationName }, TTL.TIDES);
  return { extremes, heights, stationName: data.stationName };
}

type SerialisedLiveWind = Omit<LiveWind, 'observedAt'> & { observedAt: string };

export async function fetchLiveWind(locId: string): Promise<LiveWind | null> {
  const cacheKey = `live_wind_${locId}`;
  const cached = getCached<SerialisedLiveWind>(cacheKey);
  if (cached) return { ...cached, observedAt: new Date(cached.observedAt) };

  const res = await fetch(`/api/live-wind?locId=${encodeURIComponent(locId)}`);
  if (!res.ok) throw new Error(`Live wind API error: ${res.status}`);

  const raw = await res.text();
  let payload: {
    status?: string;
    data?: Record<string, unknown> | null;
  };

  try {
    payload = JSON.parse(raw) as {
      status?: string;
      data?: Record<string, unknown> | null;
    };
  } catch {
    throw new Error('Live wind API returned non-JSON response');
  }

  if (payload.status !== 'ok' || !payload.data) return null;

  const data = payload.data;
  const speed = Number(data.wsc);
  const direction = Number(data.wdc);
  const delay = Number(data.delay);

  const timestampCandidate = typeof data.ts === 'string'
    ? data.ts
    : `${String(data.date ?? '')} ${String(data.time ?? '')}`.trim();

  if (!timestampCandidate || Number.isNaN(speed) || Number.isNaN(direction)) return null;

  const observedAt = parseLiveWindTimestamp(timestampCandidate);
  if (Number.isNaN(observedAt.getTime())) return null;

  const reading: LiveWind = {
    observedAt,
    windSpeedMs: speed,
    windDirectionDeg: direction,
    locationId: typeof data.loc_id === 'string' ? data.loc_id : locId,
    locationName: typeof data.loc_name === 'string' ? data.loc_name : locId,
    delaySeconds: Number.isFinite(delay) ? delay : null,
  };

  setCached(cacheKey, reading, TTL.LIVE_WIND);
  return reading;
}

type SerialisedLiveWindHistoryPoint = Omit<LiveWindHistoryPoint, 'time'> & { time: string };

export async function fetchLiveWindHistory(locId: string, historyHours = 6): Promise<LiveWindHistoryPoint[]> {
  const cacheKey = `live_wind_history_${locId}_${historyHours}`;
  const cached = getCached<SerialisedLiveWindHistoryPoint[]>(cacheKey);
  if (cached) return cached.map(p => ({ ...p, time: new Date(p.time) }));

  const res = await fetch(`/api/live-wind?locId=${encodeURIComponent(locId)}&historyHours=${historyHours}`);
  if (!res.ok) throw new Error(`Live wind history API error: ${res.status}`);

  const raw = await res.text();
  let payload: {
    status?: string;
    data?: Record<string, unknown>[] | null;
  };

  try {
    payload = JSON.parse(raw) as {
      status?: string;
      data?: Record<string, unknown>[] | null;
    };
  } catch {
    throw new Error('Live wind history API returned non-JSON response');
  }

  if (payload.status !== 'ok' || !Array.isArray(payload.data)) return [];

  const points = payload.data
    .map((entry): LiveWindHistoryPoint | null => {
      const tsCandidate = typeof entry.ts === 'string'
        ? entry.ts
        : `${String(entry.date ?? '')} ${String(entry.time ?? '')}`.trim();

      if (!tsCandidate) return null;

      const time = parseLiveWindTimestamp(tsCandidate);
      const avgWindMs = Number(entry.wsa);
      const gustWindMs = Number(entry.wsh ?? entry.wsa);
      const windDirectionDeg = Number(entry.wda ?? entry.wdc);

      if (
        Number.isNaN(time.getTime()) ||
        Number.isNaN(avgWindMs) ||
        Number.isNaN(gustWindMs) ||
        Number.isNaN(windDirectionDeg)
      ) {
        return null;
      }

      return { time, avgWindMs, gustWindMs, windDirectionDeg };
    })
    .filter((point): point is LiveWindHistoryPoint => point !== null)
    .sort((a, b) => a.time.getTime() - b.time.getTime());

  setCached(cacheKey, points, TTL.LIVE_WIND_HISTORY);
  return points;
}

type SerialisedSun = Omit<SunInfo, 'sunrise' | 'sunset'> & { sunrise: string; sunset: string };

export async function fetchSunInfo(lat: number, lon: number): Promise<SunInfo> {
  const cacheKey = `sun_${lat.toFixed(3)}_${lon.toFixed(3)}`;
  const cached = getCached<SerialisedSun>(cacheKey);
  if (cached) return { ...cached, sunrise: new Date(cached.sunrise), sunset: new Date(cached.sunset) };

  const res = await fetch(`/api/sun?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`);
  if (!res.ok) throw new Error('Sunrise API error');
  const data = await res.json();
  const r = data.results;
  const sunrise = new Date(r.sunrise);
  const sunset = new Date(r.sunset);
  const info: SunInfo = {
    sunrise,
    sunset,
    dayLength: Math.round((sunset.getTime() - sunrise.getTime()) / 60000),
  };

  setCached(cacheKey, info, TTL.SUN);
  return info;
}
