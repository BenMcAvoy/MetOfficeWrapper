import type { HourlyForecast } from '@/lib/api';
import { msToKnots, beaufortScale, beaufortColor, degreesToCardinal } from '@/lib/units';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Wind, ArrowUp } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { XAxisTick, YAxisTick, tooltipStyle } from '@/lib/chartUtils';
import { format, isSameDay } from 'date-fns';

interface WindCardProps {
  forecasts: HourlyForecast[];
  selectedDay: Date;
}


function beaufortBg(force: number): string {
  if (force <= 3) return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300';
  if (force <= 5) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300';
  if (force <= 7) return 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300';
  return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
}

export default function WindCard({ forecasts, selectedDay }: WindCardProps) {
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

  const chartData = forecasts.map(f => ({
    time: format(f.time, 'HH:mm'),
    avg: Math.round(msToKnots(f.windSpeed10m) * 10) / 10,
    gust: Math.round(msToKnots(f.windGustSpeed10m) * 10) / 10,
  }));

  return (
    <div className="space-y-3">
      {/* Day summary */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <p className="text-muted-foreground text-xs uppercase tracking-wide mb-4">
            {isToday ? "Today's" : format(selectedDay, "EEEE's")} Wind
          </p>
          <div className="flex items-end justify-between gap-2">
            <div>
              <p className="text-muted-foreground text-xs mb-1">Day Average</p>
              <div className="flex items-baseline gap-1.5">
                <span className={`text-5xl font-bold ${beaufortColor(avgBf.force)}`}>{Math.round(avgKnots)}</span>
                <span className="text-muted-foreground">kt</span>
              </div>
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${beaufortBg(avgBf.force)}`}>F{avgBf.force}</span>
                <span className="text-muted-foreground text-xs">{avgBf.description}</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-muted-foreground text-xs mb-1">Peak Gust</p>
              <div className="flex items-baseline gap-1.5 justify-end">
                <span className={`text-5xl font-bold ${beaufortColor(peakBf.force)}`}>{Math.round(peakKnots)}</span>
                <span className="text-muted-foreground">kt</span>
              </div>
              <p className="text-muted-foreground text-xs mt-1.5">
                {format(peakGustEntry.time, 'HH:mm')} · {degreesToCardinal(peakGustEntry.windDirectionFrom10m)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Current / first-hour detail */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <p className="text-muted-foreground text-xs uppercase tracking-wide mb-3">
            {isToday ? `Now · ${format(current.time, 'HH:mm')}` : `${format(current.time, 'HH:mm')} · first hour`}
          </p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-muted-foreground text-xs mb-1">Avg</p>
              <div className="flex items-baseline gap-1">
                <span className={`text-3xl font-bold ${beaufortColor(currentBf.force)}`}>
                  {Math.round(currentKnotsAvg)}
                </span>
                <span className="text-muted-foreground text-sm">kt</span>
              </div>
            </div>
            <div>
              <p className="text-muted-foreground text-xs mb-1">Gust</p>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-orange-500">
                  {Math.round(currentKnotsGust)}
                </span>
                <span className="text-muted-foreground text-sm">kt</span>
              </div>
            </div>
            <div>
              <p className="text-muted-foreground text-xs mb-1">From</p>
              <div className="flex items-center gap-1.5">
                <ArrowUp
                  className="h-4 w-4 text-primary flex-shrink-0"
                  style={{ transform: `rotate(${current.windDirectionFrom10m}deg)` }}
                  strokeWidth={2.5}
                />
                <span className="text-foreground font-semibold">{degreesToCardinal(current.windDirectionFrom10m)}</span>
              </div>
              <p className="text-muted-foreground text-xs mt-0.5">{Math.round(current.windDirectionFrom10m)}°</p>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3 pt-3 border-t">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${beaufortBg(currentBf.force)}`}>
              Beaufort {currentBf.force}
            </span>
            <span className="text-muted-foreground text-sm">{currentBf.description}</span>
          </div>
        </CardContent>
      </Card>

      {/* Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Wind className="h-4 w-4" /> Wind Chart
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="avgGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gustGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ea580c" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#ea580c" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="time" tick={<XAxisTick />} interval={2} />
                <YAxis tick={<YAxisTick unit="kt" />} width={44} />
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ color: 'hsl(var(--muted-foreground))', fontSize: '11px' }} />
                <Area type="monotone" dataKey="avg" name="Avg" stroke="#2563eb" fill="url(#avgGrad)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="gust" name="Gust" stroke="#ea580c" fill="url(#gustGrad)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
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
