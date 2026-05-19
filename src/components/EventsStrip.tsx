import { useState, useEffect } from 'react';
import type { RaceEvent } from '@/lib/calendar';
import { RACE_CALENDAR, getEventsForDay } from '@/lib/calendar';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';
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

function EventRow({ event }: { event: RaceEvent }) {
  return (
    <div className="flex items-center gap-3 py-2">
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
        <p className="text-sm font-medium leading-tight">{event.name}</p>
        {event.classes && (
          <p className="text-xs text-muted-foreground leading-tight mt-0.5">Classes: {event.classes}</p>
        )}
      </div>
    </div>
  );
}

export function DayEventsCard({ selectedDay }: { selectedDay: Date }) {
  const events = getEventsForDay(selectedDay);
  if (!events.length) return null;

  return (
    <Card>
      <CardContent className="py-2 px-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-0.5">
          {events.length === 1 ? '1 event' : `${events.length} events`}
        </p>
        <div className="divide-y divide-border/60">
          {events.map((event, i) => <EventRow key={i} event={event} />)}
        </div>
      </CardContent>
    </Card>
  );
}
