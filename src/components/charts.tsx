import type { HourlyForecast, TideData, LiveWindHistoryPoint, WindForecastPoint } from '@/lib/api';
import { YAxisTick, tooltipStyle } from '@/lib/chartUtils';
import {
  buildForecastSeries,
  buildObservedSeries,
  buildWindChartRows,
  bucket10,
  HOUR,
} from '@/lib/windChartData';
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

const COLORS = {
  forecast: '#3b82f6',
  observed: '#10b981',
};

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

  const rows = buildWindChartRows(forecastSeries, observedSeries, xMin, xMax);
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
              <stop offset="0%" stopColor={COLORS.forecast} stopOpacity={0.18} />
              <stop offset="100%" stopColor={COLORS.forecast} stopOpacity={0} />
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
            tickMargin={6}
          />
          <YAxis
            width={52}
            domain={[0, 'auto']}
            allowDecimals={false}
            tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
            label={{
              value: 'knots',
              angle: -90,
              position: 'insideLeft',
              offset: 16,
              style: { fill: 'var(--muted-foreground)', fontSize: 10, textAnchor: 'middle' },
            }}
          />
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
            stroke={COLORS.forecast}
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
            stroke={COLORS.forecast}
            strokeOpacity={0.55}
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
                stroke={COLORS.observed}
                strokeWidth={2.25}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="oGust"
                name="Observed gust"
                stroke={COLORS.observed}
                strokeOpacity={0.55}
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
