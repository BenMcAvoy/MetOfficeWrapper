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

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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

export async function fetchMetOfficeHourly(
  lat: number,
  lon: number,
  apiKey: string
): Promise<HourlyForecast[]> {
  const cacheKey = `metoffice_${lat.toFixed(3)}_${lon.toFixed(3)}`;
  const cached = getCached<SerialisedForecast[]>(cacheKey);
  if (cached) return cached.map(f => ({ ...f, time: new Date(f.time) }));

  const url = `/metoffice/sitespecific/v0/point/hourly?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}`;
  const res = await fetch(url, { headers: { apikey: apiKey } });
  if (!res.ok) throw new Error(`Met Office API error: ${res.status} ${res.statusText}`);
  const data = await res.json();

  const features = data.features ?? [];
  if (!features.length) throw new Error('No forecast data returned');

  const timeSeries: unknown[] = features[0]?.properties?.timeSeries ?? [];
  const forecasts: HourlyForecast[] = timeSeries.map((entry: unknown) => {
    const e = entry as Record<string, unknown>;
    return {
      time: new Date(e.time as string),
      screenTemperature:     (e.screenTemperature as number)      ?? 0,
      feelsLikeTemp:         (e.feelsLikeTemp as number)           ?? 0,
      windSpeed10m:          (e.windSpeed10m as number)            ?? 0,
      windGustSpeed10m:      (e.windGustSpeed10m as number)        ?? 0,
      windDirectionFrom10m:  (e.windDirectionFrom10m as number)    ?? 0,
      precipitationRate:     (e.precipitationRate as number)       ?? 0,
      probOfPrecipitation:   (e.probOfPrecipitation as number)     ?? 0,
      uvIndex:               (e.uvIndex as number)                 ?? 0,
      significantWeatherCode:(e.significantWeatherCode as number)  ?? -1,
      visibility:            (e.visibility as number)              ?? 0,
      mslp:                  (e.mslp as number)                    ?? 1013,
      humidity:              (e.screenRelativeHumidity as number)  ?? 0,
    };
  });

  setCached(cacheKey, forecasts, TTL.FORECAST);
  return forecasts;
}

interface UKHOStation {
  Id: string;
  Name: string;
  Latitude: number;
  Longitude: number;
  Country: string;
}

type SerialisedExtreme = Omit<TideExtreme, 'time'> & { time: string };

async function fetchNearestStation(lat: number, lon: number, apiKey: string): Promise<UKHOStation> {
  const cacheKey = 'ukho_stations';
  let stations = getCached<UKHOStation[]>(cacheKey);

  if (!stations) {
    const res = await fetch('/ukho/uktidalapi/api/V1/Stations', {
      headers: { 'Ocp-Apim-Subscription-Key': apiKey },
    });
    if (!res.ok) throw new Error(`UKHO stations error: ${res.status}`);
    const data = await res.json();
    stations = (data.features as unknown[]).map((f: unknown) => {
      const feat = f as Record<string, unknown>;
      const props = feat.properties as Record<string, unknown>;
      const coords = (feat.geometry as Record<string, unknown>).coordinates as number[];
      return {
        Id: props.Id as string,
        Name: props.Name as string,
        Latitude: coords[1],
        Longitude: coords[0],
        Country: props.Country as string,
      };
    });
    setCached(cacheKey, stations, TTL.STATIONS);
  }

  return stations.reduce((best, s) =>
    haversineKm(lat, lon, s.Latitude, s.Longitude) <
    haversineKm(lat, lon, best.Latitude, best.Longitude) ? s : best
  );
}

export async function fetchTides(
  lat: number,
  lon: number,
  apiKey: string
): Promise<TideData> {
  const cacheKey = `ukho_tides_${lat.toFixed(3)}_${lon.toFixed(3)}`;
  const cached = getCached<{ extremes: SerialisedExtreme[]; stationName: string }>(cacheKey);
  if (cached) {
    const extremes = cached.extremes.map(e => ({ ...e, time: new Date(e.time) }));
    return { extremes, heights: interpolateTideCurve(extremes), stationName: cached.stationName };
  }

  const station = await fetchNearestStation(lat, lon, apiKey);

  const res = await fetch(
    `/ukho/uktidalapi/api/V1/Stations/${station.Id}/TidalEvents?duration=4`,
    { headers: { 'Ocp-Apim-Subscription-Key': apiKey } }
  );
  if (!res.ok) throw new Error(`UKHO tidal events error: ${res.status}`);
  const data: unknown[] = await res.json();

  const extremes: TideExtreme[] = (data as Record<string, unknown>[]).map(e => ({
    time: new Date(e.DateTime as string),
    height: e.Height as number,
    type: (e.EventType as string).includes('High') ? 'High' : 'Low',
  }));

  setCached(cacheKey, { extremes, stationName: station.Name }, TTL.TIDES);
  return { extremes, heights: interpolateTideCurve(extremes), stationName: station.Name };
}

type SerialisedSun = Omit<SunInfo, 'sunrise' | 'sunset'> & { sunrise: string; sunset: string };

export async function fetchSunInfo(lat: number, lon: number): Promise<SunInfo> {
  const cacheKey = `sun_${lat.toFixed(3)}_${lon.toFixed(3)}`;
  const cached = getCached<SerialisedSun>(cacheKey);
  if (cached) return { ...cached, sunrise: new Date(cached.sunrise), sunset: new Date(cached.sunset) };

  const url = `/sunrisesunset/json?lat=${lat.toFixed(4)}&lng=${lon.toFixed(4)}&formatted=0`;
  const res = await fetch(url);
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
