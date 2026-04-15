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

function toTenMinuteBucket(timestampMs: number): number {
  const bucketMs = 10 * 60 * 1000;
  return Math.floor(timestampMs / bucketMs) * bucketMs;
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

  const map = new Map<number, WindChartPoint>();

  for (const forecast of forecasts) {
    const t = toTenMinuteBucket(forecast.time.getTime());
    if (t < minTime) continue;
    const existing = map.get(t);
    map.set(t, {
      t,
      time: format(new Date(t), 'HH:mm'),
      avg: Math.round(msToKnots(forecast.windSpeed10m) * 10) / 10,
      gust: Math.round(msToKnots(forecast.windGustSpeed10m) * 10) / 10,
      histAvg: existing?.histAvg ?? null,
      histGust: existing?.histGust ?? null,
    });
  }

  for (const point of liveHistory) {
    const t = toTenMinuteBucket(point.time.getTime());
    if (t < minTime) continue;
    const existing = map.get(t);
    map.set(t, {
      t,
      time: format(new Date(t), 'HH:mm'),
      avg: existing?.avg ?? null,
      gust: existing?.gust ?? null,
      histAvg: Math.round(msToKnots(point.avgWindMs) * 10) / 10,
      histGust: Math.round(msToKnots(point.gustWindMs) * 10) / 10,
    });
  }

  if (forcedMinTime !== null) {
    const firstForecast = Array.from(map.values())
      .filter(point => point.avg !== null && point.gust !== null)
      .sort((a, b) => a.t - b.t)[0];

    if (firstForecast && firstForecast.t > forcedMinTime) {
      const oneHour = 60 * 60 * 1000;
      for (let t = forcedMinTime; t < firstForecast.t; t += oneHour) {
        const existing = map.get(t);
        map.set(t, {
          t,
          time: format(new Date(t), 'HH:mm'),
          avg: firstForecast.avg,
          gust: firstForecast.gust,
          histAvg: existing?.histAvg ?? null,
          histGust: existing?.histGust ?? null,
        });
      }
    }
  }

  const data = Array.from(map.values())
    .sort((a, b) => a.t - b.t)
    .filter(d => d.t >= minTime);

  if (!data.length) return null;

  const xMin = forcedMinTime ?? data[0].t;
  const xMax = Math.max(data[data.length - 1].t, xMin + 60 * 60 * 1000);
  const xTicks = buildHourlyTicks(xMin, xMax);

  const refLineTime = startRefLine;
  const hasHistory = liveHistory.length > 0;

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
            labelFormatter={t => format(new Date(Number(t)), 'HH:mm')}
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
