import type { HourlyForecast, SunInfo, TideData, LiveWind } from '@/lib/api';
import { msToKnots, beaufortScale, beaufortColor, degreesToCardinal } from '@/lib/units';
import { getWeatherInfo, visibilityLabel } from '@/lib/weatherCodes';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { CloudRain, Sunrise, Sunset, Gauge, Droplets, Eye, ArrowUp, Waves, AlertTriangle, ShieldCheck, AlertCircle } from 'lucide-react';
import { format, isSameDay, isAfter, isBefore } from 'date-fns';

interface WeatherOverviewProps {
  forecasts: HourlyForecast[];
  allForecasts: HourlyForecast[];
  sunInfo: SunInfo | null;
  tideData: TideData | null;
  liveWind: LiveWind | null;
  selectedDay: Date;
}

function riskLabel(score: number): { label: string; color: string; Icon: React.ElementType } {
  if (score <= 2) return { label: 'Green', color: 'text-emerald-400', Icon: ShieldCheck };
  if (score <= 4) return { label: 'Caution', color: 'text-yellow-400', Icon: AlertCircle };
  return { label: 'High Risk', color: 'text-red-500', Icon: AlertTriangle };
}

export default function WeatherOverview({ forecasts, allForecasts, sunInfo, tideData, liveWind, selectedDay }: WeatherOverviewProps) {
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

  const liveAgeSeconds = liveWind
    ? Math.max(0, Math.round((Date.now() - liveWind.observedAt.getTime()) / 1000))
    : null;
  const hasFreshLiveWind = isToday && !!liveWind && liveAgeSeconds !== null && liveAgeSeconds <= 300;
  const currentWindKnots = hasFreshLiveWind && liveWind ? msToKnots(liveWind.windSpeedMs) : knotsAvg;
  const currentDirection = hasFreshLiveWind && liveWind ? liveWind.windDirectionDeg : representative.windDirectionFrom10m;
  const currentGustKnots = knotsGust;

  const daytimeForecasts = forecasts.filter(f => f.time.getHours() >= 9 && f.time.getHours() <= 18);
  const topWindDaytime = daytimeForecasts.length
    ? Math.max(...daytimeForecasts.map(f => msToKnots(f.windSpeed10m)))
    : Math.max(...forecasts.map(f => msToKnots(f.windSpeed10m)));

  const next6h = allForecasts.filter(f => {
    const now = new Date();
    return isAfter(f.time, now) && isBefore(f.time, new Date(now.getTime() + 6 * 60 * 60 * 1000));
  });
  const next6hRainPeak = next6h.length ? Math.max(...next6h.map(f => f.probOfPrecipitation)) : 0;
  const next6hGustPeak = next6h.length ? Math.max(...next6h.map(f => msToKnots(f.windGustSpeed10m))) : Math.round(knotsGust);

  const nextTide = tideData?.extremes.find(e => isAfter(e.time, new Date())) ?? null;
  const minutesToNextTide = nextTide ? Math.round((nextTide.time.getTime() - Date.now()) / 60000) : null;

  const riskScore = (
    (next6hGustPeak >= 28 ? 2 : next6hGustPeak >= 22 ? 1 : 0) +
    (next6hRainPeak >= 70 ? 2 : next6hRainPeak >= 45 ? 1 : 0) +
    (Math.round(currentWindKnots) >= 24 ? 2 : Math.round(currentWindKnots) >= 18 ? 1 : 0)
  );
  const risk = riskLabel(riskScore);
  const RiskIcon = risk.Icon;

  const bf = beaufortScale(isToday ? knotsAvg : msToKnots(avgWind));
  const bfGust = beaufortScale(isToday ? knotsGust : msToKnots(maxGust));

  const displayAvg = Math.round(isToday ? knotsAvg : msToKnots(avgWind));
  const displayGust = Math.round(isToday ? knotsGust : msToKnots(maxGust));

  const stripForecasts = isToday ? allForecasts.slice(0, 13) : forecasts;

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="pt-4 pb-4">
          <p className="text-muted-foreground text-xs uppercase tracking-wide mb-3">
            {isToday ? 'Sailing Dashboard' : `Day Snapshot · ${format(selectedDay, 'EEE d MMM')}`}
          </p>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="rounded-lg border p-3">
              <p className="text-muted-foreground text-xs mb-1">Now</p>
              <div className="flex items-center gap-1.5">
                <span className={`text-2xl font-bold ${beaufortColor(beaufortScale(currentWindKnots).force)}`}>{Math.round(currentWindKnots)}</span>
                <span className="text-muted-foreground text-sm">kt</span>
                <span className="text-muted-foreground text-xs">/{Math.round(currentGustKnots)}G</span>
              </div>
              <p className="text-muted-foreground text-xs mt-1">{degreesToCardinal(currentDirection)} {Math.round(currentDirection)}°</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-muted-foreground text-xs mb-1">Daytime Wind</p>
              <div className="flex items-center gap-1.5">
                <span className={`text-2xl font-bold ${beaufortColor(beaufortScale(topWindDaytime).force)}`}>{Math.round(topWindDaytime)}</span>
                <span className="text-muted-foreground text-sm">kt max</span>
              </div>
              <p className="text-muted-foreground text-xs mt-1">09:00–18:00 strongest avg</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-muted-foreground text-xs mb-1">Next 6h</p>
              <div className="flex items-center gap-1.5">
                <span className={`text-2xl font-bold ${next6hRainPeak >= 60 ? 'text-blue-500' : 'text-foreground'}`}>{next6hRainPeak}%</span>
                <span className="text-muted-foreground text-sm">rain peak</span>
              </div>
              <p className="text-muted-foreground text-xs mt-1">Gusts to {Math.round(next6hGustPeak)}kt</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-muted-foreground text-xs mb-1">Next Tide</p>
              {nextTide && minutesToNextTide !== null ? (
                <>
                  <div className="flex items-center gap-1.5">
                    <Waves className="h-4 w-4 text-primary" />
                    <span className="text-xl font-bold">{nextTide.type}</span>
                  </div>
                  <p className="text-muted-foreground text-xs mt-1">{format(nextTide.time, 'HH:mm')} · {minutesToNextTide >= 60 ? `${Math.floor(minutesToNextTide / 60)}h ${minutesToNextTide % 60}m` : `${minutesToNextTide}m`}</p>
                </>
              ) : (
                <p className="text-muted-foreground text-sm">No tide window</p>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between border-t pt-3">
            <div className="flex items-center gap-2">
              <RiskIcon className={`h-4 w-4 ${risk.color}`} />
              <span className={`text-sm font-semibold ${risk.color}`}>{risk.label}</span>
            </div>
            <p className="text-muted-foreground text-xs">
              {hasFreshLiveWind ? `Live ${format(liveWind!.observedAt, 'HH:mm:ss')}` : `Forecast ${format(representative.time, 'HH:mm')}`}
            </p>
          </div>
        </CardContent>
      </Card>

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
            {isToday ? 'Next 12 hours' : `${format(selectedDay, 'EEEE')} — all day`}
          </p>
          <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar touch-pan-x">
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
