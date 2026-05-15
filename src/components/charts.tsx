import { useState, type TouchEvent } from 'react';
import type { HourlyForecast, TideData, LiveWindHistoryPoint, WindForecastPoint } from '@/lib/api';
import { YAxisTick, tooltipStyle } from '@/lib/chartUtils';
import {
  buildForecastSeries,
  buildObservedSeries,
  buildWindChartRows,
  bucket10,
  HOUR,
} from '@/lib/windChartData';
import type { WindChartRow } from '@/lib/windChartData';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine
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
  avg: '#2563eb',
  gust: '#ea580c',
};

const FORECAST_DASH = '5 4';

type LegendEntry = {
  label: string;
  color: string;
  dashed: boolean;
};

function WindLegend({ entries }: { entries: LegendEntry[] }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-2 text-[11px] text-muted-foreground">
      {entries.map(e => (
        <div key={e.label} className="flex items-center gap-1.5">
          <svg width="26" height="10" aria-hidden>
            <line
              x1="0"
              x2="26"
              y1="5"
              y2="5"
              stroke={e.color}
              strokeWidth={2}
              strokeDasharray={e.dashed ? FORECAST_DASH : undefined}
            />
          </svg>
          <span>{e.label}</span>
        </div>
      ))}
    </div>
  );
}

function formatKt(v: number | null): string {
  return v === null || !Number.isFinite(v) ? '—' : Math.round(v).toString();
}

function ReadoutRow({
  label,
  avg,
  gust,
  dashed,
}: {
  label: string;
  avg: number | null;
  gust: number | null;
  dashed: boolean;
}) {
  const muted = avg === null && gust === null;
  return (
    <div className={`flex items-baseline gap-1.5 ${muted ? 'opacity-40' : ''}`}>
      <svg width="18" height="8" aria-hidden className="shrink-0">
        <line
          x1="0" x2="18" y1="4" y2="4"
          stroke={COLORS.avg}
          strokeWidth={2}
          strokeDasharray={dashed ? FORECAST_DASH : undefined}
        />
      </svg>
      <span className="text-muted-foreground text-[11px] w-8">{label}</span>
      <span className="font-semibold tabular-nums" style={{ color: COLORS.avg }}>{formatKt(avg)}</span>
      <span className="text-muted-foreground text-[10px]">/</span>
      <span className="font-semibold tabular-nums" style={{ color: COLORS.gust }}>{formatKt(gust)}</span>
      <span className="text-muted-foreground text-[10px]">G kt</span>
    </div>
  );
}

function WindReadoutStrip({
  row,
  pinned,
  showLive,
}: {
  row: WindChartRow | null;
  pinned: boolean;
  showLive: boolean;
}) {
  const time = row ? format(new Date(row.t), 'HH:mm') : '—';

  return (
    <div className="flex items-center justify-between gap-3 px-1 pb-2 text-xs">
      <div className="flex flex-col">
        <span className="text-muted-foreground text-[10px] uppercase tracking-wide">
          {pinned ? 'Hovered' : 'Latest'}
        </span>
        <span className="font-semibold tabular-nums">{time}</span>
      </div>
      <div className="flex flex-col gap-0.5">
        {showLive && (
          <ReadoutRow label="Live" avg={row?.oAvg ?? null} gust={row?.oGust ?? null} dashed={false} />
        )}
        <ReadoutRow label="Fcst" avg={row?.fAvg ?? null} gust={row?.fGust ?? null} dashed={true} />
      </div>
    </div>
  );
}

export function WindChart({
  forecasts,
  historyForecasts = [],
  startRefLine,
  liveHistory = [],
  includePastHours = 0,
}: WindChartProps) {
  const [activeRow, setActiveRow] = useState<WindChartRow | null>(null);
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

  const displayRow: WindChartRow | null = activeRow ?? rows[rows.length - 1] ?? null;

  const handleActive = (state: unknown) => {
    const s = state as {
      activeTooltipIndex?: number;
      activeLabel?: number | string;
      activePayload?: { payload: WindChartRow }[];
    } | null | undefined;
    if (!s) return;
    const fromPayload = s.activePayload?.[0]?.payload;
    const fromIndex = typeof s.activeTooltipIndex === 'number' ? rows[s.activeTooltipIndex] : undefined;
    const fromLabel = s.activeLabel !== undefined ? rows.find(r => r.t === Number(s.activeLabel)) : undefined;
    const next = fromPayload ?? fromIndex ?? fromLabel ?? null;
    if (next && next.t !== activeRow?.t) setActiveRow(next);
  };

  const handleTouch = (e: TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    if (!touch || rows.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
    const t = xMin + ratio * (xMax - xMin);
    let nearest = rows[0];
    let bestDist = Math.abs(rows[0].t - t);
    for (let i = 1; i < rows.length; i++) {
      const d = Math.abs(rows[i].t - t);
      if (d < bestDist) {
        nearest = rows[i];
        bestDist = d;
      }
    }
    if (nearest.t !== activeRow?.t) setActiveRow(nearest);
  };

  const legendEntries: LegendEntry[] = [
    ...(hasObserved
      ? [
          { label: 'Live avg', color: COLORS.avg, dashed: false },
          { label: 'Live gust', color: COLORS.gust, dashed: false },
        ]
      : []),
    { label: 'Forecast avg', color: COLORS.avg, dashed: true },
    { label: 'Forecast gust', color: COLORS.gust, dashed: true },
  ];

  return (
    <div>
      <WindReadoutStrip row={displayRow} pinned={!!activeRow} showLive={hasObserved} />
      <div
        className="h-44 touch-pan-y"
        onTouchStart={handleTouch}
        onTouchMove={handleTouch}
      >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <ComposedChart
          data={rows}
          margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
          onMouseMove={handleActive}
          onTouchStart={handleActive}
          onTouchMove={handleActive}
          onMouseLeave={() => setActiveRow(null)}
        >
          <defs>
            <linearGradient id="windObservedAvgFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS.avg} stopOpacity={0.18} />
              <stop offset="100%" stopColor={COLORS.avg} stopOpacity={0} />
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
            content={() => null}
            cursor={{ stroke: 'var(--muted-foreground)', strokeOpacity: 0.5, strokeWidth: 1 }}
          />
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

          <Line
            type="monotone"
            dataKey="fAvg"
            name="Forecast avg"
            stroke={COLORS.avg}
            strokeWidth={2}
            strokeDasharray={FORECAST_DASH}
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="fGust"
            name="Forecast gust"
            stroke={COLORS.gust}
            strokeWidth={2}
            strokeDasharray={FORECAST_DASH}
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
          {hasObserved && (
            <>
              <Area
                type="monotone"
                dataKey="oAvg"
                name="Live avg"
                stroke={COLORS.avg}
                strokeWidth={2.25}
                fill="url(#windObservedAvgFill)"
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="oGust"
                name="Live gust"
                stroke={COLORS.gust}
                strokeWidth={2.25}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>
      </div>
      <WindLegend entries={legendEntries} />
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
