import type { HourlyForecast, LiveWind, LiveWindHistoryPoint, WindForecastPoint } from '@/lib/api';
import { msToKnots, convertWind, windUnitLabel, beaufortScale, beaufortColor, beaufortBg, degreesToCardinal } from '@/lib/units';
import { useSettings } from '@/lib/settings';
import { useNow } from '@/lib/useNow';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Wind, ArrowUp } from 'lucide-react';
import { format, isSameDay } from 'date-fns';
import WindChartCard from '@/components/WindChartCard';

interface WindCardProps {
  forecasts: HourlyForecast[];
  chartForecasts: HourlyForecast[];
  chartHistoryForecasts: WindForecastPoint[];
  selectedDay: Date;
  liveWind: LiveWind | null;
  liveWindHistory: LiveWindHistoryPoint[];
}



export default function WindCard({ forecasts, chartForecasts, chartHistoryForecasts, selectedDay, liveWind, liveWindHistory }: WindCardProps) {
  const nowMs = useNow(1000);
  const { windUnit } = useSettings();
  const unitLabel = windUnitLabel(windUnit);

  if (!forecasts.length) return (
    <div className="text-center py-12 text-muted-foreground">
      <Wind className="mx-auto h-10 w-10 mb-3" />
      No wind data for this day
    </div>
  );

  const isToday = isSameDay(selectedDay, new Date(nowMs));

  const peakGust = Math.max(...forecasts.map(f => f.windGustSpeed10m));
  const avgWind = forecasts.reduce((s, f) => s + f.windSpeed10m, 0) / forecasts.length;
  const peakGustEntry = forecasts.find(f => f.windGustSpeed10m === peakGust)!;
  const peakKnots = msToKnots(peakGust);
  const avgKnots = msToKnots(avgWind);
  const peakBf = beaufortScale(peakKnots);
  const avgBf = beaufortScale(avgKnots);
  const disp = (ms: number) => Math.round(convertWind(ms, windUnit));

  const liveAgeSeconds = liveWind
    ? Math.max(0, Math.round((nowMs - liveWind.observedAt.getTime()) / 1000))
    : null;
  const hasLiveReading = isToday && !!liveWind && liveAgeSeconds !== null;
  const hasFreshLiveWind = hasLiveReading && liveAgeSeconds <= 300;
  const hasStaleLiveWind = hasLiveReading && liveAgeSeconds > 300;
  const currentObservedKnots = hasLiveReading && liveWind ? msToKnots(liveWind.windSpeedMs) : null;
  const currentObservedBf = currentObservedKnots !== null ? beaufortScale(currentObservedKnots) : null;
  const currentObservedDirection = hasLiveReading && liveWind ? liveWind.windDirectionDeg : null;
  const liveDotClass = hasFreshLiveWind
    ? 'bg-primary'
    : hasStaleLiveWind
      ? 'bg-[var(--warn)]'
      : 'bg-muted-foreground/40';
  const liveStatusText = hasFreshLiveWind
    ? `Live · ${liveAgeSeconds}s ago`
    : hasStaleLiveWind
      ? `Stale · ${Math.round((liveAgeSeconds ?? 0) / 60)}m ago`
      : 'No live data';

  const lastHourObserved = isToday
    ? liveWindHistory.filter(p => {
      const t = p.time.getTime();
      return t >= nowMs - 60 * 60 * 1000 && t <= nowMs;
    })
    : [];
  const observedAvgMsLastHour = lastHourObserved.length
    ? lastHourObserved.reduce((sum, p) => sum + p.avgWindMs, 0) / lastHourObserved.length
    : null;
  const maxObservedGustPoint = lastHourObserved.length
    ? lastHourObserved.reduce((max, p) => (p.gustWindMs > max.gustWindMs ? p : max), lastHourObserved[0])
    : null;
  const currentTimestamp = hasLiveReading && liveWind
    ? format(liveWind.observedAt, 'HH:mm:ss')
    : null;


  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="pt-4 pb-4">
          {isToday ? (
            <>
              <div className="flex items-center justify-between mb-3">
                <p className="text-muted-foreground text-xs uppercase tracking-wide">Today</p>
                <div className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${liveDotClass} ${hasFreshLiveWind ? 'animate-pulse' : ''}`} />
                  <span className="text-muted-foreground text-[11px]">{liveStatusText}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="py-1">
                  <p className="text-muted-foreground text-xs mb-1">Current speed</p>
                  <div className="flex items-baseline gap-1.5">
                    <span className={`font-display text-5xl font-semibold tabular-nums tracking-tight ${currentObservedBf ? beaufortColor(currentObservedBf.force) : 'text-foreground'}`}>
                      {hasLiveReading && liveWind ? disp(liveWind.windSpeedMs) : '—'}
                    </span>
                    {hasLiveReading && liveWind && <span className="text-muted-foreground text-sm">{unitLabel}</span>}
                  </div>
                  {currentObservedBf && (
                    <p className="text-muted-foreground text-[11px] mt-1">F{currentObservedBf.force} · {currentObservedBf.description}</p>
                  )}
                </div>

                <div className="py-1">
                  <p className="text-muted-foreground text-xs mb-1">Max gust (1h)</p>
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-display text-5xl font-semibold tabular-nums tracking-tight text-[var(--chart-gust)]">
                      {maxObservedGustPoint ? disp(maxObservedGustPoint.gustWindMs) : '—'}
                    </span>
                    {maxObservedGustPoint && <span className="text-muted-foreground text-sm">{unitLabel}</span>}
                  </div>
                  {maxObservedGustPoint && (
                    <p className="text-muted-foreground text-[11px] mt-1">
                      {format(maxObservedGustPoint.time, 'HH:mm')} · {degreesToCardinal(maxObservedGustPoint.windDirectionDeg)}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between mt-3 pt-3 border-t">
                <div className="flex items-center gap-2">
                  {currentObservedDirection !== null ? (
                    <>
                      <ArrowUp
                        className="h-4 w-4 text-primary"
                        style={{ transform: `rotate(${currentObservedDirection}deg)` }}
                        strokeWidth={2.5}
                      />
                      <span className="text-sm font-semibold">{degreesToCardinal(currentObservedDirection)}</span>
                      <span className="text-muted-foreground text-xs tabular-nums">{Math.round(currentObservedDirection)}°</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground text-xs">Direction unavailable</span>
                  )}
                </div>
                <div className="flex items-baseline gap-2 text-xs">
                  {observedAvgMsLastHour !== null && (
                    <span className="text-muted-foreground">
                      Avg 1h <span className="text-foreground font-semibold tabular-nums">{disp(observedAvgMsLastHour)}{unitLabel}</span>
                    </span>
                  )}
                  {currentTimestamp && (
                    <span className="text-muted-foreground/70 tabular-nums">{currentTimestamp}</span>
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="text-muted-foreground text-xs uppercase tracking-wide mb-3">
                {format(selectedDay, 'EEEE d MMM')}
              </p>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Day Avg</p>
                  <p className={`font-display text-2xl font-semibold tabular-nums tracking-tight ${beaufortColor(avgBf.force)}`}>{disp(avgWind)}{unitLabel}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Peak Gust</p>
                  <p className={`font-display text-2xl font-semibold tabular-nums tracking-tight ${beaufortColor(peakBf.force)}`}>{disp(peakGust)}{unitLabel}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Peak At</p>
                  <p className="text-base font-semibold tabular-nums">{format(peakGustEntry.time, 'HH:mm')}</p>
                  <p className="text-muted-foreground text-xs">{degreesToCardinal(peakGustEntry.windDirectionFrom10m)}</p>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <WindChartCard
        title="Wind Chart"
        forecasts={chartForecasts}
        historyForecasts={isToday ? chartHistoryForecasts : []}
        liveWindHistory={isToday ? liveWindHistory : []}
        includePastHours={isToday ? 3 : 0}
      />

      {/* Hourly breakdown table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Hourly Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {/* Header */}
            <div className="grid grid-cols-[3rem_2rem_3.5rem_1fr_1fr_3rem] gap-2 px-4 py-2 text-xs text-muted-foreground uppercase tracking-wide">
              <span>Time</span>
              <span></span>
              <span>Dir</span>
              <span>Avg</span>
              <span className="text-[var(--chart-gust)]">Gust</span>
              <span>BF</span>
            </div>
            {forecasts.map((f, i) => {
              const ktsAvg = msToKnots(f.windSpeed10m);
              const bf = beaufortScale(ktsAvg);
              const isCurrentHour = isToday && i === 0;
              return (
                <div
                  key={i}
                  className={`relative grid grid-cols-[3rem_2rem_3.5rem_1fr_1fr_3rem] gap-2 px-4 py-2.5 items-center text-sm ${
                    isCurrentHour ? 'bg-primary/5' : ''
                  }`}
                >
                  {isCurrentHour && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-primary" aria-hidden />
                  )}
                  <span className={`text-xs tabular-nums ${isCurrentHour ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>
                    {isCurrentHour ? 'Now' : format(f.time, 'HH:mm')}
                  </span>
                  <ArrowUp
                    className="h-4 w-4 text-primary"
                    style={{ transform: `rotate(${f.windDirectionFrom10m}deg)` }}
                    strokeWidth={2.5}
                  />
                  <span className="text-xs text-muted-foreground">{degreesToCardinal(f.windDirectionFrom10m)}</span>
                  <span className={`font-semibold tabular-nums ${beaufortColor(bf.force)}`}>
                    {disp(f.windSpeed10m)} {unitLabel}
                  </span>
                  <span className="font-semibold tabular-nums text-[var(--chart-gust)]">
                    {disp(f.windGustSpeed10m)} {unitLabel}
                  </span>
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded text-center ${beaufortBg(bf.force)}`}>
                    F{bf.force}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
