import type { HourlyForecast } from '@/lib/api';
import { msToKnots, beaufortScale, beaufortColor, degreesToCardinal } from '@/lib/units';
import { getWeatherInfo } from '@/lib/weatherCodes';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowUp, CalendarDays } from 'lucide-react';
import { format, startOfDay, addDays, isSameDay } from 'date-fns';

interface ForecastStripProps {
  forecasts: HourlyForecast[];
}

function beaufortBg(force: number): string {
  if (force <= 3) return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300';
  if (force <= 5) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300';
  if (force <= 7) return 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300';
  return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
}

export default function ForecastStrip({ forecasts }: ForecastStripProps) {
  const days = Array.from({ length: 5 }, (_, i) => startOfDay(addDays(new Date(), i)));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <CalendarDays className="h-4 w-4" /> 5-Day Forecast
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 pb-1">
        {/* Column headers */}
        <div className="grid grid-cols-[3.5rem_1.75rem_3.5rem_1fr_1fr_2.5rem] gap-x-3 px-4 pb-2 text-xs text-muted-foreground uppercase tracking-wide">
          <span>Day</span>
          <span></span>
          <span>Temp</span>
          <span>Avg</span>
          <span className="text-orange-500">Gust</span>
          <span>Rain</span>
        </div>

        <div className="divide-y divide-border">
          {days.map((day, i) => {
            const dayForecasts = forecasts.filter(f => isSameDay(f.time, day));
            if (!dayForecasts.length) return null;

            const maxTemp = Math.max(...dayForecasts.map(f => f.screenTemperature));
            const minTemp = Math.min(...dayForecasts.map(f => f.screenTemperature));
            const maxGust = Math.max(...dayForecasts.map(f => f.windGustSpeed10m));
            const avgWind = dayForecasts.reduce((s, f) => s + f.windSpeed10m, 0) / dayForecasts.length;
            const maxRain = Math.max(...dayForecasts.map(f => f.probOfPrecipitation));
            const peakEntry = dayForecasts.find(f => f.windGustSpeed10m === maxGust)!;
            const dominant = dayForecasts.reduce((best, f) =>
              f.precipitationRate > best.precipitationRate ? f : best, dayForecasts[0]);
            const weather = getWeatherInfo(dominant.significantWeatherCode);
            const WeatherIcon = weather.Icon;
            const bf = beaufortScale(msToKnots(avgWind));
            const peakBf = beaufortScale(msToKnots(maxGust));
            const isToday = isSameDay(day, new Date());

            return (
              <div
                key={i}
                className={`grid grid-cols-[3.5rem_1.75rem_3.5rem_1fr_1fr_2.5rem] gap-x-3 px-4 py-3 items-center ${
                  isToday ? 'bg-muted/40' : ''
                }`}
              >
                {/* Day */}
                <div>
                  <p className="text-sm font-medium leading-tight">
                    {isToday ? 'Today' : format(day, 'EEE')}
                  </p>
                  <p className="text-muted-foreground text-xs">{format(day, 'd MMM')}</p>
                </div>

                {/* Icon */}
                <WeatherIcon className="h-5 w-5 text-primary" strokeWidth={1.5} />

                {/* Temp */}
                <div className="text-xs leading-tight">
                  <span className="font-medium">{Math.round(maxTemp)}°</span>
                  <span className="text-muted-foreground"> / {Math.round(minTemp)}°</span>
                </div>

                {/* Avg wind */}
                <div className="flex items-center gap-1.5">
                  <span className={`text-sm font-semibold tabular-nums ${beaufortColor(bf.force)}`}>
                    {Math.round(msToKnots(avgWind))}kt
                  </span>
                  <span className={`text-xs font-medium px-1 py-0.5 rounded leading-none ${beaufortBg(bf.force)}`}>
                    F{bf.force}
                  </span>
                </div>

                {/* Peak gust */}
                <div className="flex items-center gap-1">
                  <ArrowUp
                    className="h-3 w-3 text-muted-foreground flex-shrink-0"
                    style={{ transform: `rotate(${peakEntry.windDirectionFrom10m}deg)` }}
                    strokeWidth={2.5}
                  />
                  <span className={`text-sm font-semibold tabular-nums ${beaufortColor(peakBf.force)}`}>
                    {Math.round(msToKnots(maxGust))}kt
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {degreesToCardinal(peakEntry.windDirectionFrom10m)}
                  </span>
                </div>

                {/* Rain */}
                <span className={`text-xs font-medium tabular-nums text-right ${
                  maxRain > 60 ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground'
                }`}>
                  {maxRain}%
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
