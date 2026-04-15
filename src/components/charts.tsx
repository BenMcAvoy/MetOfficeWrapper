import type { HourlyForecast, TideData, LiveWindHistoryPoint } from '@/lib/api';
import { msToKnots } from '@/lib/units';
import { YAxisTick, tooltipStyle } from '@/lib/chartUtils';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine, Line
} from 'recharts';
import { format, subHours, startOfHour } from 'date-fns';

interface WindChartProps {
  forecasts: HourlyForecast[];
  startRefLine?: number;
  liveHistory?: LiveWindHistoryPoint[];
  includePastHours?: number;
}

type WindChartPoint = {
  t: number;
  time: string;
  avg: number | null;
  gust: number | null;
  histAvg: number | null;
  histGust: number | null;
};

type SeriesPoint = {
  t: number;
  avg: number;
  gust: number;
};

const TEN_MINUTES_MS = 10 * 60 * 1000;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function toTenMinuteBucket(timestampMs: number): number {
  return Math.floor(timestampMs / TEN_MINUTES_MS) * TEN_MINUTES_MS;
}

function interpolateSeries(series: SeriesPoint[], t: number, clampEdges: boolean): { avg: number; gust: number } | null {
  if (!series.length) return null;

  const first = series[0];
  const last = series[series.length - 1];

  if (t < first.t) return clampEdges ? { avg: first.avg, gust: first.gust } : null;
  if (t > last.t) return clampEdges ? { avg: last.avg, gust: last.gust } : null;
  if (t === first.t) return { avg: first.avg, gust: first.gust };
  if (t === last.t) return { avg: last.avg, gust: last.gust };

  let lo = 0;
  let hi = series.length - 1;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const mt = series[mid].t;
    if (mt === t) return { avg: series[mid].avg, gust: series[mid].gust };
    if (mt < t) lo = mid + 1;
    else hi = mid - 1;
  }

  const upper = series[lo];
  const lower = series[lo - 1];
  if (!upper || !lower) return null;
  if (upper.t === lower.t) return { avg: upper.avg, gust: upper.gust };

  const ratio = (t - lower.t) / (upper.t - lower.t);
  return {
    avg: round1(lower.avg + (upper.avg - lower.avg) * ratio),
    gust: round1(lower.gust + (upper.gust - lower.gust) * ratio),
  };
}

function buildHourlyTicks(minTime: number, maxTime: number): number[] {
  const ticks: number[] = [];
  let t = startOfHour(new Date(minTime)).getTime();
  const oneHour = 60 * 60 * 1000;
  while (t <= maxTime) {
    ticks.push(t);
    t += oneHour;
  }
  return ticks;
}

export function WindChart({ forecasts, startRefLine, liveHistory = [], includePastHours = 0 }: WindChartProps) {
  const now = new Date();
  const nowHour = startOfHour(now).getTime();
  const forcedMinTime = includePastHours > 0 ? subHours(nowHour, includePastHours).getTime() : null;
  const minTime = forcedMinTime ?? Number.NEGATIVE_INFINITY;

  const forecastMap = new Map<number, SeriesPoint>();
  const observedMap = new Map<number, SeriesPoint>();

  for (const forecast of forecasts) {
    const t = toTenMinuteBucket(forecast.time.getTime());
    if (t < minTime) continue;
    forecastMap.set(t, {
      t,
      avg: round1(msToKnots(forecast.windSpeed10m)),
      gust: round1(msToKnots(forecast.windGustSpeed10m)),
    });
  }

  for (const point of liveHistory) {
    const t = toTenMinuteBucket(point.time.getTime());
    if (t < minTime) continue;
    observedMap.set(t, {
      t,
      avg: round1(msToKnots(point.avgWindMs)),
      gust: round1(msToKnots(point.gustWindMs)),
    });
  }

  const forecastSeries = Array.from(forecastMap.values()).sort((a, b) => a.t - b.t);
  const observedSeries = Array.from(observedMap.values()).sort((a, b) => a.t - b.t);

  if (!forecastSeries.length && !observedSeries.length) return null;

  const firstDataTime = Math.min(
    forecastSeries[0]?.t ?? Number.POSITIVE_INFINITY,
    observedSeries[0]?.t ?? Number.POSITIVE_INFINITY,
  );
  const lastDataTime = Math.max(
    forecastSeries[forecastSeries.length - 1]?.t ?? Number.NEGATIVE_INFINITY,
    observedSeries[observedSeries.length - 1]?.t ?? Number.NEGATIVE_INFINITY,
  );

  const xMin = forcedMinTime ?? firstDataTime;
  const xMax = Math.max(lastDataTime, xMin + 60 * 60 * 1000);

  const data: WindChartPoint[] = [];
  for (let t = toTenMinuteBucket(xMin); t <= xMax; t += TEN_MINUTES_MS) {
    if (t < xMin) continue;
    const forecastPoint = interpolateSeries(forecastSeries, t, true);
    const observedPoint = interpolateSeries(observedSeries, t, false);
    data.push({
      t,
      time: format(new Date(t), 'HH:mm'),
      avg: forecastPoint?.avg ?? null,
      gust: forecastPoint?.gust ?? null,
      histAvg: observedPoint?.avg ?? null,
      histGust: observedPoint?.gust ?? null,
    });
  }

  if (!data.length) return null;

  const xTicks = buildHourlyTicks(xMin, xMax);

  const refLineTime = startRefLine;
  const hasHistory = observedSeries.length > 0;

  return (
    <div className="h-44">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="windAvgGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#2563eb" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="windGustGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ea580c" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#ea580c" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={[xMin, xMax]}
            ticks={xTicks}
            tickFormatter={t => format(new Date(Number(t)), 'HH:mm')}
            tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
          />
          <YAxis tick={<YAxisTick unit="kt" />} width={44} />
          <Tooltip
            {...tooltipStyle}
            filterNull={false}
            labelFormatter={t => format(new Date(Number(t)), 'HH:mm')}
            formatter={(value: unknown) =>
              typeof value === 'number' && Number.isFinite(value)
                ? `${value.toFixed(1)} kt`
                : '—'
            }
          />
          <Legend wrapperStyle={{ color: 'var(--muted-foreground)', fontSize: '11px' }} />
          {refLineTime && (
            <ReferenceLine x={refLineTime} stroke="var(--primary)" strokeDasharray="4 3" label={{ value: 'Start', fill: 'var(--primary)', fontSize: 10 }} />
          )}
          <Area type="monotone" dataKey="avg" name="Forecast Avg" stroke="#2563eb" fill="url(#windAvgGrad)" strokeWidth={2} dot={false} connectNulls />
          <Area type="monotone" dataKey="gust" name="Forecast Gust" stroke="#ea580c" fill="url(#windGustGrad)" strokeWidth={2} dot={false} connectNulls />
          {hasHistory && (
            <>
              <Line type="monotone" dataKey="histAvg" name="Observed Avg" stroke="#0ea5e9" strokeWidth={2} dot={false} strokeDasharray="6 4" connectNulls />
              <Line type="monotone" dataKey="histGust" name="Observed Gust" stroke="#f97316" strokeWidth={2} dot={false} strokeDasharray="4 3" connectNulls />
            </>
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

interface TideChartInnerProps {
  tideData: TideData;
  windowStart: Date;
  windowEnd: Date;
  tickIntervalHours?: number;
  startRefLine?: number;
  nowRefLine?: number;
  height?: number;
}

export function TideChartInner({ tideData, windowStart, windowEnd, tickIntervalHours = 3, startRefLine, nowRefLine, height = 176 }: TideChartInnerProps) {
  const data = tideData.heights
    .filter(h => h.time >= windowStart && h.time <= windowEnd)
    .map(h => ({ t: h.time.getTime(), height: Math.round(h.height * 100) / 100 }));

  const ticks = (() => {
    const result: number[] = [];
    const start = new Date(windowStart);
    start.setMinutes(0, 0, 0);
    const intervalMs = tickIntervalHours * 60 * 60 * 1000;
    if (tickIntervalHours === 3 && start.getHours() % 3 !== 0) {
      start.setHours(start.getHours() + (3 - start.getHours() % 3));
    }
    for (let t = start.getTime(); t <= windowEnd.getTime(); t += intervalMs) result.push(t);
    return result;
  })();

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="tideAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} ticks={ticks} tickFormatter={t => format(new Date(t), 'HH:mm')} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
          <YAxis tick={<YAxisTick unit="m" />} width={40} domain={['auto', 'auto']} />
          <Tooltip {...tooltipStyle} labelFormatter={t => format(new Date(t), 'HH:mm')} formatter={v => [`${Number(v).toFixed(2)}m`, 'Height']} />
          {nowRefLine !== undefined && (
            <ReferenceLine y={nowRefLine} stroke="var(--primary)" strokeDasharray="4 4" label={(props: { viewBox?: { x?: number; y?: number } }) => (
              <text x={props.viewBox?.x} y={(props.viewBox?.y ?? 0) - 4} style={{ fill: 'var(--primary)' }} fontSize={10} textAnchor="middle">Now</text>
            )} />
          )}
          {startRefLine !== undefined && (
            <ReferenceLine x={startRefLine} stroke="var(--primary)" strokeDasharray="4 3" label={{ value: 'Start', fill: 'var(--primary)', fontSize: 10 }} />
          )}
          <Area type="monotone" dataKey="height" stroke="#2563eb" fill="url(#tideAreaGrad)" strokeWidth={2} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
