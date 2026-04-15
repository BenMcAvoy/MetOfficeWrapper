import { useState } from 'react';
import type { HourlyForecast, TideData } from '@/lib/api';
import type { RaceEvent } from '@/lib/calendar';
import { RACE_CALENDAR, getEventsForDay } from '@/lib/calendar';
import { msToKnots, beaufortScale, beaufortColor, beaufortBg, degreesToCardinal } from '@/lib/units';
import { getWeatherInfo } from '@/lib/weatherCodes';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowUp, Calendar, ChevronLeft, ChevronRight, Clock, Wind, Waves } from 'lucide-react';
import { format, addMinutes, startOfDay, isSameDay, startOfMonth, addMonths, getDaysInMonth, getDay } from 'date-fns';
import { WindChart, TideChartInner } from '@/components/charts';

interface RaceCalendarProps {
  forecasts: HourlyForecast[];
  tideData: TideData | null;
}

function parseEventTime(date: Date, timeStr: string): Date {
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
}

function closestForecast(forecasts: HourlyForecast[], time: Date): HourlyForecast | null {
  if (!forecasts.length) return null;
  return forecasts.reduce((best, f) =>
    Math.abs(f.time.getTime() - time.getTime()) < Math.abs(best.time.getTime() - time.getTime()) ? f : best
  );
}

function EventWeatherView({ event, selectedDay, forecasts, tideData, onBack }: {
  event: RaceEvent;
  selectedDay: Date;
  forecasts: HourlyForecast[];
  tideData: TideData | null;
  onBack: () => void;
}) {
  if (!event.time) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <button onClick={onBack} className="flex items-center gap-1 text-muted-foreground hover:text-foreground text-xs mb-2 transition-colors">
            <ChevronLeft className="h-3.5 w-3.5" /> Back
          </button>
          <CardTitle className="text-sm">{event.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">No start time specified for this event.</p>
        </CardContent>
      </Card>
    );
  }

  const eventStart = parseEventTime(selectedDay, event.time);
  const windowStart = addMinutes(eventStart, -30);
  const windowEnd = addMinutes(eventStart, 150);

  const timeSlots = [
    { label: format(windowStart, 'HH:mm'), time: windowStart, role: 'Pre-race' },
    { label: event.time, time: eventStart, role: 'Warning signal', isStart: true },
    { label: format(addMinutes(eventStart, 60), 'HH:mm'), time: addMinutes(eventStart, 60), role: 'Racing' },
    { label: format(addMinutes(eventStart, 120), 'HH:mm'), time: addMinutes(eventStart, 120), role: 'Finish' },
    { label: format(windowEnd, 'HH:mm'), time: windowEnd, role: 'Post-race' },
  ];

  const windowForecasts = forecasts.filter(f => f.time >= windowStart && f.time <= windowEnd);

  const startForecast = closestForecast(forecasts, eventStart);
  const hasForecastData = forecasts.some(f => {
    const diff = Math.abs(f.time.getTime() - eventStart.getTime());
    return diff < 3 * 60 * 60 * 1000;
  });

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2">
          <button onClick={onBack} className="flex items-center gap-1 text-muted-foreground hover:text-foreground text-xs mb-1 transition-colors">
            <ChevronLeft className="h-3.5 w-3.5" /> Back to {format(selectedDay, 'd MMMM')}
          </button>
          <CardTitle className="text-sm leading-tight">{event.name}</CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
            <Clock className="h-3 w-3" />
            <span>{format(selectedDay, 'EEE d MMM')} · Warning signal {event.time} · 2hr window</span>
          </div>
          {event.classes && (
            <span className="text-xs text-muted-foreground">Classes: {event.classes}</span>
          )}
        </CardHeader>
      </Card>

      {!hasForecastData && (
        <Card>
          <CardContent className="py-6 text-center text-muted-foreground text-sm">
            Forecast not yet available for {format(selectedDay, 'd MMMM')}.
            <br />
            <span className="text-xs">Met Office provides up to 5 days ahead.</span>
          </CardContent>
        </Card>
      )}

      {hasForecastData && startForecast && (
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">At Start ({event.time})</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {(() => {
              const wi = getWeatherInfo(startForecast.significantWeatherCode);
              const Icon = wi.Icon;
              const kt = msToKnots(startForecast.windSpeed10m);
              const gustKt = msToKnots(startForecast.windGustSpeed10m);
              const bf = beaufortScale(kt);
              const gustBf = beaufortScale(gustKt);
              return (
                <div className="flex items-center gap-3">
                  <Icon className="h-8 w-8 text-primary shrink-0" strokeWidth={1.5} />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{wi.description}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-semibold tabular-nums ${beaufortColor(bf.force)}`}>{Math.round(kt)}kt</span>
                      <span className={`text-xs font-medium px-1 py-0.5 rounded leading-none ${beaufortBg(bf.force)}`}>F{bf.force}</span>
                      <ArrowUp className="h-3 w-3 text-muted-foreground" style={{ transform: `rotate(${startForecast.windDirectionFrom10m}deg)` }} strokeWidth={2.5} />
                      <span className={`text-xs font-semibold ${beaufortColor(gustBf.force)}`}>{Math.round(gustKt)}kt gust</span>
                      <span className="text-xs text-muted-foreground">{degreesToCardinal(startForecast.windDirectionFrom10m)}</span>
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <span>{Math.round(startForecast.screenTemperature)}°C</span>
                      <span>{startForecast.probOfPrecipitation}% rain</span>
                      <span>Vis {(startForecast.visibility / 1000).toFixed(1)}km</span>
                    </div>
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {hasForecastData && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">3-Hour Window</CardTitle>
          </CardHeader>
          <CardContent className="p-0 pb-1">
            <div className="grid grid-cols-[3rem_1.5rem_1fr_1fr_2.5rem] gap-x-2 px-4 pb-1.5 pt-1 text-xs text-muted-foreground">
              <span>Time</span><span></span><span>Avg wind</span><span>Gust</span><span>Rain</span>
            </div>
            <div className="divide-y divide-border">
              {timeSlots.map(({ label, time, role, isStart }) => {
                const fc = closestForecast(forecasts, time);
                if (!fc) return null;
                const kt = msToKnots(fc.windSpeed10m);
                const bf = beaufortScale(kt);
                const gustKt = msToKnots(fc.windGustSpeed10m);
                const gustBf = beaufortScale(gustKt);
                const wi = getWeatherInfo(fc.significantWeatherCode);
                const Icon = wi.Icon;
                return (
                  <div key={label} className={`grid grid-cols-[3rem_1.5rem_1fr_1fr_2.5rem] gap-x-2 px-4 py-2.5 items-center ${isStart ? 'bg-primary/5' : ''}`}>
                    <div>
                      <p className={`text-xs font-medium leading-tight ${isStart ? 'text-primary' : ''}`}>{label}</p>
                      <p className="text-muted-foreground text-xs leading-tight">{role}</p>
                    </div>
                    <Icon className="h-4 w-4 text-primary" strokeWidth={1.5} />
                    <div className="flex items-center gap-1.5">
                      <span className={`text-sm font-semibold tabular-nums ${beaufortColor(bf.force)}`}>{Math.round(kt)}kt</span>
                      <span className={`text-xs font-medium px-1 py-0.5 rounded leading-none ${beaufortBg(bf.force)}`}>F{bf.force}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <ArrowUp className="h-3 w-3 text-muted-foreground shrink-0" style={{ transform: `rotate(${fc.windDirectionFrom10m}deg)` }} strokeWidth={2.5} />
                      <span className={`text-xs font-semibold tabular-nums ${beaufortColor(gustBf.force)}`}>{Math.round(gustKt)}kt</span>
                    </div>
                    <span className={`text-xs font-medium tabular-nums text-right ${fc.probOfPrecipitation > 60 ? 'text-blue-500' : 'text-muted-foreground'}`}>
                      {fc.probOfPrecipitation}%
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {hasForecastData && windowForecasts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Wind className="h-4 w-4" /> Wind · Race Window
            </CardTitle>
          </CardHeader>
          <CardContent>
            <WindChart forecasts={windowForecasts} startRefLine={eventStart.getTime()} />
          </CardContent>
        </Card>
      )}

      {tideData && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Waves className="h-4 w-4" /> Tides · Race Window
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TideChartInner
              tideData={tideData}
              windowStart={windowStart}
              windowEnd={windowEnd}
              tickIntervalHours={1}
              startRefLine={eventStart.getTime()}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function getDatesWithEvents(): Set<string> {
  return new Set(RACE_CALENDAR.map(e => e.date));
}

const EVENT_DATES = getDatesWithEvents();

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function MonthCalendar({ month, selectedDay, onSelect }: {
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
              className={`relative flex flex-col items-center py-1 rounded-md text-xs font-medium transition-colors
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

export default function RaceCalendar({ forecasts, tideData }: RaceCalendarProps) {
  const [selectedDay, setSelectedDay] = useState<Date>(startOfDay(new Date()));
  const [currentMonth, setCurrentMonth] = useState<Date>(startOfMonth(new Date()));
  const [selectedEvent, setSelectedEvent] = useState<RaceEvent | null>(null);

  const events = getEventsForDay(selectedDay);

  if (selectedEvent) {
    return (
      <EventWeatherView
        event={selectedEvent}
        selectedDay={selectedDay}
        forecasts={forecasts}
        tideData={tideData}
        onBack={() => setSelectedEvent(null)}
      />
    );
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4" /> {format(currentMonth, 'MMMM yyyy')}
            </CardTitle>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentMonth(m => addMonths(m, -1))}
                className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setCurrentMonth(m => addMonths(m, 1))}
                className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <MonthCalendar
            month={currentMonth}
            selectedDay={selectedDay}
            onSelect={d => { setSelectedDay(d); setCurrentMonth(startOfMonth(d)); }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{format(selectedDay, 'EEEE d MMMM')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0 pb-1">
          {!events.length ? (
            <p className="text-center text-muted-foreground text-sm py-6 px-4">No events scheduled.</p>
          ) : (
            <div className="divide-y divide-border">
              {events.map((event, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedEvent(event)}
                  className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-tight">{event.name}</p>
                      {event.classes && (
                        <p className="text-xs text-muted-foreground mt-0.5">Classes: {event.classes}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      {event.time ? (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Wind className="h-3 w-3" />
                          <span>{event.time}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">All day</span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
