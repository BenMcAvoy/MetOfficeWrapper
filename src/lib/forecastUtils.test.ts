import { describe, expect, it } from 'vitest';
import type { HourlyForecast } from './api';
import { filterForDay } from './forecastUtils';

function fc(time: string): HourlyForecast {
  return {
    time: new Date(time),
    screenTemperature: 0, feelsLikeTemp: 0,
    windSpeed10m: 0, windGustSpeed10m: 0, windDirectionFrom10m: 0,
    precipitationRate: 0, probOfPrecipitation: 0, uvIndex: 0,
    significantWeatherCode: -1, visibility: 0, mslp: 1013, humidity: 0,
  };
}

describe('filterForDay', () => {
  const forecasts = [
    fc('2026-05-15T08:00:00Z'),
    fc('2026-05-15T12:00:00Z'),
    fc('2026-05-15T18:00:00Z'),
    fc('2026-05-16T08:00:00Z'),
    fc('2026-05-16T20:00:00Z'),
  ];

  it('returns only forecasts on the selected non-today date', () => {
    const day = new Date('2026-05-16T00:00:00Z');
    const now = new Date('2026-05-15T10:00:00Z');
    const out = filterForDay(forecasts, day, now);
    expect(out).toHaveLength(2);
    expect(out.every(f => f.time.getUTCDate() === 16)).toBe(true);
  });

  it('drops past hours when day === today', () => {
    const day = new Date('2026-05-15T00:00:00Z');
    const now = new Date('2026-05-15T13:00:00Z');
    const out = filterForDay(forecasts, day, now);
    expect(out.map(f => f.time.toISOString())).toEqual([
      '2026-05-15T18:00:00.000Z',
    ]);
  });

  it('keeps current hour when day === today', () => {
    const day = new Date('2026-05-15T00:00:00Z');
    const now = new Date('2026-05-15T12:30:00Z');
    const out = filterForDay(forecasts, day, now);
    expect(out.map(f => f.time.toISOString())).toEqual([
      '2026-05-15T12:00:00.000Z',
      '2026-05-15T18:00:00.000Z',
    ]);
  });
});
