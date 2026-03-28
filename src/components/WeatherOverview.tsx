import type { HourlyForecast, SunInfo } from '@/lib/api';
import { msToKnots, beaufortScale, beaufortColor, degreesToCardinal } from '@/lib/units';
import { getWeatherInfo, visibilityLabel } from '@/lib/weatherCodes';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Wind, CloudRain, Sunrise, Sunset } from 'lucide-react';
import { format, isSameDay } from 'date-fns';

interface WeatherOverviewProps {
  forecasts: HourlyForecast[];
  allForecasts: HourlyForecast[];
  sunInfo: SunInfo | null;
  selectedDay: Date;
}

function StatRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex justify-between items-center py-1.5">
      <span className="text-muted-foreground text-sm">{label}</span>
      <div className="text-right">
        <span className="text-foreground text-sm font-medium">{value}</span>
        {sub && <span className="text-muted-foreground text-xs ml-1">{sub}</span>}
      </div>
    </div>
  );
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
  const bf = beaufortScale(knotsAvg);
  const dayAvgBf = beaufortScale(msToKnots(avgWind));
  const peakBf = beaufortScale(msToKnots(maxGust));

  const stripForecasts = isToday ? allForecasts.slice(0, 13) : forecasts;

  return (
    <div className="space-y-3">
      {/* Hero card */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex items-start justify-between">
            <div>
              {isToday ? (
                <>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-5xl font-bold">{Math.round(representative.screenTemperature)}°</span>
                    <span className="text-muted-foreground text-lg">C</span>
                  </div>
                  <p className="text-foreground text-base">{weather.description}</p>
                  <p className="text-muted-foreground text-sm mt-0.5">Feels like {Math.round(representative.feelsLikeTemp)}°C</p>
                </>
              ) : (
                <>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-4xl font-bold">{Math.round(minTemp)}°</span>
                    <span className="text-muted-foreground">–</span>
                    <span className="text-4xl font-bold">{Math.round(maxTemp)}°</span>
                    <span className="text-muted-foreground text-lg">C</span>
                  </div>
                  <p className="text-foreground text-base">{weather.description}</p>
                  <p className="text-muted-foreground text-sm mt-0.5">{format(selectedDay, 'EEEE d MMMM')}</p>
                </>
              )}
            </div>
            <WeatherIcon className="h-14 w-14 text-primary" strokeWidth={1.25} />
          </div>

          <Separator className="my-3" />

          <div className="grid grid-cols-2 gap-x-4">
            {isToday ? (
              <>
                <StatRow label="Wind" value={`${Math.round(knotsAvg)} / ${Math.round(knotsGust)} kts`} sub={`F${bf.force}`} />
                <StatRow label="Direction" value={`${degreesToCardinal(representative.windDirectionFrom10m)} ${Math.round(representative.windDirectionFrom10m)}°`} />
                <StatRow label="Pressure" value={`${Math.round(representative.mslp)} hPa`} />
                <StatRow label="Humidity" value={`${Math.round(representative.humidity)}%`} />
                <StatRow label="UV Index" value={representative.uvIndex.toString()} />
                <StatRow label="Visibility" value={visibilityLabel(representative.visibility)} />
              </>
            ) : (
              <>
                <StatRow label="Avg wind" value={`${Math.round(msToKnots(avgWind))} kt`} sub={`F${dayAvgBf.force}`} />
                <StatRow label="Peak gust" value={`${Math.round(msToKnots(maxGust))} kt`} sub={`F${peakBf.force}`} />
                <StatRow label="Pressure" value={`${Math.round(representative.mslp)} hPa`} />
                <StatRow label="Humidity" value={`${Math.round(representative.humidity)}%`} />
                <StatRow label="UV Index" value={representative.uvIndex.toString()} />
                <StatRow label="Visibility" value={visibilityLabel(representative.visibility)} />
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Wind summary */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wide mb-2">
            <Wind className="h-3 w-3" /> {isToday ? 'Wind Now' : 'Wind Summary'}
          </div>
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className={`text-3xl font-bold ${beaufortColor(isToday ? bf.force : dayAvgBf.force)}`}>
                  {Math.round(isToday ? knotsAvg : msToKnots(avgWind))}
                </span>
                <span className="text-muted-foreground text-sm">kts {isToday ? '' : 'avg'}</span>
                <span className="text-orange-500 font-semibold text-xl ml-1">
                  {Math.round(isToday ? knotsGust : msToKnots(maxGust))}
                </span>
                <span className="text-muted-foreground text-sm">G</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className={`${beaufortColor(isToday ? bf.force : peakBf.force)} border-current text-xs`}>
                  Beaufort {isToday ? bf.force : peakBf.force}
                </Badge>
                <span className="text-muted-foreground text-xs">{isToday ? bf.description : peakBf.description}</span>
              </div>
            </div>
            <div className="ml-auto text-right">
              <p className="text-foreground font-medium">{degreesToCardinal(representative.windDirectionFrom10m)}</p>
              <p className="text-muted-foreground text-xs">{Math.round(representative.windDirectionFrom10m)}°</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Rain & Sun row */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wide mb-2">
              <CloudRain className="h-3 w-3" /> Rain {isToday ? '(12h)' : '(day)'}
            </div>
            <p className={`text-2xl font-bold ${maxRainProb > 60 ? 'text-blue-600 dark:text-blue-400' : 'text-foreground'}`}>
              {maxRainProb}%
            </p>
            <p className="text-muted-foreground text-xs mt-1">Max {maxPrecip.toFixed(1)} mm/hr</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wide mb-2">
              <Sunrise className="h-3 w-3" /> Sun
            </div>
            {sunInfo ? (
              <>
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Sunrise className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{format(sunInfo.sunrise, 'HH:mm')}</span>
                  <Sunset className="h-3.5 w-3.5 text-muted-foreground ml-1" />
                  <span>{format(sunInfo.sunset, 'HH:mm')}</span>
                </div>
                <p className="text-muted-foreground text-xs mt-1">
                  {Math.floor(sunInfo.dayLength / 60)}h {sunInfo.dayLength % 60}m daylight
                </p>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">—</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Hourly strip */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <p className="text-muted-foreground text-xs uppercase tracking-wide mb-3">
            {isToday ? 'Next 12 hours' : `${format(selectedDay, 'EEEE')} — all day`}
          </p>
          <div className="flex gap-3 overflow-x-auto pb-1">
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
                  <span className={`text-xs font-medium ${beaufortColor(bfc.force)}`}>
                    {Math.round(kts)}kt
                  </span>
                  <span className="text-blue-600 dark:text-blue-400 text-xs">{f.probOfPrecipitation}%</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
