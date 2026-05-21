import { useMemo } from 'react';
import type {
  HourlyForecast, LiveWind, LiveWindHistoryPoint, WindForecastPoint,
  TideData, SunInfo, TideHeight, TideExtreme,
} from '@/lib/api';
import type { Tab } from '@/App';
import { RACE_CALENDAR, getEventCategory, type RaceEvent } from '@/lib/calendar';
import { convertWind, windUnitLabel, degreesToCardinal } from '@/lib/units';
import {
  buildForecastSeries, buildObservedSeries, buildWindChartRows, bucket10,
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
    <div className="flex items-center gap-3 px-1 pt-1">
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
  forecasts, forecastHistory, liveWindHistory,
}: { forecasts: HourlyForecast[]; forecastHistory: WindForecastPoint[]; liveWindHistory: LiveWindHistoryPoint[] }) {
  const { rows, xMin, xMax, hasObs } = useMemo(() => {
    const now = Date.now();
    const xMin = bucket10(subHours(now, 6).getTime());
    const xMax = bucket10(addHours(now, 6).getTime());
    const fSeries = buildForecastSeries(forecastHistory, forecasts);
    const oSeries = buildObservedSeries(liveWindHistory);
    const rows = buildWindChartRows(fSeries, oSeries, xMin, xMax);
    return { rows, xMin, xMax, hasObs: oSeries.length > 0 };
  }, [forecasts, forecastHistory, liveWindHistory]);

  if (!rows.length) return <div className="h-20" />;
  const now = Date.now();

  return (
    <div className="h-20 -mx-2">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
          <XAxis dataKey="t" type="number" domain={[xMin, xMax]} hide />
          <YAxis hide domain={['dataMin - 1', 'dataMax + 1']} />
          {now >= xMin && now <= xMax && (
            <ReferenceLine x={now} stroke="var(--border)" strokeWidth={1} />
          )}
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
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function WindCardHome({
  forecasts, forecastHistory, liveWind, liveWindHistory, onNavigate,
}: {
  forecasts: HourlyForecast[];
  forecastHistory: WindForecastPoint[];
  liveWind: LiveWind | null;
  liveWindHistory: LiveWindHistoryPoint[];
  onNavigate: (tab: Tab) => void;
}) {
  if (!forecasts.length && !liveWind) return null;
  const unit = windUnitLabel();

  const speed = liveWind ? convertWind(liveWind.windSpeedMs) : null;
  const dir = liveWind?.windDirectionDeg ?? null;
  // Peak gust over the live history window (matches WindCard's "Max gust" semantic).
  const latestGust = liveWindHistory.length
    ? Math.max(...liveWindHistory.map(p => p.gustWindMs))
    : null;
  const gust = latestGust != null ? convertWind(latestGust) : null;

  // Forecast value at current hour for the "vs" delta.
  const fcNow = forecasts.find(f => f.time.getTime() >= Date.now() - 30 * 60 * 1000) ?? forecasts[0];
  const fcSpeed = fcNow ? convertWind(fcNow.windSpeed10m) : null;
  const delta = speed != null && fcSpeed != null ? Math.round(speed) - Math.round(fcSpeed) : null;

  return (
    <Card onClick={() => onNavigate('wind')} label="Open wind details">
      <CardHeader
        icon={WindIcon}
        title="Wind"
        primary={
          speed != null
            ? (
              <>
                {Math.round(speed)}
                {gust != null && (
                  <span className="text-[var(--chart-gust)] ml-1">/ {Math.round(gust)}</span>
                )}
                <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>
              </>
            )
            : '—'
        }
        secondary={
          <>
            {dir != null ? degreesToCardinal(dir) : ''}
            {delta != null && delta !== 0 && (
              <span className={`ml-2 ${delta > 0 ? 'text-[var(--warn)]' : 'text-muted-foreground'}`}>
                {delta > 0 ? '+' : ''}{delta} vs fcst
              </span>
            )}
          </>
        }
      />
      <WindMiniChart forecasts={forecasts} forecastHistory={forecastHistory} liveWindHistory={liveWindHistory} />
    </Card>
  );
}

// --- Tides: 24h curve with now marker and HW/LW dots ------------------------

function TideMiniChart({ tideData }: { tideData: TideData }) {
  const { rows, xMin, xMax, hwDots, lwDots } = useMemo(() => {
    const now = Date.now();
    const xMin = subHours(now, 12).getTime();
    const xMax = addHours(now, 12).getTime();
    const rows: { t: number; h: number }[] = tideData.heights
      .filter((h: TideHeight) => h.time.getTime() >= xMin && h.time.getTime() <= xMax)
      .map((h: TideHeight) => ({ t: h.time.getTime(), h: h.height }));
    const inWindow = (e: TideExtreme) => e.time.getTime() >= xMin && e.time.getTime() <= xMax;
    const hwDots = tideData.extremes.filter(e => e.type === 'High' && inWindow(e));
    const lwDots = tideData.extremes.filter(e => e.type === 'Low' && inWindow(e));
    return { rows, xMin, xMax, hwDots, lwDots };
  }, [tideData]);

  if (rows.length < 2) return <div className="h-20" />;
  const now = Date.now();

  return (
    <div className="h-20 -mx-2">
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
          {now >= xMin && now <= xMax && (
            <ReferenceLine x={now} stroke="var(--primary)" strokeOpacity={0.4} strokeDasharray="3 3" strokeWidth={1} />
          )}
          <Area
            type="monotone"
            dataKey="h"
            stroke={TIDE_COLOR}
            strokeWidth={2}
            fill="url(#tideHomeFill)"
            isAnimationActive={false}
          />
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
  if (!tideData) return null;
  const now = Date.now();
  const nextExtreme = tideData.extremes.find(e => e.time.getTime() > now);
  const currentHeight = tideData.heights.reduce<TideHeight | null>((best, h) => {
    if (!best) return h;
    return Math.abs(h.time.getTime() - now) < Math.abs(best.time.getTime() - now) ? h : best;
  }, null);

  let secondary: React.ReactNode = null;
  if (nextExtreme) {
    const mins = differenceInMinutes(nextExtreme.time, new Date(now));
    const hh = Math.floor(mins / 60);
    const countdown = hh > 0 ? `${hh}h ${mins % 60}m` : `${mins}m`;
    secondary = <>{nextExtreme.type === 'High' ? 'HW' : 'LW'} in {countdown}</>;
  }

  return (
    <Card onClick={() => onNavigate('tides')} label="Open tides">
      <CardHeader
        icon={Waves}
        title="Tides"
        primary={currentHeight ? <>{currentHeight.height.toFixed(1)} <span className="text-sm font-normal text-muted-foreground">m</span></> : '—'}
        secondary={secondary}
      />
      <TideMiniChart tideData={tideData} />
    </Card>
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

function NextRaceCardHome({
  forecasts, tideData, onNavigate,
}: { forecasts: HourlyForecast[]; tideData: TideData | null; onNavigate: (tab: Tab) => void }) {
  const race = useMemo(findNextRace, []);
  if (!race) return null;

  const [y, m, d] = race.date.split('-').map(Number);
  const [hh, mm] = (race.time as string).split(':').map(Number);
  const when = new Date(y, m - 1, d, hh, mm);

  const fc = forecasts.reduce<HourlyForecast | null>((best, f) => {
    if (!best) return f;
    return Math.abs(f.time.getTime() - when.getTime()) < Math.abs(best.time.getTime() - when.getTime()) ? f : best;
  }, null);

  const tide = tideData?.extremes
    .filter(e => Math.abs(e.time.getTime() - when.getTime()) <= 6 * 60 * 60 * 1000)
    .sort((a, b) => Math.abs(a.time.getTime() - when.getTime()) - Math.abs(b.time.getTime() - when.getTime()))[0];

  const unit = windUnitLabel();
  const wind = fc ? `${Math.round(convertWind(fc.windSpeed10m))}${unit} ${degreesToCardinal(fc.windDirectionFrom10m)}` : null;
  const tideLabel = tide ? `${tide.type === 'High' ? 'HW' : 'LW'} ${format(tide.time, 'HH:mm')}` : null;

  const dayLabel = isSameDay(when, new Date())
    ? 'Today'
    : isSameDay(when, addDays(startOfDay(new Date()), 1))
      ? 'Tomorrow'
      : format(when, 'EEE d MMM');

  return (
    <Card onClick={() => onNavigate('events')} label="Open race calendar">
      <CardHeader icon={Anchor} title="Next race" primary={race.time ?? undefined} secondary={dayLabel} />
      <p className="text-sm font-medium truncate">{race.name}</p>
      {(wind || tideLabel) && (
        <p className="text-muted-foreground text-xs mt-0.5">
          {wind}{wind && tideLabel ? ' · ' : ''}{tideLabel}
        </p>
      )}
    </Card>
  );
}

// --- 7-day ------------------------------------------------------------------

function WeekCardHome({ forecasts, onNavigate }: { forecasts: HourlyForecast[]; onNavigate: (tab: Tab) => void }) {
  const days = useMemo(() => {
    const start = startOfDay(new Date());
    const out: { date: Date; code: number; windMax: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      const same = forecasts.filter(f => isSameDay(f.time, d));
      if (same.length === 0) continue;
      const midday = same.find(f => f.time.getHours() === 12) ?? same[Math.floor(same.length / 2)];
      const windMax = Math.max(...same.map(f => f.windSpeed10m));
      out.push({ date: d, code: midday.significantWeatherCode, windMax });
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
          return (
            <div key={i} className="flex flex-col items-center gap-1">
              <span className="text-[10px] text-muted-foreground font-medium">
                {i === 0 ? 'Today' : format(d.date, 'EEE')}
              </span>
              <Icon className="h-5 w-5" strokeWidth={1.75} style={{ color: getWeatherIconColor(d.code) }} aria-hidden />
              <span className="text-[11px] tabular-nums font-medium">{Math.round(convertWind(d.windMax))}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default function HomePage({
  forecasts, forecastHistory, liveWind, liveWindHistory, tideData, sunInfo, onNavigate,
}: HomePageProps) {
  return (
    <div className="space-y-3 page-enter">
      <SunSummary forecasts={forecasts} sunInfo={sunInfo} />
      <WindCardHome
        forecasts={forecasts}
        forecastHistory={forecastHistory}
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
