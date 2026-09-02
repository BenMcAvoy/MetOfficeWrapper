import { describe, expect, it } from 'vitest';
import { parseWeatherNextResponse } from './openMeteo';

describe('parseWeatherNextResponse', () => {
  it('maps WeatherNext hourly means into the app forecast shape', () => {
    const result = parseWeatherNextResponse({
      hourly: {
        time: ['2026-09-02T12:00'],
        temperature_2m: [18.5],
        pressure_msl: [1018],
        precipitation: [0.4],
        wind_speed_10m: [18],
        wind_direction_10m: [225],
        weather_code: [63],
      },
    });
    expect(result[0]).toMatchObject({
      screenTemperature: 18.5,
      windSpeed10m: 5,
      windGustSpeed10m: 5,
      precipitationRate: 0.4,
      significantWeatherCode: 63,
      mslp: 1018,
    });
    expect(result[0].time.toISOString()).toBe('2026-09-02T12:00:00.000Z');
  });
});
