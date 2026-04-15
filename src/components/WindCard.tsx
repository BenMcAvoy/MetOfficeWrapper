import type { HourlyForecast, LiveWind, LiveWindHistoryPoint } from '@/lib/api';
import { msToKnots, beaufortScale, beaufortColor, beaufortBg, degreesToCardinal } from '@/lib/units';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Wind, ArrowUp } from 'lucide-react';
import { format, isSameDay } from 'date-fns';
import WindChartCard from '@/components/WindChartCard';

interface WindCardProps {
  forecasts: HourlyForecast[];
  chartForecasts: HourlyForecast[];
  selectedDay: Date;
  liveWind: LiveWind | null;
  liveWindHistory: LiveWindHistoryPoint[];
}



export default function WindCard({ forecasts, chartForecasts, selectedDay, liveWind, liveWindHistory }: WindCardProps) {
  if (!forecasts.length) return (
    <div className="text-center py-12 text-muted-foreground">
      <Wind className="mx-auto h-10 w-10 mb-3" />
      No wind data for this day
    </div>
  );

  const isToday = isSameDay(selectedDay, new Date());

  const peakGust = Math.max(...forecasts.map(f => f.windGustSpeed10m));
  const avgWind = forecasts.reduce((s, f) => s + f.windSpeed10m, 0) / forecasts.length;
  const peakGustEntry = forecasts.find(f => f.windGustSpeed10m === peakGust)!;
  const peakKnots = msToKnots(peakGust);
  const avgKnots = msToKnots(avgWind);
  const peakBf = beaufortScale(peakKnots);
  const avgBf = beaufortScale(avgKnots);

  const nowMs = Date.now();
  const liveAgeSeconds = liveWind
    ? Math.max(0, Math.round((nowMs - liveWind.observedAt.getTime()) / 1000))
    : null;
  const hasLiveReading = isToday && !!liveWind && liveAgeSeconds !== null;
  const hasFreshLiveWind = hasLiveReading && liveAgeSeconds <= 300;
  const hasStaleLiveWind = hasLiveReading && liveAgeSeconds > 300;
  const currentObservedKnots = hasLiveReading && liveWind ? msToKnots(liveWind.windSpeedMs) : null;
  const currentObservedBf = currentObservedKnots !== null ? beaufortScale(currentObservedKnots) : null;
  const currentObservedDirection = hasLiveReading && liveWind ? liveWind.windDirectionDeg : null;
  const sourceBadgeClass = hasFreshLiveWind
    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
    : hasStaleLiveWind
      ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300'
      : 'bg-muted text-muted-foreground';
  const sourceBadgeText = hasFreshLiveWind ? 'LIVE' : hasStaleLiveWind ? 'STALE' : 'NO LIVE';

  const lastHourObserved = isToday
    ? liveWindHistory.filter(p => {
      const t = p.time.getTime();
      return t >= nowMs - 60 * 60 * 1000 && t <= nowMs;
    })
    : [];
  const observedAvgKnotsLastHour = lastHourObserved.length
    ? lastHourObserved.reduce((sum, p) => sum + msToKnots(p.avgWindMs), 0) / lastHourObserved.length
    : null;
  const maxObservedGustPoint = lastHourObserved.length
    ? lastHourObserved.reduce((max, p) => (p.gustWindMs > max.gustWindMs ? p : max), lastHourObserved[0])
    : null;
  const maxObservedGustLastHour = maxObservedGustPoint
    ? msToKnots(maxObservedGustPoint.gustWindMs)
    : null;
  const currentTimestamp = hasLiveReading && liveWind && liveAgeSeconds !== null
    ? `${format(liveWind.observedAt, 'HH:mm:ss')} · ${liveAgeSeconds}s ago${liveWind.delaySeconds !== null ? ` · +${liveWind.delaySeconds}s` : ''}`
    : 'No live station update';


  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="pt-4 pb-4">
          {isToday ? (
            <>
              <div className="flex items-center justify-between mb-3">
                <p className="text-muted-foreground text-xs uppercase tracking-wide">Today's Wind</p>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${sourceBadgeClass}`}>
                  {sourceBadgeText}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border p-3">
                  <p className="text-muted-foreground text-xs mb-1">Current speed</p>
                  <div className="flex items-baseline gap-1.5">
                    <span className={`text-4xl font-bold tabular-nums ${currentObservedBf ? beaufortColor(currentObservedBf.force) : 'text-foreground'}`}>
                      {currentObservedKnots !== null ? Math.round(currentObservedKnots) : '—'}
                    </span>
                    {currentObservedKnots !== null && <span className="text-muted-foreground text-sm">kt</span>}
                  </div>
                  {currentObservedBf && (
                    <p className="text-muted-foreground text-[11px] mt-1">F{currentObservedBf.force} · {currentObservedBf.description}</p>
                  )}
                </div>

                <div className="rounded-lg border p-3">
                  <p className="text-muted-foreground text-xs mb-1">Max gust (1h)</p>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-4xl font-bold tabular-nums text-orange-500">
                      {maxObservedGustLastHour !== null ? Math.round(maxObservedGustLastHour) : '—'}
                    </span>
                    {maxObservedGustLastHour !== null && <span className="text-muted-foreground text-sm">kt</span>}
                  </div>
                  {maxObservedGustPoint && (
                    <p className="text-muted-foreground text-[11px] mt-1">
                      {format(maxObservedGustPoint.time, 'HH:mm')} · {degreesToCardinal(maxObservedGustPoint.windDirectionDeg)}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between mt-3 pt-3 border-t">
                <div className="flex items-center gap-1.5">
                  {currentObservedDirection !== null ? (
                    <>
                      <ArrowUp
                        className="h-4 w-4 text-primary"
                        style={{ transform: `rotate(${currentObservedDirection}deg)` }}
                        strokeWidth={2.5}
                      />
                      <span className="text-sm font-semibold">{degreesToCardinal(currentObservedDirection)}</span>
                      <span className="text-muted-foreground text-xs">{Math.round(currentObservedDirection)}°</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground text-xs">No live direction</span>
                  )}
                </div>
                <p className="text-muted-foreground text-xs text-right">{currentTimestamp}</p>
              </div>

              <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t">
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Avg (1h)</p>
                  <p className="text-xl font-bold tabular-nums">
                    {observedAvgKnotsLastHour !== null ? `${Math.round(observedAvgKnotsLastHour)}kt` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Samples</p>
                  <p className="text-xl font-bold tabular-nums">{lastHourObserved.length}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Data</p>
                  <p className="text-base font-semibold tabular-nums">
                    {hasFreshLiveWind ? 'Fresh' : hasStaleLiveWind ? 'Stale' : 'Offline'}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <p className="text-muted-foreground text-xs uppercase tracking-wide">{`${format(selectedDay, 'EEEE')}'s`} Wind</p>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-muted text-muted-foreground">FORECAST</span>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Day Avg</p>
                  <p className={`text-xl font-bold tabular-nums ${beaufortColor(avgBf.force)}`}>{Math.round(avgKnots)}kt</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Peak Gust</p>
                  <p className={`text-xl font-bold tabular-nums ${beaufortColor(peakBf.force)}`}>{Math.round(peakKnots)}kt</p>
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
              <span className="text-orange-500">Gust</span>
              <span>BF</span>
            </div>
            {forecasts.map((f, i) => {
              const ktsAvg = msToKnots(f.windSpeed10m);
              const ktsGust = msToKnots(f.windGustSpeed10m);
              const bf = beaufortScale(ktsAvg);
              return (
                <div
                  key={i}
                  className={`grid grid-cols-[3rem_2rem_3.5rem_1fr_1fr_3rem] gap-2 px-4 py-2.5 items-center text-sm ${
                    isToday && i === 0 ? 'bg-muted/50' : ''
                  }`}
                >
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {isToday && i === 0 ? 'Now' : format(f.time, 'HH:mm')}
                  </span>
                  <ArrowUp
                    className="h-4 w-4 text-primary"
                    style={{ transform: `rotate(${f.windDirectionFrom10m}deg)` }}
                    strokeWidth={2.5}
                  />
                  <span className="text-xs text-muted-foreground">{degreesToCardinal(f.windDirectionFrom10m)}</span>
                  <span className={`font-semibold tabular-nums ${beaufortColor(bf.force)}`}>
                    {Math.round(ktsAvg)} kt
                  </span>
                  <span className="font-semibold tabular-nums text-orange-500">
                    {Math.round(ktsGust)} kt
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
