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

type SerialisedForecast = Omit<HourlyForecast, 'time'> & { time: string };

export async function fetchMetOfficeHourly(lat: number, lon: number): Promise<HourlyForecast[]> {
  const cacheKey = `metoffice_${lat.toFixed(3)}_${lon.toFixed(3)}`;
  const cached = getCached<SerialisedForecast[]>(cacheKey);
  if (cached) return cached.map(f => ({ ...f, time: new Date(f.time) }));

  const res = await fetch(`/api/forecast?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`);
  if (!res.ok) throw new Error(`Met Office API error: ${res.status} ${res.statusText}`);
  const data = await res.json();

  const features = data.features ?? [];
  if (!features.length) throw new Error('No forecast data returned');

  const timeSeries: unknown[] = features[0]?.properties?.timeSeries ?? [];
  const forecasts: HourlyForecast[] = timeSeries.map((entry: unknown) => {
    const e = entry as Record<string, unknown>;
    return {
      time: new Date(e.time as string),
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
