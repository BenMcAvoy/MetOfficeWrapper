import type { HourlyForecast } from '@/lib/api';
import { isSameDay, isBefore, startOfHour } from 'date-fns';

export function filterForDay(forecasts: HourlyForecast[], day: Date, now: Date = new Date()): HourlyForecast[] {
  const isToday = isSameDay(day, now);
  const hourStart = startOfHour(now);
  return forecasts.filter(f =>
    isToday
      ? isSameDay(f.time, day) && !isBefore(f.time, hourStart)
      : isSameDay(f.time, day),
  );
}
