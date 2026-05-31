import { useState, useEffect } from 'react';
import type { HourlyForecast } from '@/lib/api';
import type { RaceEvent } from '@/lib/calendar';
import { RACE_CALENDAR, getEventsForDay } from '@/lib/calendar';
import { convertWind, windUnitLabel, beaufortScale, beaufortColor, beaufortBg, degreesToCardinal } from '@/lib/units';
import { useSettings } from '@/lib/settings';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, ArrowUp, Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { format, isSameDay, startOfDay, startOfMonth, addMonths, getDaysInMonth, getDay } from 'date-fns';

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const EVENT_DATES = new Set(RACE_CALENDAR.map(e => e.date));

function MonthGrid({ month, selectedDay, onSelect }: {
  month: Date;
  selectedDay: Date;
  onSelect: (d: Date) => void;
}) {
  const firstDay = startOfMonth(month);
  const daysInMonth = getDaysInMonth(month);
  const startDow = (getDay(firstDay) + 6) % 7;

  const cells: (Date | null)[] = [
    ...Array(startDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1)),
  ];

  const today = startOfDay(new Date());

  return (
    <div>
      <div className="grid grid-cols-7 mb-1">
        {['M','T','W','T','F','S','S'].map((d, i) => (
          <span key={i} className="text-center text-xs text-muted-foreground py-1">{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((date, i) => {
          if (!date) return <span key={i} />;
          const key = dateKey(date);
          const hasEvents = EVENT_DATES.has(key);
          const isSelected = isSameDay(date, selectedDay);
          const isToday = isSameDay(date, today);
          return (
            <button
              key={i}
              onClick={() => onSelect(date)}
              className={`relative flex flex-col items-center py-1.5 rounded-md text-xs font-medium transition-colors
                ${isSelected ? 'bg-primary text-primary-foreground' : isToday ? 'bg-muted' : 'hover:bg-muted/60'}
                ${!hasEvents && !isSelected ? 'text-muted-foreground' : ''}
              `}
            >
              {date.getDate()}
              {hasEvents && (
                <span className={`h-1 w-1 rounded-full mt-0.5 ${isSelected ? 'bg-primary-foreground' : 'bg-primary'}`} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MonthCalendarModal({ selectedDay, onSelect, onClose }: {
  selectedDay: Date;
  onSelect: (d: Date) => void;
  onClose: () => void;
}) {
  const [month, setMonth] = useState<Date>(startOfMonth(selectedDay));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-30 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in-0 duration-150"
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full sm:max-w-sm bg-background border border-border/60 rounded-t-2xl sm:rounded-2xl shadow-xl p-4 animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMonth(m => addMonths(m, -1))}
              className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold min-w-[8rem] text-center">{format(month, 'MMMM yyyy')}</span>
            <button
              onClick={() => setMonth(m => addMonths(m, 1))}
              className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1 text-muted-foreground hover:text-foreground rounded">
            <X className="h-4 w-4" />
          </button>
        </div>
        <MonthGrid
          month={month}
          selectedDay={selectedDay}
          onSelect={d => { onSelect(d); onClose(); }}
        />
        <p className="text-[11px] text-muted-foreground mt-3 text-center">Days with a dot have scheduled events.</p>
      </div>
    </div>
  );
}

export function CalendarButton({ selectedDay, onSelectDay }: {
  selectedDay: Date;
  onSelectDay: (d: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Browse events calendar"
        className="shrink-0 flex items-center justify-center min-h-10 w-10 rounded-full text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted/70 transition-colors active:scale-[0.97]"
      >
        <Calendar className="h-4 w-4" strokeWidth={2.25} />
      </button>
      {open && (
        <MonthCalendarModal
          selectedDay={selectedDay}
          onSelect={onSelectDay}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

const EVENT_BREAKDOWN_PRE_MS = 30 * 60 * 1000;
const EVENT_BREAKDOWN_POST_MS = 150 * 60 * 1000;

function getEventDateTime(event: RaceEvent): Date | null {
  if (!event.time) return null;
  const [year, month, day] = event.date.split('-').map(Number);
  const [hours, minutes] = event.time.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

function EventHourlyBreakdown({ event, forecasts }: { event: RaceEvent; forecasts: HourlyForecast[] }) {
  const { windUnit } = useSettings();
  const unitLabel = windUnitLabel(windUnit);
  const start = getEventDateTime(event);
  const rows = start
    ? forecasts.filter(f => {
        const t = f.time.getTime();
        return t >= start.getTime() - EVENT_BREAKDOWN_PRE_MS && t <= start.getTime() + EVENT_BREAKDOWN_POST_MS;
      })
    : [];
  const disp = (ms: number) => Math.round(convertWind(ms, windUnit));

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-border/70 bg-muted/20">
      <div className="grid grid-cols-[3rem_2rem_3.5rem_1fr_1fr_3rem] gap-2 px-3 py-2 text-xs text-muted-foreground uppercase tracking-wide">
        <span>Time</span>
        <span></span>
        <span>Dir</span>
        <span>Avg</span>
        <span className="text-[var(--chart-gust)]">Gust</span>
        <span>BF</span>
      </div>
      {rows.length ? (
        <div className="divide-y divide-border/60">
          {rows.map((forecast, i) => {
            const avgKnots = forecast.windSpeed10m * 1.94384449;
            const bf = beaufortScale(avgKnots);
            return (
              <div key={i} className="grid grid-cols-[3rem_2rem_3.5rem_1fr_1fr_3rem] gap-2 px-3 py-2 items-center text-sm">
                <span className="text-xs tabular-nums text-muted-foreground">{format(forecast.time, 'HH:mm')}</span>
                <ArrowUp
                  className="h-4 w-4 text-primary"
                  style={{ transform: `rotate(${forecast.windDirectionFrom10m + 180}deg)` }}
                  strokeWidth={2.5}
                />
                <span className="text-xs text-muted-foreground">{degreesToCardinal(forecast.windDirectionFrom10m)}</span>
                <span className={`font-semibold tabular-nums ${beaufortColor(bf.force)}`}>
                  {disp(forecast.windSpeed10m)} {unitLabel}
                </span>
                <span className="font-semibold tabular-nums text-[var(--chart-gust)]">
                  {disp(forecast.windGustSpeed10m)} {unitLabel}
                </span>
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded text-center ${beaufortBg(bf.force)}`}>
                  F{bf.force}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="px-3 py-3 text-xs text-muted-foreground">No hourly wind data for this event.</p>
      )}
    </div>
  );
}

function EventRow({
  event,
  selectable,
  onSelect,
}: {
  event: RaceEvent;
  selectable: boolean;
  onSelect: () => void;
}) {
  const content = (
    <>
      {event.time ? (
        <span className="shrink-0 w-14 text-center text-xs font-semibold tabular-nums px-2 py-1 rounded bg-primary/10 text-primary">
          {event.time}
        </span>
      ) : (
        <span className="shrink-0 w-14 text-center text-[10px] uppercase tracking-wide font-medium px-2 py-1 rounded bg-muted text-muted-foreground">
          All day
        </span>
      )}
      <div className="min-w-0 flex-1 text-left">
        <p className="text-sm font-medium leading-tight">{event.name}</p>
        {event.classes && (
          <p className="text-xs text-muted-foreground leading-tight mt-0.5">Classes: {event.classes}</p>
        )}
      </div>
      {selectable && (
        <ChevronRight
          className="h-4 w-4 shrink-0 text-muted-foreground"
          strokeWidth={2.25}
        />
      )}
    </>
  );

  if (selectable) {
    return (
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full items-center gap-3 py-2 text-left transition-colors hover:bg-muted/30"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3 py-2">
      {content}
    </div>
  );
}

export function EventDetailsPage({
  event,
  selectedDay,
  hourlyForecasts,
  onBack,
}: {
  event: RaceEvent;
  selectedDay: Date;
  hourlyForecasts: HourlyForecast[];
  onBack: () => void;
}) {
  return (
    <div className="space-y-3 animate-in fade-in-50 duration-300">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={2.25} />
        Event Details
      </button>
      <Card>
        <CardContent className="py-4 px-4">
          <div className="flex items-start gap-3">
            {event.time ? (
              <span className="shrink-0 w-14 text-center text-xs font-semibold tabular-nums px-2 py-1 rounded bg-primary/10 text-primary">
                {event.time}
              </span>
            ) : (
              <span className="shrink-0 w-14 text-center text-[10px] uppercase tracking-wide font-medium px-2 py-1 rounded bg-muted text-muted-foreground">
                All day
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold leading-tight">{event.name}</p>
              {event.classes && (
                <p className="text-xs text-muted-foreground leading-tight mt-1">Classes: {event.classes}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">{format(getEventDateTime(event) ?? selectedDay, 'EEEE d MMMM')}</p>
            </div>
          </div>
          <EventHourlyBreakdown event={event} forecasts={hourlyForecasts} />
        </CardContent>
      </Card>
    </div>
  );
}

export function DayEventsCard({ selectedDay, onSelectEvent }: { selectedDay: Date; onSelectEvent?: (event: RaceEvent) => void }) {
  const events = getEventsForDay(selectedDay);
  if (!events.length) return null;

  return (
    <Card>
      <CardContent className="py-2 px-4">
        <div className="flex items-baseline justify-between gap-3 mb-0.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Event Details
          </p>
          <p className="text-[11px] text-muted-foreground">
            {events.length === 1 ? '1 event' : `${events.length} events`}
          </p>
        </div>
        <div className="divide-y divide-border/60">
          {events.map((event, i) => {
            return (
              <div key={i}>
                <EventRow
                  event={event}
                  selectable={!!onSelectEvent}
                  onSelect={() => onSelectEvent?.(event)}
                />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
