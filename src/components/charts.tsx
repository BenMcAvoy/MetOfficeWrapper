import type { HourlyForecast, TideData, LiveWindHistoryPoint, WindForecastPoint } from '@/lib/api';
import { msToKnots } from '@/lib/units';
import { YAxisTick, tooltipStyle } from '@/lib/chartUtils';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine
} from 'recharts';
import { format, subHours, startOfHour } from 'date-fns';

interface WindChartProps {
  forecasts: HourlyForecast[];
  historyForecasts?: WindForecastPoint[];
  startRefLine?: number;
  liveHistory?: LiveWindHistoryPoint[];
  includePastHours?: number;
}

type SeriesPoint = { t: number; avg: number; gust: number };

type ChartRow = {
  t: number;
  fAvg: number | null;
  fGust: number | null;
  oAvg: number | null;
  oGust: number | null;
};

const TEN_MIN = 10 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

const COLORS = {
  forecastAvg: '#3b82f6',
  forecastGust: '#f97316',
  observedAvg: '#10b981',
  observedGust: '#dc2626',
};

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function bucket10(ms: number): number {
  return Math.floor(ms / TEN_MIN) * TEN_MIN;
}

function interp(series: SeriesPoint[], t: number): { avg: number; gust: number } | null {
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

function buildForecastSeries(
  history: WindForecastPoint[],
  future: HourlyForecast[],
): SeriesPoint[] {
  const map = new Map<number, SeriesPoint>();
  for (const p of history) {
    const t = p.time.getTime();
    map.set(t, {
      t,
      avg: round1(msToKnots(p.windSpeed10m)),
      gust: round1(msToKnots(p.windGustSpeed10m)),
    });
  }
  for (const p of future) {
    const t = p.time.getTime();
    map.set(t, {
      t,
      avg: round1(msToKnots(p.windSpeed10m)),
      gust: round1(msToKnots(p.windGustSpeed10m)),
    });
  }
  return Array.from(map.values()).sort((a, b) => a.t - b.t);
}

function buildObservedSeries(history: LiveWindHistoryPoint[]): SeriesPoint[] {
  const map = new Map<number, SeriesPoint>();
  for (const p of history) {
    const t = bucket10(p.time.getTime());
    const avg = round1(msToKnots(p.avgWindMs));
    const gust = round1(msToKnots(p.gustWindMs));
    const existing = map.get(t);
    if (existing) {
      map.set(t, { t, avg: round1((existing.avg + avg) / 2), gust: Math.max(existing.gust, gust) });
    } else {
      map.set(t, { t, avg, gust });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.t - b.t);
}

export function WindChart({
  forecasts,
  historyForecasts = [],
  startRefLine,
  liveHistory = [],
  includePastHours = 0,
}: WindChartProps) {
  const now = Date.now();
  const nowHour = startOfHour(new Date(now)).getTime();
  const forcedMin = includePastHours > 0 ? subHours(nowHour, includePastHours).getTime() : null;

  const forecastSeries = buildForecastSeries(historyForecasts, forecasts);
  const observedSeries = buildObservedSeries(liveHistory);

  if (!forecastSeries.length && !observedSeries.length) return null;

  const firstT = Math.min(
    forecastSeries[0]?.t ?? Number.POSITIVE_INFINITY,
    observedSeries[0]?.t ?? Number.POSITIVE_INFINITY,
  );
  const lastT = Math.max(
    forecastSeries[forecastSeries.length - 1]?.t ?? Number.NEGATIVE_INFINITY,
    observedSeries[observedSeries.length - 1]?.t ?? Number.NEGATIVE_INFINITY,
  );

  const xMin = bucket10(forcedMin ?? firstT);
  const xMax = bucket10(Math.max(lastT, xMin + HOUR));

  const rows: ChartRow[] = [];
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

  if (!rows.length) return null;

  const xTicks: number[] = [];
  {
    let t = startOfHour(new Date(xMin)).getTime();
    if (t < xMin) t += HOUR;
    for (; t <= xMax; t += HOUR) xTicks.push(t);
  }

  const hasObserved = observedSeries.length > 0;
  const showNow = now >= xMin && now <= xMax;

  return (
    <div className="h-44">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <ComposedChart data={rows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="windForecastAvgFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS.forecastAvg} stopOpacity={0.18} />
              <stop offset="100%" stopColor={COLORS.forecastAvg} stopOpacity={0} />
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
          <YAxis tick={<YAxisTick unit="kt" />} width={44} domain={[0, 'auto']} allowDecimals={false} />
          <Tooltip
            {...tooltipStyle}
            filterNull
            position={{ y: 0 }}
            allowEscapeViewBox={{ x: false, y: true }}
            wrapperStyle={{ pointerEvents: 'none', zIndex: 5 }}
            cursor={{ stroke: 'var(--muted-foreground)', strokeOpacity: 0.4, strokeWidth: 1 }}
            labelFormatter={t => format(new Date(Number(t)), 'HH:mm')}
            formatter={(value: unknown) =>
              typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)} kt` : '—'
            }
          />
          <Legend wrapperStyle={{ color: 'var(--muted-foreground)', fontSize: '11px' }} />

          {startRefLine && (
            <ReferenceLine
              x={startRefLine}
              stroke="var(--primary)"
              strokeDasharray="4 3"
              label={{ value: 'Start', fill: 'var(--primary)', fontSize: 10 }}
            />
          )}
          {showNow && (
            <ReferenceLine
              x={now}
              stroke="var(--muted-foreground)"
              strokeOpacity={0.6}
              strokeDasharray="2 4"
              label={{ value: 'Now', fill: 'var(--muted-foreground)', fontSize: 10, position: 'insideTopRight' }}
            />
          )}

          <Area
            type="monotone"
            dataKey="fAvg"
            name="Forecast avg"
            stroke={COLORS.forecastAvg}
            strokeWidth={2}
            fill="url(#windForecastAvgFill)"
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="fGust"
            name="Forecast gust"
            stroke={COLORS.forecastGust}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
          {hasObserved && (
            <>
              <Line
                type="monotone"
                dataKey="oAvg"
                name="Observed avg"
                stroke={COLORS.observedAvg}
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="oGust"
                name="Observed gust"
                stroke={COLORS.observedGust}
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            </>
          )}
        </ComposedChart>
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
        <ComposedChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
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
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
