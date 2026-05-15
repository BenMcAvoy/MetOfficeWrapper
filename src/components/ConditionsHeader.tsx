import type { HourlyForecast, SunInfo } from '@/lib/api';
import { getWeatherInfo } from '@/lib/weatherCodes';
import { useNow } from '@/lib/useNow';
import { isSameDay, isAfter, isBefore } from 'date-fns';

interface ConditionsHeaderProps {
  forecasts: HourlyForecast[];
  selectedDay: Date;
  sunInfo: SunInfo | null;
}

function formatHM(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function sunPhrase(now: Date, sun: SunInfo | null): string | null {
  if (!sun) return null;
  const nowMs = now.getTime();
  const sunriseMs = sun.sunrise.getTime();
  const sunsetMs = sun.sunset.getTime();

  if (nowMs < sunriseMs) {
    return `Sunrise in ${formatHM(Math.round((sunriseMs - nowMs) / 60000))}`;
  }
  if (nowMs < sunsetMs) {
    return `Sunset in ${formatHM(Math.round((sunsetMs - nowMs) / 60000))}`;
  }
  return 'After sunset';
}

export default function ConditionsHeader({ forecasts, selectedDay, sunInfo }: ConditionsHeaderProps) {
  const nowMs = useNow(60_000);
  const now = new Date(nowMs);
  const isToday = isSameDay(selectedDay, now);

  if (!forecasts.length) return null;

  // For today, use the current hour's forecast; otherwise use midday.
  const sameDay = forecasts.filter(f => isSameDay(f.time, selectedDay));
  const target = isToday
    ? sameDay.find(f => isAfter(f.time, now) || !isBefore(f.time, now)) ?? sameDay[0]
    : sameDay.find(f => f.time.getHours() === 12) ?? sameDay[Math.floor(sameDay.length / 2)];
  if (!target) return null;

  const wi = getWeatherInfo(target.significantWeatherCode);
  const Icon = wi.Icon;

  const maxTemp = Math.round(Math.max(...sameDay.map(f => f.screenTemperature)));
  const minTemp = Math.round(Math.min(...sameDay.map(f => f.screenTemperature)));
  const temp = Math.round(target.screenTemperature);
  const feels = Math.round(target.feelsLikeTemp);

  const sun = isToday ? sunPhrase(now, sunInfo) : null;

  return (
    <div className="flex items-center gap-3 px-1 pt-1">
      <Icon className="h-12 w-12 text-primary shrink-0" strokeWidth={1.5} aria-hidden />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          {isToday ? (
            <span className="font-display text-3xl font-semibold tabular-nums tracking-tight">{temp}°</span>
          ) : (
            <>
              <span className="font-display text-3xl font-semibold tabular-nums tracking-tight">{maxTemp}°</span>
              <span className="text-muted-foreground text-lg tabular-nums">/ {minTemp}°</span>
            </>
          )}
          <span className="text-sm text-foreground/80 truncate">{wi.description}</span>
        </div>
        <p className="text-muted-foreground text-xs mt-0.5 truncate">
          {isToday ? (
            <>
              Feels {feels}° · High {maxTemp}° / Low {minTemp}°
              {sun ? <> · {sun}</> : null}
            </>
          ) : (
            <>Forecast condition · feels {feels}°</>
          )}
        </p>
      </div>
    </div>
  );
}
