import { forwardRef, useImperativeHandle, useState } from 'react';
import { useSwipe } from '@/lib/useSwipe';
import type { HourlyForecast, TideData, LiveWindHistoryPoint } from '@/lib/api';
import type { RaceEvent, EventCategory } from '@/lib/calendar';
import { RACE_CALENDAR, getEventsForDay, getEventCategory, sortEventsByCategory } from '@/lib/calendar';
import { msToKnots, convertWind, windUnitLabel, beaufortScale, beaufortColor, beaufortBg } from '@/lib/units';
import { useSettings } from '@/lib/settings';
import { getWeatherInfo, getWeatherIconColor } from '@/lib/weatherCodes';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowUp, Calendar, ChevronLeft, ChevronRight, Clock, Waves, Trophy, Sailboat, Anchor, Sparkles, GraduationCap, Megaphone, Users, Sun, Ship, Target, Crosshair, Star } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { format, addMinutes, startOfDay, endOfDay, isSameDay, startOfMonth, addMonths, getDaysInMonth, getDay } from 'date-fns';
import { TideChartInner } from '@/components/charts';
import WindChartCard from '@/components/WindChartCard';
import { haptic } from '@/lib/haptics';

interface RaceCalendarProps {
  forecasts: HourlyForecast[];
  tideData: TideData | null;
  liveWindHistory: LiveWindHistoryPoint[];
}

export interface RaceCalendarHandle {
  popToRoot: () => void;
}

interface CategoryStyle {
  Icon: LucideIcon;
  label: string;
  // CSS var driving the icon colour. Featured categories also use this for the
  // thin left bar and a tinted row background (same pattern as the WindCard
  // "current hour" highlight, just per-accent).
  accent: string | null;
  accentBg: string | null;
}

const CATEGORY_STYLES: Record<EventCategory, CategoryStyle> = {
  trophy:   { Icon: Trophy,        label: 'Trophy',   accent: 'var(--accent-gold)',     accentBg: 'var(--accent-gold-bg)' },
  pursuit:  { Icon: Crosshair,     label: 'Pursuit',  accent: 'var(--accent-gold)',     accentBg: 'var(--accent-gold-bg)' },
  special:  { Icon: Star,          label: 'Special',  accent: 'var(--accent-gold)',     accentBg: 'var(--accent-gold-bg)' },
  holiday:  { Icon: Sun,           label: 'Holiday',  accent: 'var(--warn)',            accentBg: 'var(--warn-bg)' },
  pyra:     { Icon: Ship,          label: 'PYRA',     accent: 'var(--accent-offshore)', accentBg: 'var(--accent-offshore-bg)' },
  open:     { Icon: Sparkles,      label: 'Open',     accent: 'var(--primary)',         accentBg: 'oklch(from var(--primary) l c h / 0.08)' },
  cruiser:  { Icon: Anchor,        label: 'Cruiser',  accent: 'var(--accent-offshore)', accentBg: null },
  dinghy:   { Icon: Sailboat,      label: 'Dinghy',   accent: 'var(--accent-fresh)',    accentBg: null },
  laser:    { Icon: Sailboat,      label: 'Laser',    accent: 'var(--accent-fresh)',    accentBg: null },
  youth:    { Icon: GraduationCap, label: 'Youth',    accent: null,                     accentBg: null },
  training: { Icon: Target,        label: 'Training', accent: null,                     accentBg: null },
  briefing: { Icon: Megaphone,     label: 'Briefing', accent: null,                     accentBg: null },
  social:   { Icon: Users,         label: 'Social',   accent: null,                     accentBg: null },
};

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

function AllDayEventView({ event, selectedDay, forecasts, tideData, liveWindHistory, onBack }: {
  event: RaceEvent;
  selectedDay: Date;
  forecasts: HourlyForecast[];
  tideData: TideData | null;
  liveWindHistory: LiveWindHistoryPoint[];
  onBack: () => void;
}) {
  const { windUnit } = useSettings();
  const unitLabel = windUnitLabel(windUnit);
  const dayStart = startOfDay(selectedDay);
  const dayEnd = endOfDay(selectedDay);
  const isToday = isSameDay(selectedDay, new Date());

  const dayForecasts = forecasts.filter(f => f.time >= dayStart && f.time <= dayEnd);
  const dayLive = isToday
    ? liveWindHistory.filter(p => p.time >= dayStart && p.time <= dayEnd)
    : [];

  const hasForecastData = dayForecasts.length > 0;

  // Pick a representative midday forecast for the headline condition.
  const noon = new Date(selectedDay);
  noon.setHours(12, 0, 0, 0);
  const rep = closestForecast(dayForecasts.length ? dayForecasts : forecasts, noon);

  let maxTemp: number | null = null;
  let minTemp: number | null = null;
  let avgWindKt: number | null = null;
  let peakGustKt: number | null = null;
  let avgWindMsOut: number | null = null;
  let peakGustMsOut: number | null = null;
  let peakGustEntry: HourlyForecast | null = null;
  let maxRainProb = 0;
  if (dayForecasts.length) {
    maxTemp = Math.round(Math.max(...dayForecasts.map(f => f.screenTemperature)));
    minTemp = Math.round(Math.min(...dayForecasts.map(f => f.screenTemperature)));
    const avgWindMs = dayForecasts.reduce((s, f) => s + f.windSpeed10m, 0) / dayForecasts.length;
    avgWindKt = msToKnots(avgWindMs);
    avgWindMsOut = avgWindMs;
    const peakGustMs = Math.max(...dayForecasts.map(f => f.windGustSpeed10m));
    peakGustEntry = dayForecasts.find(f => f.windGustSpeed10m === peakGustMs) ?? null;
    peakGustKt = msToKnots(peakGustMs);
    peakGustMsOut = peakGustMs;
    maxRainProb = Math.max(...dayForecasts.map(f => f.probOfPrecipitation));
  }

  return (
    <div className="space-y-3">
      <button
        onClick={onBack}
        className="-ml-2 -mt-1 flex items-center gap-0.5 text-primary text-sm font-medium px-2 py-1.5 rounded-lg active:bg-primary/10 active:scale-[0.97] transition-all"
      >
        <ChevronLeft className="h-5 w-5" strokeWidth={2.5} />
        <span>{format(selectedDay, 'd MMM')}</span>
      </button>
      {(() => {
        const style = CATEGORY_STYLES[getEventCategory(event)];
        const Icon = style.Icon;
        return (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide font-medium" style={{ color: style.accent ?? 'var(--muted-foreground)' }}>
                <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                <span>{style.label}</span>
                <span className="text-muted-foreground/40">·</span>
                <span className="text-muted-foreground">All day</span>
              </div>
              <CardTitle className="text-base leading-tight mt-1">{event.name}</CardTitle>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                <Clock className="h-3 w-3" />
                <span>{format(selectedDay, 'EEEE d MMM')}</span>
              </div>
              {event.classes && (
                <p className="text-xs text-muted-foreground mt-0.5">Classes: {event.classes}</p>
              )}
            </CardHeader>
          </Card>
        );
      })()}

      {!hasForecastData && (
        <Card>
          <CardContent className="py-6 text-center text-muted-foreground text-sm">
            Forecast not yet available for {format(selectedDay, 'd MMMM')}.
            <br />
            <span className="text-xs">The selected forecast source provides up to 7 days ahead.</span>
          </CardContent>
        </Card>
      )}

      {hasForecastData && rep && (() => {
        const wi = getWeatherInfo(rep.significantWeatherCode);
        const Icon = wi.Icon;
        return (
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <Icon className="h-10 w-10 shrink-0" strokeWidth={1.5} style={{ color: getWeatherIconColor(rep.significantWeatherCode) }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-tight">Day outlook · {wi.description}</p>
                  <div className="flex gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                    {maxTemp !== null && minTemp !== null && <span>{maxTemp}° / {minTemp}°</span>}
                    <span>{maxRainProb}% rain peak</span>
                    {rep.visibility > 0 && <span>Vis {(rep.visibility / 1000).toFixed(1)}km</span>}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {hasForecastData && avgWindKt !== null && peakGustKt !== null && (() => {
        const avgBf = beaufortScale(avgWindKt);
        const peakBf = beaufortScale(peakGustKt);
        return (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">Day Wind Summary</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Day Avg</p>
                  <div className="flex items-baseline gap-1.5">
                    <span className={`font-display text-3xl font-semibold tabular-nums ${beaufortColor(avgBf.force)}`}>{Math.round(convertWind(avgWindMsOut ?? 0, windUnit))}</span>
                    <span className="text-muted-foreground text-xs">{unitLabel}</span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${beaufortBg(avgBf.force)}`}>F{avgBf.force}</span>
                  </div>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Peak Gust</p>
                  <div className="flex items-baseline gap-1.5">
                    <span className={`font-display text-3xl font-semibold tabular-nums ${beaufortColor(peakBf.force)}`}>{Math.round(convertWind(peakGustMsOut ?? 0, windUnit))}</span>
                    <span className="text-muted-foreground text-xs">{unitLabel}</span>
                    {peakGustEntry && (
                      <span className="text-muted-foreground text-[11px]">@ {format(peakGustEntry.time, 'HH:mm')}</span>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {hasForecastData && (
        <WindChartCard
          title="Wind · All Day"
          forecasts={dayForecasts}
          liveWindHistory={dayLive}
          includePastHours={0}
        />
      )}

      {tideData && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Waves className="h-4 w-4" /> Tides · {format(selectedDay, 'd MMM')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TideChartInner
              tideData={tideData}
              windowStart={dayStart}
              windowEnd={dayEnd}
              tickIntervalHours={3}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function EventWeatherView({ event, selectedDay, forecasts, tideData, liveWindHistory, onBack }: {
  event: RaceEvent;
  selectedDay: Date;
  forecasts: HourlyForecast[];
  tideData: TideData | null;
  liveWindHistory: LiveWindHistoryPoint[];
  onBack: () => void;
}) {
  const { windUnit } = useSettings();
  const unitLabel = windUnitLabel(windUnit);

  if (!event.time) {
    return (
      <AllDayEventView
        event={event}
        selectedDay={selectedDay}
        forecasts={forecasts}
        tideData={tideData}
        liveWindHistory={liveWindHistory}
        onBack={onBack}
      />
    );
  }

  const eventStart = parseEventTime(selectedDay, event.time);
  // Pad the chart window slightly: 1h before for context, 2.5h after for race + cooldown.
  const chartStart = addMinutes(eventStart, -60);
  const windowStart = addMinutes(eventStart, -30);
  const windowEnd = addMinutes(eventStart, 150);

  const timeSlots = [
    { label: format(windowStart, 'HH:mm'), time: windowStart },
    { label: event.time, time: eventStart, isStart: true },
    { label: format(addMinutes(eventStart, 60), 'HH:mm'), time: addMinutes(eventStart, 60) },
    { label: format(addMinutes(eventStart, 120), 'HH:mm'), time: addMinutes(eventStart, 120) },
    { label: format(windowEnd, 'HH:mm'), time: windowEnd },
  ];

  const isToday = isSameDay(selectedDay, new Date());
  const windowForecasts = forecasts.filter(f => f.time >= chartStart && f.time <= windowEnd);
  // Only include live observations that fall inside this race chart window — outside that
  // they're irrelevant to a race-window comparison and just add noise to the chart.
  const windowLiveHistory = isToday
    ? liveWindHistory.filter(p => p.time >= chartStart && p.time <= windowEnd)
    : [];

  const startForecast = closestForecast(forecasts, eventStart);
  const hasForecastData = forecasts.some(f => {
    const diff = Math.abs(f.time.getTime() - eventStart.getTime());
    return diff < 3 * 60 * 60 * 1000;
  });

  return (
    <div className="space-y-3">
      <button
        onClick={onBack}
        className="-ml-2 -mt-1 flex items-center gap-0.5 text-primary text-sm font-medium px-2 py-1.5 rounded-lg active:bg-primary/10 active:scale-[0.97] transition-all"
      >
        <ChevronLeft className="h-5 w-5" strokeWidth={2.5} />
        <span>{format(selectedDay, 'd MMM')}</span>
      </button>
      {(() => {
        const style = CATEGORY_STYLES[getEventCategory(event)];
        const Icon = style.Icon;
        return (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide font-medium" style={{ color: style.accent ?? 'var(--muted-foreground)' }}>
                <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                <span>{style.label}</span>
                <span className="text-muted-foreground/40">·</span>
                <span className="text-muted-foreground">Start {event.time}</span>
              </div>
              <CardTitle className="text-base leading-tight mt-1">{event.name}</CardTitle>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                <Clock className="h-3 w-3" />
                <span>{format(selectedDay, 'EEE d MMM')} · 2hr window</span>
              </div>
              {event.classes && (
                <p className="text-xs text-muted-foreground mt-0.5">Classes: {event.classes}</p>
              )}
            </CardHeader>
          </Card>
        );
      })()}

      {!hasForecastData && (
        <Card>
          <CardContent className="py-6 text-center text-muted-foreground text-sm">
            Forecast not yet available for {format(selectedDay, 'd MMMM')}.
            <br />
            <span className="text-xs">The selected forecast source provides up to 7 days ahead.</span>
          </CardContent>
        </Card>
      )}

      {hasForecastData && startForecast && (() => {
        const wi = getWeatherInfo(startForecast.significantWeatherCode);
        const Icon = wi.Icon;
        return (
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <Icon className="h-10 w-10 shrink-0" strokeWidth={1.5} style={{ color: getWeatherIconColor(startForecast.significantWeatherCode) }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-tight">At start · {wi.description}</p>
                  <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                    <span>{Math.round(startForecast.screenTemperature)}°C</span>
                    <span>{startForecast.probOfPrecipitation}% rain</span>
                    <span>Vis {(startForecast.visibility / 1000).toFixed(1)}km</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

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
              {timeSlots.map(({ label, time, isStart }) => {
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
                      {isStart && <p className="text-muted-foreground text-xs leading-tight">Start</p>}
                    </div>
                    <Icon className="h-4 w-4" strokeWidth={1.5} style={{ color: getWeatherIconColor(fc.significantWeatherCode) }} />
                    <div className="flex items-center gap-1.5">
                      <span className={`text-sm font-semibold tabular-nums ${beaufortColor(bf.force)}`}>{Math.round(convertWind(fc.windSpeed10m, windUnit))}{unitLabel}</span>
                      <span className={`text-xs font-medium px-1 py-0.5 rounded leading-none ${beaufortBg(bf.force)}`}>F{bf.force}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <ArrowUp className="h-3 w-3 text-muted-foreground shrink-0" style={{ transform: `rotate(${fc.windDirectionFrom10m + 180}deg)` }} strokeWidth={2.5} />
                      <span className={`text-xs font-semibold tabular-nums ${beaufortColor(gustBf.force)}`}>{Math.round(convertWind(fc.windGustSpeed10m, windUnit))}{unitLabel}</span>
                    </div>
                    <span className={`text-xs font-medium tabular-nums text-right ${fc.probOfPrecipitation > 60 ? 'text-primary' : 'text-muted-foreground'}`}>
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
        <WindChartCard
          title="Wind · Race Window"
          forecasts={windowForecasts}
          startRefLine={eventStart.getTime()}
          liveWindHistory={windowLiveHistory}
          includePastHours={0}
        />
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
              onClick={() => { haptic('light'); onSelect(date); }}
              className={`relative flex flex-col items-center py-1 rounded-md text-xs font-medium active:scale-95 transition-all
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

function EventDetailContainer({ onBack, children }: { onBack: () => void; children: React.ReactNode }) {
  const ref = useSwipe<HTMLDivElement>({
    onSwipeRight: onBack,
    edgeRightOnly: true,
  });
  return (
    <div ref={ref} className="ios-push-in">
      {children}
    </div>
  );
}

const RaceCalendar = forwardRef<RaceCalendarHandle, RaceCalendarProps>(function RaceCalendar(
  { forecasts, tideData, liveWindHistory },
  ref,
) {
  const [selectedDay, setSelectedDay] = useState<Date>(startOfDay(new Date()));
  const [currentMonth, setCurrentMonth] = useState<Date>(startOfMonth(new Date()));
  const [selectedEvent, setSelectedEvent] = useState<RaceEvent | null>(null);

  // Tap the active "Events" nav tab again: pop the drilled-in event view first;
  // if already at the calendar root, snap back to today's date.
  useImperativeHandle(ref, () => ({
    popToRoot: () => {
      if (selectedEvent) {
        setSelectedEvent(null);
        return;
      }
      const today = startOfDay(new Date());
      setSelectedDay(today);
      setCurrentMonth(startOfMonth(today));
    },
  }), [selectedEvent]);

  const events = sortEventsByCategory(getEventsForDay(selectedDay));

  if (selectedEvent) {
    return (
      <EventDetailContainer
        onBack={() => { haptic('light'); setSelectedEvent(null); }}
      >
        <EventWeatherView
          event={selectedEvent}
          selectedDay={selectedDay}
          forecasts={forecasts}
          tideData={tideData}
          liveWindHistory={liveWindHistory}
          onBack={() => { haptic('light'); setSelectedEvent(null); }}
        />
      </EventDetailContainer>
    );
  }

  return (
    <div key="event-root" className="space-y-3 ios-push-out-back">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4" /> {format(currentMonth, 'MMMM yyyy')}
            </CardTitle>
            <div className="flex items-center gap-1">
              <button
                onClick={() => { haptic('light'); setCurrentMonth(m => addMonths(m, -1)); }}
                aria-label="Previous month"
                className="h-8 w-8 -my-1 flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-90 transition-all rounded-full"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => { haptic('light'); setCurrentMonth(m => addMonths(m, 1)); }}
                aria-label="Next month"
                className="h-8 w-8 -my-1 flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-90 transition-all rounded-full"
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

      <Card key={`day-${selectedDay.getTime()}`} className="page-enter">
        <CardHeader className="pb-2">
          <div className="flex items-baseline justify-between gap-2">
            <CardTitle className="text-sm">{format(selectedDay, 'EEEE d MMMM')}</CardTitle>
            {events.length > 0 && (
              <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
                {events.length} event{events.length === 1 ? '' : 's'}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0 pb-1">
          {!events.length ? (
            <p className="text-center text-muted-foreground text-sm py-6 px-4">No events scheduled.</p>
          ) : (
            <div className="divide-y divide-border">
              {events.map((event, i) => {
                const style = CATEGORY_STYLES[getEventCategory(event)];
                const Icon = style.Icon;
                const featured = !!style.accentBg;
                return (
                  <button
                    key={i}
                    onClick={() => { haptic('medium'); setSelectedEvent(event); }}
                    className="relative w-full text-left px-4 py-3 hover:bg-muted/50 active:bg-muted/70 press-row"
                    style={featured ? { backgroundColor: style.accentBg ?? undefined } : undefined}
                  >
                    {featured && style.accent && (
                      <span
                        className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full"
                        style={{ backgroundColor: style.accent }}
                        aria-hidden
                      />
                    )}
                    <div className="flex items-center gap-3">
                      <Icon
                        className="h-4 w-4 shrink-0"
                        style={{ color: style.accent ?? 'var(--muted-foreground)' }}
                        strokeWidth={2}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-tight truncate">{event.name}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                          <span
                            className="uppercase tracking-wide font-medium"
                            style={style.accent ? { color: style.accent } : undefined}
                          >
                            {style.label}
                          </span>
                          {event.classes && (
                            <>
                              <span className="text-muted-foreground/40">·</span>
                              <span className="truncate">{event.classes}</span>
                            </>
                          )}
                        </div>
                      </div>
                      {event.time ? (
                        <span className="text-xs text-muted-foreground tabular-nums shrink-0">{event.time}</span>
                      ) : (
                        <span className="text-[11px] uppercase tracking-wide text-muted-foreground shrink-0">All day</span>
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
});

export default RaceCalendar;
