import type { HourlyForecast, SunInfo } from '@/lib/api';
import { msToKnots, beaufortScale, beaufortColor, degreesToCardinal } from '@/lib/units';
import { getWeatherInfo, visibilityLabel } from '@/lib/weatherCodes';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { CloudRain, Sunrise, Sunset, Gauge, Droplets, Eye, ArrowUp } from 'lucide-react';
import { format, isSameDay } from 'date-fns';

interface WeatherOverviewProps {
  forecasts: HourlyForecast[];
  allForecasts: HourlyForecast[];
  sunInfo: SunInfo | null;
  selectedDay: Date;
}

export default function WeatherOverview({ forecasts, allForecasts, sunInfo, selectedDay }: WeatherOverviewProps) {
  if (!forecasts.length) return (
    <div className="text-center py-12 text-muted-foreground">No forecast data for this day</div>
  );

  const isToday = isSameDay(selectedDay, new Date());

  const representative = isToday
    ? forecasts[0]
    : (forecasts.find(f => f.time.getHours() === 12) ?? forecasts[Math.floor(forecasts.length / 2)]);

  const weather = getWeatherInfo(representative.significantWeatherCode);
  const WeatherIcon = weather.Icon;

  const maxTemp = Math.max(...forecasts.map(f => f.screenTemperature));
  const minTemp = Math.min(...forecasts.map(f => f.screenTemperature));
  const maxGust = Math.max(...forecasts.map(f => f.windGustSpeed10m));
  const avgWind = forecasts.reduce((s, f) => s + f.windSpeed10m, 0) / forecasts.length;
  const maxRainProb = Math.max(...forecasts.map(f => f.probOfPrecipitation));
  const maxPrecip = Math.max(...forecasts.map(f => f.precipitationRate));

  const knotsAvg = msToKnots(representative.windSpeed10m);
  const knotsGust = msToKnots(representative.windGustSpeed10m);
  const bf = beaufortScale(isToday ? knotsAvg : msToKnots(avgWind));
  const bfGust = beaufortScale(isToday ? knotsGust : msToKnots(maxGust));

  const displayAvg = Math.round(isToday ? knotsAvg : msToKnots(avgWind));
  const displayGust = Math.round(isToday ? knotsGust : msToKnots(maxGust));

  const stripForecasts = isToday ? allForecasts.slice(0, 13) : forecasts;

  return (
    <div className="space-y-3">
      {/* Hero */}
      <Card>
        <CardContent className="pt-5 pb-5">
          {/* Temp + icon */}
          <div className="flex items-start justify-between mb-4">
            <div>
              {isToday ? (
                <>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-5xl font-bold">{Math.round(representative.screenTemperature)}°C</span>
                  </div>
                  <p className="text-muted-foreground text-sm mt-1">
                    {weather.description} · feels like {Math.round(representative.feelsLikeTemp)}°C
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold">{Math.round(minTemp)}°</span>
                    <span className="text-muted-foreground text-2xl">–</span>
                    <span className="text-4xl font-bold">{Math.round(maxTemp)}°C</span>
                  </div>
                  <p className="text-muted-foreground text-sm mt-1">
                    {weather.description} · {format(selectedDay, 'EEEE d MMM')}
                  </p>
                </>
              )}
            </div>
            <WeatherIcon className="h-14 w-14 text-primary shrink-0" strokeWidth={1.25} />
          </div>

          <Separator className="mb-4" />

                    <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowUp
                className="h-6 w-6 text-muted-foreground shrink-0"
                style={{ transform: `rotate(${representative.windDirectionFrom10m}deg)` }}
              />
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className={`text-3xl font-bold ${beaufortColor(bf.force)}`}>{displayAvg}</span>
                  <span className="text-muted-foreground text-sm">kts</span>
                  <span className="text-muted-foreground text-sm mx-0.5">/</span>
                  <span className={`text-2xl font-semibold ${beaufortColor(bfGust.force)}`}>{displayGust}</span>
                  <span className="text-muted-foreground text-sm">G</span>
                </div>
                <p className="text-muted-foreground text-xs">
                  {isToday ? 'avg / gust' : 'day avg / peak gust'} · {degreesToCardinal(representative.windDirectionFrom10m)} · F{bf.force} / F{bfGust.force}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Secondary stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wide mb-2">
              <CloudRain className="h-3 w-3" /> Rain
            </div>
            <p className={`text-2xl font-bold ${maxRainProb > 60 ? 'text-blue-500' : ''}`}>{maxRainProb}%</p>
            <p className="text-muted-foreground text-xs mt-0.5">{maxPrecip.toFixed(1)} mm/hr peak</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wide mb-2">
              <Sunrise className="h-3 w-3" /> Sun
            </div>
            {sunInfo ? (
              <>
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <Sunrise className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  {format(sunInfo.sunrise, 'HH:mm')}
                  <Sunset className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-1" />
                  {format(sunInfo.sunset, 'HH:mm')}
                </div>
                <p className="text-muted-foreground text-xs mt-0.5">
                  {Math.floor(sunInfo.dayLength / 60)}h {sunInfo.dayLength % 60}m daylight
                </p>
              </>
            ) : <p className="text-muted-foreground">—</p>}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wide mb-2">
              <Gauge className="h-3 w-3" /> Pressure
            </div>
            <p className="text-2xl font-bold">{Math.round(representative.mslp)}</p>
            <p className="text-muted-foreground text-xs mt-0.5">hPa</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wide mb-2">
              <Eye className="h-3 w-3" /> Visibility
            </div>
            <p className="text-2xl font-bold">{visibilityLabel(representative.visibility)}</p>
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs mt-0.5">
              <Droplets className="h-3 w-3" /> {Math.round(representative.humidity)}% humidity
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Hourly strip */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <p className="text-muted-foreground text-xs uppercase tracking-wide mb-3">
            {isToday ? 'Next 12 hours' : format(selectedDay, 'EEEE — all day')}
          </p>
          <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
            {stripForecasts.map((f, i) => {
              const w = getWeatherInfo(f.significantWeatherCode);
              const HourIcon = w.Icon;
              const kts = msToKnots(f.windSpeed10m);
              const bfc = beaufortScale(kts);
              return (
                <div key={i} className="flex flex-col items-center gap-1 min-w-[52px]">
                  <span className="text-muted-foreground text-xs">
                    {isToday && i === 0 ? 'Now' : format(f.time, 'HH:mm')}
                  </span>
                  <HourIcon className="h-5 w-5 text-primary" strokeWidth={1.5} />
                  <span className="text-foreground text-sm font-medium">{Math.round(f.screenTemperature)}°</span>
                  <span className={`text-xs font-medium ${beaufortColor(bfc.force)}`}>{Math.round(kts)}kt</span>
                  <span className="text-blue-500 text-xs">{f.probOfPrecipitation}%</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
