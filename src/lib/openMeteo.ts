import type { HourlyForecast } from './api';

export interface WeatherNextResponse {
  hourly?: {
    time?: string[];
    temperature_2m?: number[];
    pressure_msl?: number[];
    precipitation?: number[];
    wind_speed_10m?: number[];
    wind_direction_10m?: number[];
    weather_code?: number[];
    [key: string]: string[] | number[] | undefined;
  };
}

function value(values: number[] | undefined, index: number, fallback: number): number {
  const candidate = values?.[index];
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : fallback;
}

export function parseWeatherNextResponse(payload: WeatherNextResponse): HourlyForecast[] {
  const hourly = payload.hourly;
  if (!hourly?.time?.length) return [];

  return hourly.time.map((time, index) => {
    const temperature = value(hourly.temperature_2m, index, 0);
    const windSpeed = value(hourly.wind_speed_10m, index, 0) / 3.6;
    const ensembleMaxKmh = Array.from({ length: 63 }, (_, member) =>
      value(hourly[`wind_speed_10m_member${String(member + 1).padStart(2, '0')}`] as number[] | undefined, index, NaN)
    ).filter(Number.isFinite).reduce((max, speed) => Math.max(max, speed), -Infinity);
    const upperWindSpeed = Number.isFinite(ensembleMaxKmh) ? ensembleMaxKmh / 3.6 : windSpeed;
    return {
      time: new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(time) ? time : `${time}Z`),
      screenTemperature: temperature,
      feelsLikeTemp: temperature,
      windSpeed10m: windSpeed,
      // WeatherNext has no true gust field; use the upper ensemble member as
      // an uncertainty ceiling. The chart labels this as "ensemble max".
      windGustSpeed10m: upperWindSpeed,
      windDirectionFrom10m: value(hourly.wind_direction_10m, index, 0),
      precipitationRate: value(hourly.precipitation, index, 0),
      probOfPrecipitation: 0,
      uvIndex: 0,
      significantWeatherCode: value(hourly.weather_code, index, -1),
      visibility: 0,
      mslp: value(hourly.pressure_msl, index, 1013),
      humidity: 0,
    };
  }).filter(forecast => !Number.isNaN(forecast.time.getTime()));
}
