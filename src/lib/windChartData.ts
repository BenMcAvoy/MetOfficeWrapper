import type { HourlyForecast, LiveWindHistoryPoint, WindForecastPoint } from '@/lib/api';
import { msToKnots } from '@/lib/units';

export type SeriesPoint = { t: number; avg: number; gust: number };

export type WindChartRow = {
  t: number;
  fAvg: number | null;
  fGust: number | null;
  oAvg: number | null;
  oGust: number | null;
};

export const TEN_MIN = 10 * 60 * 1000;
export const HOUR = 60 * 60 * 1000;

export function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

export function bucket10(ms: number): number {
  return Math.floor(ms / TEN_MIN) * TEN_MIN;
}

export function interp(series: SeriesPoint[], t: number): { avg: number; gust: number } | null {
  if (!series.length) return null;
  if (t < series[0].t || t > series[series.length - 1].t) return null;

  let lo = 0;
  let hi = series.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].t === t) return { avg: series[mid].avg, gust: series[mid].gust };
    if (series[mid].t < t) lo = mid + 1;
    else hi = mid - 1;
  }
  const upper = series[lo];
  const lower = series[lo - 1];
  if (!upper || !lower) return null;
  const r = (t - lower.t) / (upper.t - lower.t);
  return {
    avg: round1(lower.avg + (upper.avg - lower.avg) * r),
    gust: round1(lower.gust + (upper.gust - lower.gust) * r),
  };
}

function knotPoint(time: Date, speedMs: number, gustMs: number): SeriesPoint {
  return {
    t: time.getTime(),
    avg: round1(msToKnots(speedMs)),
    gust: round1(msToKnots(gustMs)),
  };
}

export function buildForecastSeries(
  history: WindForecastPoint[],
  future: HourlyForecast[],
): SeriesPoint[] {
  const map = new Map<number, SeriesPoint>();
  for (const p of history) map.set(p.time.getTime(), knotPoint(p.time, p.windSpeed10m, p.windGustSpeed10m));
  for (const p of future) map.set(p.time.getTime(), knotPoint(p.time, p.windSpeed10m, p.windGustSpeed10m));
  return Array.from(map.values()).sort((a, b) => a.t - b.t);
}

export function buildObservedSeries(history: LiveWindHistoryPoint[]): SeriesPoint[] {
  const map = new Map<number, SeriesPoint>();
  for (const p of history) {
    const t = p.time.getTime();
    map.set(t, {
      t,
      avg: round1(msToKnots(p.avgWindMs)),
      gust: round1(msToKnots(p.gustWindMs)),
    });
  }
  return Array.from(map.values()).sort((a, b) => a.t - b.t);
}

export function nearestWithin(
  series: SeriesPoint[],
  t: number,
  toleranceMs: number,
): { avg: number; gust: number } | null {
  if (!series.length) return null;

  let lo = 0;
  let hi = series.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].t === t) return { avg: series[mid].avg, gust: series[mid].gust };
    if (series[mid].t < t) lo = mid + 1;
    else hi = mid - 1;
  }

  const upper = series[lo];
  const lower = series[lo - 1];
  let pick: SeriesPoint | undefined;
  if (upper && lower) {
    pick = (t - lower.t) <= (upper.t - t) ? lower : upper;
  } else {
    pick = upper ?? lower;
  }
  if (!pick) return null;
  if (Math.abs(pick.t - t) > toleranceMs) return null;
  return { avg: pick.avg, gust: pick.gust };
}

export function buildWindChartRows(
  forecastSeries: SeriesPoint[],
  observedSeries: SeriesPoint[],
  xMin: number,
  xMax: number,
): WindChartRow[] {
  const rows: WindChartRow[] = [];
  for (let t = xMin; t <= xMax; t += TEN_MIN) {
    const f = interp(forecastSeries, t);
    const o = interp(observedSeries, t);
    rows.push({
      t,
      fAvg: f?.avg ?? null,
      fGust: f?.gust ?? null,
      oAvg: o?.avg ?? null,
      oGust: o?.gust ?? null,
    });
  }
  return rows;
}
