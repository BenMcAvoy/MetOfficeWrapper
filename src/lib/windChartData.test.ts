import { describe, expect, it } from 'vitest';
import type { HourlyForecast, LiveWindHistoryPoint, WindForecastPoint } from './api';
import { MS_TO_KNOTS } from './units';
import {
  TEN_MIN,
  bucket10,
  interp,
  nearestWithin,
  round1,
  buildForecastSeries,
  buildObservedSeries,
  buildWindChartRows,
} from './windChartData';

const baseHour = new Date('2026-05-15T12:00:00Z').getTime();

function forecastAt(offsetMs: number, speedMs: number, gustMs: number): HourlyForecast {
  return {
    time: new Date(baseHour + offsetMs),
    screenTemperature: 0,
    feelsLikeTemp: 0,
    windSpeed10m: speedMs,
    windGustSpeed10m: gustMs,
    windDirectionFrom10m: 0,
    precipitationRate: 0,
    probOfPrecipitation: 0,
    uvIndex: 0,
    significantWeatherCode: -1,
    visibility: 0,
    mslp: 1013,
    humidity: 0,
  };
}

function windForecastAt(offsetMs: number, speedMs: number, gustMs: number): WindForecastPoint {
  return { time: new Date(baseHour + offsetMs), windSpeed10m: speedMs, windGustSpeed10m: gustMs };
}

function liveAt(offsetMs: number, avgMs: number, gustMs: number, dirDeg = 180): LiveWindHistoryPoint {
  return { time: new Date(baseHour + offsetMs), avgWindMs: avgMs, gustWindMs: gustMs, windDirectionDeg: dirDeg };
}

describe('round1', () => {
  it('rounds to one decimal place', () => {
    expect(round1(1.2345)).toBe(1.2);
    expect(round1(1.25)).toBe(1.3);
    expect(round1(-1.25)).toBe(-1.2); // banker-style flip from Math.round
  });
});

describe('bucket10', () => {
  it('floors to a 10-minute boundary', () => {
    const t = new Date('2026-05-15T12:07:30Z').getTime();
    expect(bucket10(t)).toBe(new Date('2026-05-15T12:00:00Z').getTime());
  });

  it('is idempotent on exact boundaries', () => {
    const t = new Date('2026-05-15T12:10:00Z').getTime();
    expect(bucket10(t)).toBe(t);
  });
});

describe('interp', () => {
  const series = [
    { t: 0, avg: 10, gust: 12 },
    { t: 100, avg: 20, gust: 30 },
  ];

  it('returns null for empty series', () => {
    expect(interp([], 50)).toBeNull();
  });

  it('returns null outside the range', () => {
    expect(interp(series, -1)).toBeNull();
    expect(interp(series, 101)).toBeNull();
  });

  it('returns exact value at boundary', () => {
    expect(interp(series, 0)).toEqual({ avg: 10, gust: 12 });
    expect(interp(series, 100)).toEqual({ avg: 20, gust: 30 });
  });

  it('interpolates linearly between points', () => {
    expect(interp(series, 50)).toEqual({ avg: 15, gust: 21 });
  });

  it('handles a midpoint that lands on an exact data t', () => {
    const three = [
      { t: 0, avg: 0, gust: 0 },
      { t: 50, avg: 5, gust: 6 },
      { t: 100, avg: 10, gust: 12 },
    ];
    expect(interp(three, 50)).toEqual({ avg: 5, gust: 6 });
  });
});

describe('buildForecastSeries', () => {
  it('merges history and future, dedupes by timestamp, sorts ascending', () => {
    const history = [windForecastAt(0, 5, 7)];
    const future = [
      windForecastAt(3 * TEN_MIN, 8, 10),
      windForecastAt(TEN_MIN, 6, 8),
    ];
    const series = buildForecastSeries(history, future as unknown as HourlyForecast[]);
    expect(series.map(p => p.t - baseHour)).toEqual([0, TEN_MIN, 3 * TEN_MIN]);
  });

  it('lets future overwrite history on collision', () => {
    const history = [windForecastAt(0, 5, 5)];
    const future = [forecastAt(0, 20, 25)];
    const series = buildForecastSeries(history, future);
    expect(series).toHaveLength(1);
    expect(series[0].avg).toBeCloseTo(20 * MS_TO_KNOTS, 1);
  });

  it('converts m/s to knots, rounded to 1dp', () => {
    const series = buildForecastSeries([], [forecastAt(0, 5, 8)]);
    expect(series[0].avg).toBe(round1(5 * MS_TO_KNOTS));
    expect(series[0].gust).toBe(round1(8 * MS_TO_KNOTS));
  });
});

describe('buildObservedSeries', () => {
  it('keeps native timestamps without bucketing', () => {
    const series = buildObservedSeries([
      liveAt(0, 5, 7),
      liveAt(2 * 60 * 1000, 7, 9),
      liveAt(15 * 60 * 1000, 10, 12),
    ]);
    expect(series.map(p => p.t - baseHour)).toEqual([0, 2 * 60 * 1000, 15 * 60 * 1000]);
    expect(series[0].avg).toBe(round1(5 * MS_TO_KNOTS));
    expect(series[1].gust).toBe(round1(9 * MS_TO_KNOTS));
  });

  it('dedupes duplicate timestamps (last wins)', () => {
    const series = buildObservedSeries([
      liveAt(0, 5, 5),
      liveAt(0, 8, 10),
    ]);
    expect(series).toHaveLength(1);
    expect(series[0].avg).toBe(round1(8 * MS_TO_KNOTS));
  });

  it('returns ascending time order', () => {
    const out = buildObservedSeries([
      liveAt(20 * 60 * 1000, 5, 5),
      liveAt(0, 4, 4),
      liveAt(10 * 60 * 1000, 6, 6),
    ]);
    expect(out.map(p => p.t)).toEqual([...out].map(p => p.t).sort((a, b) => a - b));
  });
});

describe('nearestWithin', () => {
  const series = [
    { t: 0, avg: 10, gust: 12 },
    { t: 60_000, avg: 14, gust: 18 },
    { t: 120_000, avg: 16, gust: 22 },
  ];

  it('returns null for an empty series', () => {
    expect(nearestWithin([], 100, 60_000)).toBeNull();
  });

  it('returns the exact point if t matches', () => {
    expect(nearestWithin(series, 60_000, 1)).toEqual({ avg: 14, gust: 18 });
  });

  it('picks the closer side', () => {
    expect(nearestWithin(series, 20_000, 60_000)).toEqual({ avg: 10, gust: 12 });
    expect(nearestWithin(series, 50_000, 60_000)).toEqual({ avg: 14, gust: 18 });
  });

  it('extends past the series end within tolerance', () => {
    expect(nearestWithin(series, 130_000, 15_000)).toEqual({ avg: 16, gust: 22 });
  });

  it('returns null when nearest point exceeds tolerance', () => {
    expect(nearestWithin(series, 500_000, 60_000)).toBeNull();
  });
});

describe('buildWindChartRows', () => {
  it('produces one row per 10-min slot in [xMin, xMax]', () => {
    const rows = buildWindChartRows([], [], 0, 3 * TEN_MIN);
    expect(rows.map(r => r.t)).toEqual([0, TEN_MIN, 2 * TEN_MIN, 3 * TEN_MIN]);
  });

  it('emits null when no series covers the slot', () => {
    const rows = buildWindChartRows([], [], 0, TEN_MIN);
    expect(rows.every(r => r.fAvg === null && r.oAvg === null)).toBe(true);
  });

  it('separates forecast vs observed values into f* and o*', () => {
    const f = [{ t: 0, avg: 10, gust: 12 }, { t: TEN_MIN, avg: 12, gust: 14 }];
    const o = [{ t: 0, avg: 11, gust: 13 }, { t: TEN_MIN, avg: 13, gust: 16 }];
    const rows = buildWindChartRows(f, o, 0, TEN_MIN);
    expect(rows[0]).toMatchObject({ fAvg: 10, fGust: 12, oAvg: 11, oGust: 13 });
    expect(rows[1]).toMatchObject({ fAvg: 12, fGust: 14, oAvg: 13, oGust: 16 });
  });
});
