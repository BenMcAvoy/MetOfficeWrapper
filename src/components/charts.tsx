import { useState, useRef, useEffect } from 'react';
import type { HourlyForecast, TideData, LiveWindHistoryPoint, WindForecastPoint, MarinePoint } from '@/lib/api';
import { YAxisTick, tooltipStyle } from '@/lib/chartUtils';
import {
  buildForecastSeries,
  buildObservedSeries,
  buildWindChartRows,
  bucket10,
  interp,
  nearestWithin,
  HOUR,
} from '@/lib/windChartData';
import type { SeriesPoint, WindChartRow } from '@/lib/windChartData';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Customized,
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
  avg: 'var(--chart-avg)',
  gust: 'var(--chart-gust)',
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

const READOUT_OBSERVED_TOLERANCE_MS = 15 * 60 * 1000;

function WindReadoutStrip({
  t,
  forecastSeries,
  observedSeries,
  pinned,
  showLive,
}: {
  t: number | null;
  forecastSeries: SeriesPoint[];
  observedSeries: SeriesPoint[];
  pinned: boolean;
  showLive: boolean;
}) {
  const time = t !== null ? format(new Date(t), 'HH:mm') : '—';
  const f = t !== null ? interp(forecastSeries, t) : null;
  const o = t !== null ? nearestWithin(observedSeries, t, READOUT_OBSERVED_TOLERANCE_MS) : null;

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
          <ReadoutRow label="Live" avg={o?.avg ?? null} gust={o?.gust ?? null} dashed={false} />
        )}
        <ReadoutRow label="Fcst" avg={f?.avg ?? null} gust={f?.gust ?? null} dashed={true} />
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
  const [interacted, setInteracted] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef<WindChartRow[]>([]);
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
  rowsRef.current = rows;
  if (!rows.length) return null;

  const xTicks: number[] = [];
  {
    let t = startOfHour(new Date(xMin)).getTime();
    if (t < xMin) t += HOUR;
    for (; t <= xMax; t += HOUR) xTicks.push(t);
  }

  const hasObserved = observedSeries.length > 0;
  const showNow = now >= xMin && now <= xMax;

  const latestRow: WindChartRow = rows.reduce(
    (best, r) => (Math.abs(r.t - now) < Math.abs(best.t - now) ? r : best),
    rows[0],
  );
  const readoutRow: WindChartRow | null = activeRow ?? (interacted ? null : latestRow);

  const yAxisWidth = 52;
  const rightMargin = 4;

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const pickFromClientX = (clientX: number) => {
      const rs = rowsRef.current;
      if (!rs.length) return;
      const rect = el.getBoundingClientRect();
      const plotLeft = rect.left + yAxisWidth;
      const plotRight = rect.right - rightMargin;
      const plotWidth = Math.max(1, plotRight - plotLeft);
      const x = Math.min(plotRight, Math.max(plotLeft, clientX)) - plotLeft;
      const minT = rs[0].t;
      const maxT = rs[rs.length - 1].t;
      const t = minT + (x / plotWidth) * (maxT - minT);
      let best = rs[0];
      let bestDelta = Math.abs(best.t - t);
      for (let i = 1; i < rs.length; i++) {
        const d = Math.abs(rs[i].t - t);
        if (d < bestDelta) { best = rs[i]; bestDelta = d; }
      }
      setInteracted(true);
      setActiveRow(prev => (prev?.t === best.t ? prev : best));
    };
    const onTouchStart = (e: TouchEvent) => {
      if (!e.touches[0]) return;
      e.preventDefault();
      pickFromClientX(e.touches[0].clientX);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!e.touches[0]) return;
      e.preventDefault();
      pickFromClientX(e.touches[0].clientX);
    };
    el.addEventListener('touchstart', onTouchStart, { passive: false, capture: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart, { capture: true } as EventListenerOptions);
      el.removeEventListener('touchmove', onTouchMove, { capture: true } as EventListenerOptions);
    };
  }, []);

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
      {readoutRow && (
        <WindReadoutStrip
          t={readoutRow.t}
          forecastSeries={forecastSeries}
          observedSeries={observedSeries}
          pinned={!!activeRow}
          showLive={hasObserved}
        />
      )}
      <div
        ref={wrapperRef}
        className="h-44 [&_*]:touch-none [&_.recharts-area]:pointer-events-none"
        style={{ touchAction: 'none' }}
        onMouseMove={(e) => {
          const el = wrapperRef.current;
          if (!el) return;
          const rs = rowsRef.current;
          if (!rs.length) return;
          const rect = el.getBoundingClientRect();
          const plotLeft = rect.left + yAxisWidth;
          const plotRight = rect.right - rightMargin;
          const plotWidth = Math.max(1, plotRight - plotLeft);
          const x = Math.min(plotRight, Math.max(plotLeft, e.clientX)) - plotLeft;
          const minT = rs[0].t;
          const maxT = rs[rs.length - 1].t;
          const t = minT + (x / plotWidth) * (maxT - minT);
          let best = rs[0];
          let bestDelta = Math.abs(best.t - t);
          for (let i = 1; i < rs.length; i++) {
            const d = Math.abs(rs[i].t - t);
            if (d < bestDelta) { best = rs[i]; bestDelta = d; }
          }
          setInteracted(true);
          setActiveRow(prev => (prev?.t === best.t ? prev : best));
        }}
      >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <ComposedChart
          data={rows}
          margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
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
  flowPoints?: MarinePoint[];
  arrowIntervalHours?: number;
}

const KMH_TO_KNOTS_CHART = 0.539957;

function interpolateTideHeightAt(heights: { time: Date; height: number }[], at: number): number | null {
  if (heights.length < 2) return null;
  let before: { time: Date; height: number } | null = null;
  let after: { time: Date; height: number } | null = null;
  for (const h of heights) {
    const t = h.time.getTime();
    if (t <= at) before = h;
    if (t >= at && !after) { after = h; break; }
  }
  if (!before || !after) return null;
  if (before === after) return before.height;
  const ratio = (at - before.time.getTime()) / (after.time.getTime() - before.time.getTime());
  return before.height + ratio * (after.height - before.height);
}

interface FlowArrowsProps {
  flowPoints: MarinePoint[];
  arrowIntervalHours: number;
  heights: { time: Date; height: number }[];
  windowStart: Date;
  windowEnd: Date;
  xAxisMap?: Record<string, { scale: (v: number) => number }>;
  yAxisMap?: Record<string, { scale: (v: number) => number }>;
}

function FlowArrows(props: FlowArrowsProps) {
  const { flowPoints, arrowIntervalHours, heights, windowStart, windowEnd, xAxisMap, yAxisMap } = props;
  const xAxis = xAxisMap && Object.values(xAxisMap)[0];
  const yAxis = yAxisMap && Object.values(yAxisMap)[0];
  if (!xAxis || !yAxis || !flowPoints.length) return null;

  const first = new Date(windowStart);
  first.setMinutes(0, 0, 0);
  if (first.getTime() < windowStart.getTime()) first.setHours(first.getHours() + 1);
  // Snap to a multiple of arrowIntervalHours from midnight for stable placement.
  while (first.getHours() % arrowIntervalHours !== 0) first.setHours(first.getHours() + 1);

  const intervalMs = arrowIntervalHours * 60 * 60 * 1000;
  const nodes: React.ReactNode[] = [];
  for (let t = first.getTime(); t <= windowEnd.getTime(); t += intervalMs) {
    // Nearest marine point within 90 minutes.
    let nearest: MarinePoint | null = null;
    let bestDiff = Infinity;
    for (const p of flowPoints) {
      const d = Math.abs(p.time.getTime() - t);
      if (d < bestDiff) { bestDiff = d; nearest = p; }
    }
    if (!nearest || bestDiff > 90 * 60 * 1000) continue;
    if (nearest.currentDirection == null || nearest.currentVelocity == null) continue;

    const h = interpolateTideHeightAt(heights, t);
    if (h == null) continue;

    const cx = xAxis.scale(t);
    const cy = yAxis.scale(h);
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;

    const knots = nearest.currentVelocity * KMH_TO_KNOTS_CHART;
    const dir = nearest.currentDirection;
    // Size arrow by velocity: 0.1kt -> 10px, 1kt+ -> 18px.
    const len = Math.min(18, 10 + Math.min(knots, 1) * 8);

    nodes.push(
      <g key={t} transform={`translate(${cx}, ${cy}) rotate(${dir})`}>
        <circle r={9} fill="var(--background)" stroke="var(--primary)" strokeOpacity={0.4} strokeWidth={1} />
        <path
          d={`M 0 ${len / 2} L 0 ${-len / 2} M -3 ${-len / 2 + 4} L 0 ${-len / 2} L 3 ${-len / 2 + 4}`}
          stroke="var(--primary)"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </g>
    );
  }

  return <g>{nodes}</g>;
}

export function TideChartInner({ tideData, windowStart, windowEnd, tickIntervalHours = 3, startRefLine, nowRefLine, height = 176, flowPoints, arrowIntervalHours = 3 }: TideChartInnerProps) {
  const data = tideData.heights
    .filter(h => h.time >= windowStart && h.time <= windowEnd)
    .map(h => ({ t: h.time.getTime(), height: Math.round(h.height * 100) / 100 }));

  const flowInWindow = flowPoints
    ? flowPoints.filter(p => p.time >= windowStart && p.time <= windowEnd)
    : [];

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
              <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.25} />
              <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.02} />
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
          <Area type="monotone" dataKey="height" stroke="var(--primary)" fill="url(#tideAreaGrad)" strokeWidth={2} dot={false} />
          {flowInWindow.length > 0 && (
            <Customized
              component={(ctx: unknown) => (
                <FlowArrows
                  flowPoints={flowInWindow}
                  arrowIntervalHours={arrowIntervalHours}
                  heights={tideData.heights}
                  windowStart={windowStart}
                  windowEnd={windowEnd}
                  {...(ctx as { xAxisMap?: Record<string, { scale: (v: number) => number }>; yAxisMap?: Record<string, { scale: (v: number) => number }> })}
                />
              )}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
