import type { HourlyForecast, LiveWind, LiveWindHistoryPoint } from '@/lib/api';
import { msToKnots, beaufortScale, beaufortColor, beaufortBg, degreesToCardinal } from '@/lib/units';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Wind, ArrowUp } from 'lucide-react';
import { WindChart } from '@/components/charts';
import { format, isSameDay } from 'date-fns';

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

  const current = forecasts[0];
  const currentKnotsAvg = msToKnots(current.windSpeed10m);
  const currentKnotsGust = msToKnots(current.windGustSpeed10m);
  const currentBf = beaufortScale(currentKnotsAvg);

  const liveAgeSeconds = liveWind
    ? Math.max(0, Math.round((Date.now() - liveWind.observedAt.getTime()) / 1000))
    : null;
  const hasFreshLiveWind = isToday && !!liveWind && liveAgeSeconds !== null && liveAgeSeconds <= 300;
  const liveKnots = hasFreshLiveWind && liveWind ? msToKnots(liveWind.windSpeedMs) : null;
  const liveBf = liveKnots !== null ? beaufortScale(liveKnots) : null;
  const currentSourceKnots = hasFreshLiveWind && liveKnots !== null ? liveKnots : currentKnotsAvg;
  const currentSourceDirection = hasFreshLiveWind && liveWind
    ? liveWind.windDirectionDeg
    : current.windDirectionFrom10m;
  const currentSourceBf = hasFreshLiveWind && liveBf ? liveBf : currentBf;
  const currentTimestamp = hasFreshLiveWind && liveWind && liveAgeSeconds !== null
    ? `${format(liveWind.observedAt, 'HH:mm:ss')} · ${liveAgeSeconds}s ago${liveWind.delaySeconds !== null ? ` · delay ${liveWind.delaySeconds}s` : ''}`
    : isToday
      ? `Forecast now · ${format(current.time, 'HH:mm')}`
      : `Forecast ${format(current.time, 'HH:mm')}`;


  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="pt-4 pb-4 space-y-4">
          <p className="text-muted-foreground text-xs uppercase tracking-wide mb-4">
            {isToday ? "Today's" : `${format(selectedDay, 'EEEE')}'s`} Wind
          </p>

          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-muted-foreground text-xs mb-1">{hasFreshLiveWind ? 'Current (Live)' : 'Current'}</p>
              <div className="flex items-baseline gap-1.5">
                <span className={`text-5xl font-bold ${beaufortColor(currentSourceBf.force)}`}>{Math.round(currentSourceKnots)}</span>
                <span className="text-muted-foreground">kt</span>
              </div>
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${beaufortBg(currentSourceBf.force)}`}>F{currentSourceBf.force}</span>
                <span className="text-muted-foreground text-xs">{currentSourceBf.description}</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-muted-foreground text-xs mb-1">From</p>
              <div className="flex items-center justify-end gap-1.5">
                <ArrowUp
                  className="h-4 w-4 text-primary"
                  style={{ transform: `rotate(${currentSourceDirection}deg)` }}
                  strokeWidth={2.5}
                />
                <span className="font-semibold">{degreesToCardinal(currentSourceDirection)}</span>
                <span className="text-muted-foreground text-xs">{Math.round(currentSourceDirection)}°</span>
              </div>
              <p className="text-muted-foreground text-xs mt-1.5">
                {currentTimestamp}
              </p>
            </div>
          </div>

          {isToday && !hasFreshLiveWind && (
            <p className="text-muted-foreground text-xs border-t pt-3">
              Live station data unavailable. Showing forecast for current hour.
            </p>
          )}

          {isToday && hasFreshLiveWind && (
            <p className="text-muted-foreground text-xs border-t pt-3">
              Forecast this hour: {Math.round(currentKnotsAvg)}kt avg / {Math.round(currentKnotsGust)}kt gust
            </p>
          )}

          <div className="grid grid-cols-3 gap-4 border-t pt-3">
            <div>
              <p className="text-muted-foreground text-xs mb-1">Day Average</p>
              <div className="flex items-baseline gap-1">
                <span className={`text-3xl font-bold ${beaufortColor(avgBf.force)}`}>
                  {Math.round(avgKnots)}
                </span>
                <span className="text-muted-foreground text-sm">kt</span>
              </div>
            </div>
            <div>
              <p className="text-muted-foreground text-xs mb-1">Peak Gust</p>
              <div className="flex items-baseline gap-1">
                <span className={`text-3xl font-bold ${beaufortColor(peakBf.force)}`}>
                  {Math.round(peakKnots)}
                </span>
                <span className="text-muted-foreground text-sm">kt</span>
              </div>
              <p className="text-muted-foreground text-xs mt-0.5">{format(peakGustEntry.time, 'HH:mm')}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs mb-1">Peak Direction</p>
              <div className="flex items-center gap-1.5">
                <ArrowUp
                  className="h-4 w-4 text-primary flex-shrink-0"
                  style={{ transform: `rotate(${peakGustEntry.windDirectionFrom10m}deg)` }}
                  strokeWidth={2.5}
                />
                <span className="text-foreground font-semibold">{degreesToCardinal(peakGustEntry.windDirectionFrom10m)}</span>
              </div>
              <p className="text-muted-foreground text-xs mt-0.5">{Math.round(peakGustEntry.windDirectionFrom10m)}°</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${beaufortBg(currentSourceBf.force)}`}>
              Beaufort {currentSourceBf.force}
            </span>
            <span className="text-muted-foreground text-sm">{currentSourceBf.description}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Wind className="h-4 w-4" /> Wind Chart
          </CardTitle>
        </CardHeader>
        <CardContent>
          <WindChart
            forecasts={chartForecasts}
            liveHistory={isToday ? liveWindHistory : []}
            includePastHours={isToday ? 3 : 0}
          />
        </CardContent>
      </Card>

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
