import { useMemo, useState, useRef, useEffect } from 'react';
import type {
  HourlyForecast, LiveWind, LiveWindHistoryPoint, WindForecastPoint,
  TideData, SunInfo, TideHeight, TideExtreme,
} from '@/lib/api';
import type { Tab } from '@/App';
import { RACE_CALENDAR, getEventCategory, type RaceEvent } from '@/lib/calendar';
import { convertWind, windUnitLabel, degreesToCardinal, beaufortScale, beaufortColor, msToKnots, MS_TO_KNOTS } from '@/lib/units';
import {
  buildForecastSeries, buildObservedSeries, buildWindChartRows, buildMultiWindChartRows, bucket10,
  type WindChartRow,
  type ForecastChartInput,
} from '@/lib/windChartData';
import { getWeatherInfo, getWeatherIconColor } from '@/lib/weatherCodes';
import { haptic } from '@/lib/haptics';
import { useNow } from '@/lib/useNow';
import { format, isSameDay, startOfDay, addDays, differenceInMinutes, subHours, addHours } from 'date-fns';
import { ChevronRight, Wind as WindIcon, Waves, CalendarDays, Anchor } from 'lucide-react';
import {
  ComposedChart, Line, Area, XAxis, YAxis, ReferenceLine, ReferenceDot,
  ResponsiveContainer,
} from 'recharts';

interface HomePageProps {
  forecasts: HourlyForecast[];
  forecastHistory: WindForecastPoint[];
  comparisonForecasts?: ForecastChartInput[];
  liveWind: LiveWind | null;
  liveWindHistory: LiveWindHistoryPoint[];
  tideData: TideData | null;
  sunInfo: SunInfo | null;
  onNavigate: (tab: Tab) => void;
}

const WIND_AVG = 'var(--chart-avg)';
const WIND_GUST = 'var(--chart-gust)';
const TIDE_COLOR = 'var(--primary)';
const FORECAST_DASH = '5 4';

function Card({ children, onClick, label }: { children: React.ReactNode; onClick?: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick ? () => { haptic('light'); onClick(); } : undefined}
      aria-label={label}
      className="w-full text-left rounded-2xl bg-card border border-border/60 px-4 py-3 transition-colors active:bg-muted/40 hover:border-border"
    >
      {children}
    </button>
  );
}

function CardHeader({
  icon: Icon, title, primary, secondary,
}: { icon: React.ElementType; title: string; primary?: React.ReactNode; secondary?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 mb-1">
      <div className="flex items-center gap-1.5 text-muted-foreground shrink-0">
        <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
        <span className="text-[11px] uppercase tracking-wider font-semibold">{title}</span>
      </div>
      <div className="flex items-baseline gap-2 min-w-0">
        {primary && <span className="font-display text-lg font-semibold tabular-nums tracking-tight truncate">{primary}</span>}
        {secondary && <span className="text-muted-foreground text-xs truncate">{secondary}</span>}
        <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
      </div>
    </div>
  );
}

function SunSummary({ forecasts, sunInfo }: { forecasts: HourlyForecast[]; sunInfo: SunInfo | null }) {
  const nowMs = useNow(60_000);
  const now = new Date(nowMs);

  // Pick forecast nearest the current hour for the live conditions chip.
  const target = useMemo(() => {
    if (!forecasts.length) return null;
    return forecasts.reduce((best, f) =>
      Math.abs(f.time.getTime() - now.getTime()) < Math.abs(best.time.getTime() - now.getTime()) ? f : best,
    forecasts[0]);
  }, [forecasts, now]);

  if (!target) return null;
  const wi = getWeatherInfo(target.significantWeatherCode);
  const Icon = wi.Icon;
  const sunLine = sunInfo
    ? now < sunInfo.sunrise
      ? `Sunrise ${format(sunInfo.sunrise, 'HH:mm')}`
      : now < sunInfo.sunset
        ? `Sunset ${format(sunInfo.sunset, 'HH:mm')}`
        : `Set ${format(sunInfo.sunset, 'HH:mm')}`
    : null;

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-card border border-border/60 px-4 py-3">
      <Icon className="h-10 w-10 shrink-0" strokeWidth={1.5} aria-hidden style={{ color: getWeatherIconColor(target.significantWeatherCode) }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-display text-2xl font-semibold tabular-nums tracking-tight">{Math.round(target.screenTemperature)}°</span>
          <span className="text-sm text-foreground/80 truncate">{wi.description}</span>
        </div>
        {sunLine && <p className="text-muted-foreground text-xs mt-0.5">{sunLine}</p>}
      </div>
    </div>
  );
}

// --- Wind: forecast vs observed mini chart ----------------------------------

function WindMiniChart({
  forecasts, forecastHistory, comparisonForecasts, liveWindHistory, onActiveRow,
}: {
  forecasts: HourlyForecast[];
  forecastHistory: WindForecastPoint[];
  comparisonForecasts?: ForecastChartInput[];
  liveWindHistory: LiveWindHistoryPoint[];
  onActiveRow?: (row: WindChartRow | null) => void;
}) {
  const { rows, xMin, xMax, hasObs, nowAvg } = useMemo(() => {
    const now = Date.now();
    const xMin = bucket10(subHours(now, 6).getTime());
    const xMax = bucket10(addHours(now, 6).getTime());
    const fSeries = buildForecastSeries(forecastHistory, forecasts);
    const oSeries = buildObservedSeries(liveWindHistory);
    const comparison = comparisonForecasts?.filter(source => source.series.length > 0) ?? [];
    const rows = comparison.length > 1
      ? buildMultiWindChartRows(comparison, oSeries, xMin, xMax)
      : buildWindChartRows(fSeries, oSeries, xMin, xMax);
    const latestObs = [...rows].reverse().find(r => r.oAvg != null);
    return { rows, xMin, xMax, hasObs: oSeries.length > 0, nowAvg: latestObs ?? null };
  }, [forecasts, forecastHistory, comparisonForecasts, liveWindHistory]);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef<WindChartRow[]>(rows);
  rowsRef.current = rows;

  const pickFromClientX = (clientX: number) => {
    const el = wrapperRef.current;
    const rs = rowsRef.current;
    if (!el || !rs.length || !onActiveRow) return;
    const rect = el.getBoundingClientRect();
    const w = Math.max(1, rect.right - rect.left);
    const x = Math.min(rect.right, Math.max(rect.left, clientX)) - rect.left;
    const minT = rs[0].t;
    const maxT = rs[rs.length - 1].t;
    const t = minT + (x / w) * (maxT - minT);
    let best = rs[0];
    let bestDelta = Math.abs(best.t - t);
    for (let i = 1; i < rs.length; i++) {
      const d = Math.abs(rs[i].t - t);
      if (d < bestDelta) { best = rs[i]; bestDelta = d; }
    }
    onActiveRow(best);
  };

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || !onActiveRow) return;
    const onTouchStart = (e: TouchEvent) => {
      if (!e.touches[0]) return;
      e.stopPropagation();
      e.preventDefault();
      pickFromClientX(e.touches[0].clientX);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!e.touches[0]) return;
      e.stopPropagation();
      e.preventDefault();
      pickFromClientX(e.touches[0].clientX);
    };
    const onTouchEnd = () => onActiveRow(null);
    el.addEventListener('touchstart', onTouchStart, { passive: false, capture: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
    el.addEventListener('touchend', onTouchEnd, { capture: true });
    el.addEventListener('touchcancel', onTouchEnd, { capture: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart, { capture: true } as EventListenerOptions);
      el.removeEventListener('touchmove', onTouchMove, { capture: true } as EventListenerOptions);
      el.removeEventListener('touchend', onTouchEnd, { capture: true } as EventListenerOptions);
      el.removeEventListener('touchcancel', onTouchEnd, { capture: true } as EventListenerOptions);
    };
    // pickFromClientX is closure-stable via refs; only rebind if callback identity changes.
  }, [onActiveRow]);

  if (!rows.length) return <div className="h-24" />;
  const now = Date.now();

  return (
    <div
      ref={wrapperRef}
      className="h-24 -mx-2 cursor-crosshair"
      style={{ touchAction: 'none' }}
      onMouseMove={(e) => pickFromClientX(e.clientX)}
      onMouseLeave={() => onActiveRow?.(null)}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
          <XAxis dataKey="t" type="number" domain={[xMin, xMax]} hide />
          <YAxis hide domain={[0, 'dataMax + 1']} />
          {now >= xMin && now <= xMax && (
            <ReferenceLine x={now} stroke="var(--primary)" strokeOpacity={0.4} strokeDasharray="3 3" strokeWidth={1} />
          )}
          {comparisonForecasts && comparisonForecasts.filter(source => source.series.length > 0).length > 1
            ? comparisonForecasts.flatMap(source => [
                <Line key={`${source.id}-gust`} type="monotone" dataKey={`${source.id}Gust`} stroke={source.color} strokeOpacity={0.55} strokeWidth={1.25} strokeDasharray={FORECAST_DASH} dot={false} isAnimationActive={false} connectNulls />,
                <Line key={`${source.id}-avg`} type="monotone" dataKey={`${source.id}Avg`} stroke={source.color} strokeWidth={1.75} dot={false} isAnimationActive={false} connectNulls />,
              ])
            : <>
          <Line
            type="monotone"
            dataKey="fGust"
            stroke={WIND_GUST}
            strokeWidth={1.5}
            strokeDasharray={FORECAST_DASH}
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="fAvg"
            stroke={WIND_AVG}
            strokeWidth={1.75}
            strokeDasharray={FORECAST_DASH}
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
          </>}
          {hasObs && (
            <>
              <Line
                type="monotone"
                dataKey="oGust"
                stroke={WIND_GUST}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="oAvg"
                stroke={WIND_AVG}
                strokeWidth={2.25}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            </>
          )}
          {nowAvg && nowAvg.oAvg != null && (
            <>
              <ReferenceDot x={nowAvg.t} y={nowAvg.oAvg} r={6} fill={WIND_AVG} fillOpacity={0.18} stroke="none" />
              <ReferenceDot x={nowAvg.t} y={nowAvg.oAvg} r={3.5} fill={WIND_AVG} stroke="var(--card)" strokeWidth={2} />
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function WindCardHome({
  forecasts, forecastHistory, comparisonForecasts, liveWind, liveWindHistory, onNavigate,
}: {
  forecasts: HourlyForecast[];
  forecastHistory: WindForecastPoint[];
  comparisonForecasts?: ForecastChartInput[];
  liveWind: LiveWind | null;
  liveWindHistory: LiveWindHistoryPoint[];
  onNavigate: (tab: Tab) => void;
}) {
  const [activeRow, setActiveRow] = useState<WindChartRow | null>(null);

  if (!forecasts.length && !liveWind) return null;
  const unit = windUnitLabel();

  // Live (latest) readout — defaults shown when not scrubbing the chart.
  const liveSpeed = liveWind ? convertWind(liveWind.windSpeedMs) : null;
  const dir = liveWind?.windDirectionDeg ?? null;
  const latestGustMs = liveWindHistory.length
    ? Math.max(...liveWindHistory.map(p => p.gustWindMs))
    : null;
  const liveGust = latestGustMs != null ? convertWind(latestGustMs) : null;

  // Forecast at "now" for delta in the default state.
  const fcNow = forecasts.find(f => f.time.getTime() >= Date.now() - 30 * 60 * 1000) ?? forecasts[0];
  const fcSpeed = fcNow ? convertWind(fcNow.windSpeed10m) : null;
  const fcGust = fcNow ? convertWind(fcNow.windGustSpeed10m) : null;
  const avgDelta = liveSpeed != null && fcSpeed != null ? Math.round(liveSpeed) - Math.round(fcSpeed) : null;
  const gustDelta = liveGust != null && fcGust != null ? Math.round(liveGust) - Math.round(fcGust) : null;
  const showAvgDelta = avgDelta != null && Math.abs(avgDelta) >= 2;
  const showGustDelta = gustDelta != null && Math.abs(gustDelta) >= 2;

  // Hovered values from the chart take precedence. Each row holds avg/gust for
  // both forecast and observed series — prefer observed when present so live
  // history doesn't get masked by a coincident forecast value.
  const hovered = activeRow != null;
  const hoveredAvg = activeRow ? (activeRow.oAvg ?? activeRow.fAvg) : null;
  const hoveredGust = activeRow ? (activeRow.oGust ?? activeRow.fGust) : null;
  const hoveredIsLive = activeRow != null && activeRow.oAvg != null;
  // `windChartData` rows store values in knots; round-trip to m/s then to the user's unit.
  const hoveredAvgDisp = hoveredAvg != null ? convertWind(hoveredAvg / MS_TO_KNOTS) : null;
  const hoveredGustDisp = hoveredGust != null ? convertWind(hoveredGust / MS_TO_KNOTS) : null;

  const displayAvg = hovered ? hoveredAvgDisp : liveSpeed;
  const displayGust = hovered ? hoveredGustDisp : liveGust;

  return (
    <div className="rounded-2xl bg-card border border-border/60 transition-colors hover:border-border">
      <button
        type="button"
        onClick={() => { haptic('light'); onNavigate('wind'); }}
        aria-label="Open wind details"
        className="w-full text-left px-4 pt-3 pb-1 rounded-t-2xl active:bg-muted/40"
      >
        <CardHeader
          icon={WindIcon}
          title="Wind"
          primary={
            displayAvg != null
              ? (
                <>
                  {Math.round(displayAvg)}
                  {displayGust != null && (
                    <span className="text-[var(--chart-gust)] ml-1">/ {Math.round(displayGust)}</span>
                  )}
                  <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>
                </>
              )
              : '—'
          }
          secondary={
            hovered ? (
              <span className="text-muted-foreground">
                {format(new Date(activeRow!.t), 'HH:mm')} · {hoveredIsLive ? 'live' : 'fcst'}
              </span>
            ) : (
              <>
                {dir != null ? degreesToCardinal(dir) : ''}
                {(showAvgDelta || showGustDelta) && (
                  <span className="ml-2">
                    {showAvgDelta && (
                      <span className={avgDelta! > 0 ? 'text-[var(--warn)]' : 'text-muted-foreground'}>
                        {avgDelta! > 0 ? '+' : ''}{avgDelta}
                      </span>
                    )}
                    {showAvgDelta && showGustDelta && <span className="text-muted-foreground/60"> / </span>}
                    {showGustDelta && (
                      <span className={gustDelta! > 0 ? 'text-[var(--warn)]' : 'text-muted-foreground'}>
                        {gustDelta! > 0 ? '+' : ''}{gustDelta}
                      </span>
                    )}
                    <span className="text-muted-foreground/70"> vs fcst</span>
                  </span>
                )}
              </>
            )
          }
        />
      </button>
      <div className="px-4 pb-3">
        <WindMiniChart
          forecasts={forecasts}
          forecastHistory={forecastHistory}
          comparisonForecasts={comparisonForecasts}
          liveWindHistory={liveWindHistory}
          onActiveRow={setActiveRow}
        />
      </div>
    </div>
  );
}

// --- Tides: 24h curve with now marker and HW/LW dots ------------------------

type TideRow = { t: number; h: number };

function TideMiniChart({
  tideData, onActiveRow,
}: { tideData: TideData; onActiveRow?: (row: TideRow | null) => void }) {
  const { rows, xMin, xMax, hwDots, lwDots, nowPoint } = useMemo(() => {
    const now = Date.now();
    // Snap to today's natural day so the chart represents "today's tide picture"
    // rather than a sliding ±12h window that happens to start on whatever
    // extreme it lands on.
    const xMin = startOfDay(new Date(now)).getTime();
    const xMax = startOfDay(addDays(new Date(now), 1)).getTime();
    const realRows = tideData.heights
      .filter((h: TideHeight) => h.time.getTime() >= xMin && h.time.getTime() <= xMax)
      .map((h: TideHeight) => ({ t: h.time.getTime(), h: h.height }));

    // Defensive backfill: if heights don't cover the start of the window
    // (UKHO truncated, stale cache, or interpolation fallback), synthesize
    // samples back to xMin using a half-period mirror of the next extreme.
    const rows = [...realRows];
    if (rows.length && rows[0].t > xMin && tideData.extremes.length >= 2) {
      const sortedExtremes = [...tideData.extremes].sort((a, b) => a.time.getTime() - b.time.getTime());
      const e0 = sortedExtremes.find(e => e.time.getTime() >= rows[0].t - 10 * 60 * 1000) ?? sortedExtremes[0];
      const e1 = sortedExtremes.find(e => e.time.getTime() > e0.time.getTime());
      if (e1) {
        const halfPeriod = e1.time.getTime() - e0.time.getTime();
        const priorT = e0.time.getTime() - halfPeriod;
        const priorH = e1.height; // opposite extreme type → mirror amplitude
        const synth: { t: number; h: number }[] = [];
        for (let t = xMin; t < rows[0].t; t += 10 * 60 * 1000) {
          if (t < priorT) {
            synth.push({ t, h: priorH });
          } else {
            const r = (t - priorT) / (e0.time.getTime() - priorT);
            synth.push({ t, h: priorH + (e0.height - priorH) * (1 - Math.cos(r * Math.PI)) / 2 });
          }
        }
        rows.unshift(...synth);
      }
    }
    const inWindow = (e: TideExtreme) => e.time.getTime() >= xMin && e.time.getTime() <= xMax;
    const hwDots = tideData.extremes.filter(e => e.type === 'High' && inWindow(e));
    const lwDots = tideData.extremes.filter(e => e.type === 'Low' && inWindow(e));
    // Linear-interp current height between the two surrounding samples so the
    // "now" dot sits exactly on the curve rather than at the nearest sample.
    let nowPoint: { t: number; h: number } | null = null;
    if (rows.length >= 2) {
      const idx = rows.findIndex(r => r.t >= now);
      if (idx > 0) {
        const a = rows[idx - 1];
        const b = rows[idx];
        const r = (now - a.t) / (b.t - a.t);
        nowPoint = { t: now, h: a.h + (b.h - a.h) * r };
      }
    }
    return { rows, xMin, xMax, hwDots, lwDots, nowPoint };
  }, [tideData]);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef<TideRow[]>(rows);
  rowsRef.current = rows;

  const pickFromClientX = (clientX: number) => {
    const el = wrapperRef.current;
    const rs = rowsRef.current;
    if (!el || !rs.length || !onActiveRow) return;
    const rect = el.getBoundingClientRect();
    const w = Math.max(1, rect.right - rect.left);
    const x = Math.min(rect.right, Math.max(rect.left, clientX)) - rect.left;
    const minT = rs[0].t;
    const maxT = rs[rs.length - 1].t;
    const t = minT + (x / w) * (maxT - minT);
    let best = rs[0];
    let bestDelta = Math.abs(best.t - t);
    for (let i = 1; i < rs.length; i++) {
      const d = Math.abs(rs[i].t - t);
      if (d < bestDelta) { best = rs[i]; bestDelta = d; }
    }
    onActiveRow(best);
  };

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || !onActiveRow) return;
    const onTouchStart = (e: TouchEvent) => {
      if (!e.touches[0]) return;
      e.stopPropagation();
      e.preventDefault();
      pickFromClientX(e.touches[0].clientX);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!e.touches[0]) return;
      e.stopPropagation();
      e.preventDefault();
      pickFromClientX(e.touches[0].clientX);
    };
    const onTouchEnd = () => onActiveRow(null);
    el.addEventListener('touchstart', onTouchStart, { passive: false, capture: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
    el.addEventListener('touchend', onTouchEnd, { capture: true });
    el.addEventListener('touchcancel', onTouchEnd, { capture: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart, { capture: true } as EventListenerOptions);
      el.removeEventListener('touchmove', onTouchMove, { capture: true } as EventListenerOptions);
      el.removeEventListener('touchend', onTouchEnd, { capture: true } as EventListenerOptions);
      el.removeEventListener('touchcancel', onTouchEnd, { capture: true } as EventListenerOptions);
    };
  }, [onActiveRow]);

  if (rows.length < 2) return <div className="h-20" />;

  return (
    <div
      ref={wrapperRef}
      className="h-20 -mx-2 cursor-crosshair"
      style={{ touchAction: 'none' }}
      onMouseMove={(e) => pickFromClientX(e.clientX)}
      onMouseLeave={() => onActiveRow?.(null)}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 12, right: 24, left: 8, bottom: 4 }}>
          <defs>
            <linearGradient id="tideHomeFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={TIDE_COLOR} stopOpacity={0.25} />
              <stop offset="100%" stopColor={TIDE_COLOR} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis dataKey="t" type="number" domain={[xMin, xMax]} hide />
          <YAxis hide domain={['dataMin - 0.3', 'dataMax + 0.3']} />
          {[6, 12, 18].map(h => {
            const t = xMin + h * 60 * 60 * 1000;
            return (
              <ReferenceLine
                key={`hr-${h}`}
                x={t}
                stroke="var(--border)"
                strokeOpacity={0.5}
                strokeWidth={1}
                label={{ value: `${h.toString().padStart(2, '0')}`, position: 'insideBottom', offset: 2, fontSize: 9, fill: 'var(--muted-foreground)', opacity: 0.6 }}
              />
            );
          })}
          <Area
            type="monotone"
            dataKey="h"
            stroke={TIDE_COLOR}
            strokeWidth={2}
            fill="url(#tideHomeFill)"
            isAnimationActive={false}
          />
          {nowPoint && (
            <>
              <ReferenceDot
                x={nowPoint.t}
                y={nowPoint.h}
                r={7}
                fill={TIDE_COLOR}
                fillOpacity={0.18}
                stroke="none"
              />
              <ReferenceDot
                x={nowPoint.t}
                y={nowPoint.h}
                r={4}
                fill={TIDE_COLOR}
                stroke="var(--card)"
                strokeWidth={2}
              />
            </>
          )}
          {hwDots.map(d => (
            <ReferenceDot
              key={`hw-${d.time.getTime()}`}
              x={d.time.getTime()}
              y={d.height}
              r={3}
              fill={TIDE_COLOR}
              stroke="var(--card)"
              strokeWidth={1.5}
              label={{ value: format(d.time, 'HH:mm'), position: 'top', fontSize: 10, fill: 'var(--muted-foreground)' }}
            />
          ))}
          {lwDots.map(d => (
            <ReferenceDot
              key={`lw-${d.time.getTime()}`}
              x={d.time.getTime()}
              y={d.height}
              r={3}
              fill="var(--card)"
              stroke={TIDE_COLOR}
              strokeWidth={1.5}
              label={{ value: format(d.time, 'HH:mm'), position: 'bottom', fontSize: 10, fill: 'var(--muted-foreground)' }}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function TidesCardHome({ tideData, onNavigate }: { tideData: TideData | null; onNavigate: (tab: Tab) => void }) {
  const [activeRow, setActiveRow] = useState<TideRow | null>(null);
  if (!tideData) return null;
  const now = Date.now();
  const nextExtreme = tideData.extremes.find(e => e.time.getTime() > now);
  const currentHeight = tideData.heights.reduce<TideHeight | null>((best, h) => {
    if (!best) return h;
    return Math.abs(h.time.getTime() - now) < Math.abs(best.time.getTime() - now) ? h : best;
  }, null);

  let defaultSecondary: React.ReactNode = null;
  if (nextExtreme) {
    const mins = differenceInMinutes(nextExtreme.time, new Date(now));
    const hh = Math.floor(mins / 60);
    const countdown = hh > 0 ? `${hh}h ${mins % 60}m` : `${mins}m`;
    defaultSecondary = <>{nextExtreme.type === 'High' ? 'HW' : 'LW'} in {countdown}</>;
  }

  const hovered = activeRow != null;
  const displayHeight = hovered ? activeRow!.h : currentHeight?.height ?? null;
  // Rising or falling, based on the nearest pair of samples in tideData.heights.
  const trend = (() => {
    const t = hovered ? activeRow!.t : now;
    const heights = tideData.heights;
    if (heights.length < 2) return null;
    const idx = heights.findIndex(h => h.time.getTime() >= t);
    if (idx <= 0) return null;
    return heights[idx].height > heights[idx - 1].height ? 'rising' : 'falling';
  })();

  return (
    <div className="rounded-2xl bg-card border border-border/60 transition-colors hover:border-border">
      <button
        type="button"
        onClick={() => { haptic('light'); onNavigate('tides'); }}
        aria-label="Open tides"
        className="w-full text-left px-4 pt-3 pb-1 rounded-t-2xl active:bg-muted/40"
      >
        <CardHeader
          icon={Waves}
          title="Tides"
          primary={displayHeight != null
            ? <>{displayHeight.toFixed(1)} <span className="text-sm font-normal text-muted-foreground">m</span></>
            : '—'}
          secondary={
            hovered ? (
              <span className="text-muted-foreground">
                {format(new Date(activeRow!.t), 'HH:mm')}
                {trend ? <> · {trend}</> : null}
              </span>
            ) : defaultSecondary
          }
        />
      </button>
      <div className="px-4 pb-3">
        <TideMiniChart tideData={tideData} onActiveRow={setActiveRow} />
      </div>
    </div>
  );
}

// --- Next race --------------------------------------------------------------

function findNextRace(): RaceEvent | null {
  const now = new Date();
  const candidates = RACE_CALENDAR
    .filter(e => e.time && getEventCategory(e) !== 'briefing' && getEventCategory(e) !== 'social')
    .map(e => {
      const [y, m, d] = e.date.split('-').map(Number);
      const [hh, mm] = (e.time as string).split(':').map(Number);
      return { event: e, when: new Date(y, m - 1, d, hh, mm) };
    })
    .filter(x => x.when.getTime() > now.getTime() - 30 * 60 * 1000)
    .sort((a, b) => a.when.getTime() - b.when.getTime());
  return candidates[0]?.event ?? null;
}

function formatCountdown(target: Date, now: Date): string {
  const ms = target.getTime() - now.getTime();
  if (ms < 0) return 'now';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `in ${h}h` : `in ${h}h ${m}m`;
  }
  const days = Math.round(hours / 24);
  return days === 1 ? 'tomorrow' : `in ${days} days`;
}

function NextRaceCardHome({
  forecasts, tideData, onNavigate,
}: { forecasts: HourlyForecast[]; tideData: TideData | null; onNavigate: (tab: Tab) => void }) {
  const race = useMemo(findNextRace, []);
  if (!race) return null;

  const [y, m, d] = race.date.split('-').map(Number);
  const [hh, mm] = (race.time as string).split(':').map(Number);
  const when = new Date(y, m - 1, d, hh, mm);
  const now = new Date();
  // Out-of-season: nothing to act on if the next race is further than ~2 weeks out.
  if (when.getTime() - now.getTime() > 14 * 24 * 60 * 60 * 1000) return null;

  const fc = forecasts.reduce<HourlyForecast | null>((best, f) => {
    if (!best) return f;
    return Math.abs(f.time.getTime() - when.getTime()) < Math.abs(best.time.getTime() - when.getTime()) ? f : best;
  }, null);

  const tide = tideData?.extremes
    .filter(e => Math.abs(e.time.getTime() - when.getTime()) <= 6 * 60 * 60 * 1000)
    .sort((a, b) => Math.abs(a.time.getTime() - when.getTime()) - Math.abs(b.time.getTime() - when.getTime()))[0];

  const unit = windUnitLabel();
  const tideLabel = tide ? `${tide.type === 'High' ? 'HW' : 'LW'} ${format(tide.time, 'HH:mm')}` : null;
  const bf = fc ? beaufortScale(msToKnots(fc.windSpeed10m)) : null;
  const bfTextColor = bf ? beaufortColor(bf.force) : '';

  const sameWeek = when.getTime() - now.getTime() < 7 * 24 * 60 * 60 * 1000;
  const dateLabel = sameWeek
    ? isSameDay(when, now)
      ? 'Today'
      : isSameDay(when, addDays(startOfDay(now), 1))
        ? 'Tomorrow'
        : format(when, 'EEEE')
    : format(when, 'EEE d MMM');

  return (
    <Card onClick={() => onNavigate('events')} label="Open race calendar">
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Anchor className="h-3.5 w-3.5" strokeWidth={2.25} />
          <span className="text-[11px] uppercase tracking-wider font-semibold">Next race</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="font-display text-sm font-semibold tracking-tight">{formatCountdown(when, now)}</span>
          <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
        </div>
      </div>
      <p className="font-medium leading-snug">{race.name}</p>
      <p className="text-muted-foreground text-xs mt-0.5">
        {dateLabel} · {race.time}
        {race.classes ? <> · <span className="text-muted-foreground/70">{race.classes}</span></> : null}
      </p>
      {(fc || tideLabel) && (
        <div className="flex items-center gap-2 mt-2 text-xs">
          {fc && (
            <span className="inline-flex items-center gap-1">
              <svg viewBox="0 0 12 12" className="h-3 w-3 text-muted-foreground" style={{ transform: `rotate(${fc.windDirectionFrom10m + 180}deg)` }} aria-hidden>
                <path d="M6 1 L6 11 M6 11 L3 8 M6 11 L9 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
              </svg>
              <span className={`tabular-nums font-medium ${bfTextColor}`}>{Math.round(convertWind(fc.windSpeed10m))}</span>
              <span className="text-muted-foreground">{unit} {degreesToCardinal(fc.windDirectionFrom10m)}</span>
              {bf && bf.force >= 6 && (
                <span className={`text-[10px] uppercase tracking-wider ${bfTextColor}`}>F{bf.force}</span>
              )}
            </span>
          )}
          {tideLabel && (
            <span className="text-muted-foreground inline-flex items-center gap-1">
              <Waves className="h-3 w-3" /> {tideLabel}
            </span>
          )}
        </div>
      )}
    </Card>
  );
}

// --- 7-day ------------------------------------------------------------------

function WeekDayWindArrow({ deg }: { deg: number }) {
  // Wind direction is "from" — arrow points where wind is going.
  return (
    <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 text-muted-foreground" style={{ transform: `rotate(${deg + 180}deg)` }} aria-hidden>
      <path d="M6 1 L6 11 M6 11 L3 8 M6 11 L9 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function WeekCardHome({ forecasts, onNavigate }: { forecasts: HourlyForecast[]; onNavigate: (tab: Tab) => void }) {
  const days = useMemo(() => {
    const start = startOfDay(new Date());
    type Day = {
      date: Date; code: number;
      windMax: number; windDir: number;
      tempMax: number; tempMin: number;
      rainProb: number;
    };
    const out: Day[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      const same = forecasts.filter(f => isSameDay(f.time, d));
      if (same.length === 0) continue;
      const midday = same.find(f => f.time.getHours() === 12) ?? same[Math.floor(same.length / 2)];
      const peakWind = same.reduce((p, f) => f.windSpeed10m > p.windSpeed10m ? f : p, same[0]);
      out.push({
        date: d,
        code: midday.significantWeatherCode,
        windMax: peakWind.windSpeed10m,
        windDir: peakWind.windDirectionFrom10m,
        tempMax: Math.max(...same.map(f => f.screenTemperature)),
        tempMin: Math.min(...same.map(f => f.screenTemperature)),
        rainProb: Math.max(...same.map(f => f.probOfPrecipitation)),
      });
    }
    return out;
  }, [forecasts]);

  if (days.length === 0) return null;
  const unit = windUnitLabel();
  const peak = Math.max(...days.map(d => convertWind(d.windMax)));

  return (
    <Card onClick={() => onNavigate('forecast')} label="Open 7-day forecast">
      <CardHeader icon={CalendarDays} title="7-day" secondary={`peak ${Math.round(peak)} ${unit}`} />
      <div className="grid grid-cols-7 gap-1 mt-1">
        {days.map((d, i) => {
          const wi = getWeatherInfo(d.code);
          const Icon = wi.Icon;
          const showRain = d.rainProb >= 40;
          return (
            <div key={i} className="flex flex-col items-center gap-0.5 py-0.5">
              <span className="text-[10px] text-muted-foreground font-medium">
                {i === 0 ? 'Today' : format(d.date, 'EEE')}
              </span>
              <Icon className="h-5 w-5" strokeWidth={1.75} style={{ color: getWeatherIconColor(d.code) }} aria-hidden />
              <div className="flex items-baseline gap-0.5 leading-none">
                <span className="text-[11px] tabular-nums font-semibold">{Math.round(d.tempMax)}°</span>
                <span className="text-[9px] tabular-nums text-muted-foreground/70">{Math.round(d.tempMin)}°</span>
              </div>
              <div className="flex items-center gap-0.5">
                <WeekDayWindArrow deg={d.windDir} />
                <span className="text-[10px] tabular-nums text-muted-foreground">{Math.round(convertWind(d.windMax))}</span>
              </div>
              <span className={`text-[9px] tabular-nums leading-none h-2.5 ${showRain ? 'text-[var(--chart-avg)]' : 'opacity-0'}`}>
                {showRain ? `${Math.round(d.rainProb)}%` : '·'}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default function HomePage({
  forecasts, forecastHistory, comparisonForecasts, liveWind, liveWindHistory, tideData, sunInfo, onNavigate,
}: HomePageProps) {
  return (
    <div className="space-y-3 page-enter">
      <SunSummary forecasts={forecasts} sunInfo={sunInfo} />
      <WindCardHome
        forecasts={forecasts}
        forecastHistory={forecastHistory}
        comparisonForecasts={comparisonForecasts}
        liveWind={liveWind}
        liveWindHistory={liveWindHistory}
        onNavigate={onNavigate}
      />
      <TidesCardHome tideData={tideData} onNavigate={onNavigate} />
      <NextRaceCardHome forecasts={forecasts} tideData={tideData} onNavigate={onNavigate} />
      <WeekCardHome forecasts={forecasts} onNavigate={onNavigate} />
    </div>
  );
}
