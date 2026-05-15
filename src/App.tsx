import { useEffect, useRef, useState, useCallback } from 'react';
import type { HourlyForecast, SunInfo, TideData, LiveWind, LiveWindHistoryPoint, WindForecastPoint } from '@/lib/api';
import { fetchMetOfficeHourly, fetchSunInfo, fetchTides, fetchLiveWind, fetchLiveWindHistory, fetchForecastHistory } from '@/lib/api';
import { decodeGeohash } from '@/lib/geohash';
import { filterForDay } from '@/lib/forecastUtils';
import { useSkyTint } from '@/lib/useSkyTint';
import { Skeleton } from '@/components/ui/skeleton';
import WindCard from '@/components/WindCard';
import TideChart from '@/components/TideChart';
import ForecastStrip from '@/components/ForecastStrip';
import RaceCalendar, { type RaceCalendarHandle } from '@/components/RaceCalendar';
import InstallButton from '@/components/InstallButton';
import ConditionsHeader from '@/components/ConditionsHeader';
import {
  MapPin, AlertTriangle, Waves, Loader2,
  Wind, CalendarDays, Anchor,
} from 'lucide-react';
import { format, addDays, startOfDay, isSameDay } from 'date-fns';

const LOCATION_GEOHASH = 'gcn86rd2z';
const LOCATION_NAME = 'Poole Harbour';
const LIVE_WIND_LOCATION_ID = 'GBR00015';
const { lat, lon } = decodeGeohash(LOCATION_GEOHASH);

type LoadState = 'idle' | 'loading' | 'error' | 'ok';
type Tab = 'wind' | 'tides' | 'forecast' | 'events';

function useDarkMode() {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = (dark: boolean) =>
      document.documentElement.classList.toggle('dark', dark);
    apply(mq.matches);
    mq.addEventListener('change', e => apply(e.matches));
    return () => mq.removeEventListener('change', e => apply(e.matches));
  }, []);
}

function DateSelector({ selected, onChange, availableDays }: {
  selected: Date;
  onChange: (d: Date) => void;
  availableDays: Date[];
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 pt-1 no-scrollbar touch-pan-x -mx-4 px-4">
      {availableDays.map((day, i) => {
        const active = isSameDay(day, selected);
        const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : format(day, 'EEE d');
        return (
          <button
            key={i}
            onClick={() => onChange(day)}
            aria-pressed={active}
            className={`flex-shrink-0 min-h-10 px-4 rounded-full text-sm font-medium transition-colors active:scale-[0.97] ${
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted/70'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

const NAV_ITEMS: { id: Tab; label: string; Icon: React.ElementType }[] = [
  { id: 'wind',     label: 'Wind',     Icon: Wind },
  { id: 'tides',    label: 'Tides',    Icon: Waves },
  { id: 'forecast', label: '5-Day',    Icon: CalendarDays },
  { id: 'events',   label: 'Events',   Icon: Anchor },
];

function LoadingSkeleton() {
  return (
    <div className="space-y-3 p-4">
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-24 w-full" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    </div>
  );
}


export default function App() {
  useDarkMode();

  const [forecasts, setForecasts] = useState<HourlyForecast[]>([]);
  const [forecastHistory, setForecastHistory] = useState<WindForecastPoint[]>([]);
  const [tideData, setTideData] = useState<TideData | null>(null);
  const [sunInfo, setSunInfo] = useState<SunInfo | null>(null);
  const [liveWind, setLiveWind] = useState<LiveWind | null>(null);
  const [liveWindHistory, setLiveWindHistory] = useState<LiveWindHistoryPoint[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('wind');
  const [selectedDay, setSelectedDay] = useState<Date>(startOfDay(new Date()));
  const eventsRef = useRef<RaceCalendarHandle>(null);

  const onNavTap = useCallback((id: Tab) => {
    if (id === activeTab && id === 'events') {
      eventsRef.current?.popToRoot();
      return;
    }
    setActiveTab(id);
  }, [activeTab]);

  useSkyTint(sunInfo);

  const loadData = useCallback(async () => {
    setLoadState('loading');
    setError(null);
    try {
      const [fc, td, sun] = await Promise.allSettled([
        fetchMetOfficeHourly(lat, lon),
        fetchTides(lat, lon),
        fetchSunInfo(lat, lon),
      ]);

      if (fc.status === 'fulfilled') setForecasts(fc.value);
      else throw new Error(`Weather: ${(fc.reason as Error).message}`);

      try {
        setForecastHistory(await fetchForecastHistory(lat, lon, 6));
      } catch (e) {
        console.warn('Forecast history failed:', (e as Error).message);
      }

      if (td.status === 'fulfilled') setTideData(td.value);
      else console.warn('Tides failed:', (td.reason as Error).message);

      if (sun.status === 'fulfilled') setSunInfo(sun.value);
      else console.warn('Sun info failed:', (sun.reason as Error).message);

      setLoadState('ok');
      setLastUpdated(new Date());
    } catch (e) {
      setError((e as Error).message);
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadData]);

  const loadLiveWind = useCallback(async () => {
    try {
      const live = await fetchLiveWind(LIVE_WIND_LOCATION_ID);
      setLiveWind(live);
    } catch (e) {
      console.warn('Live wind failed:', (e as Error).message);
    }
  }, []);

  useEffect(() => {
    loadLiveWind();
    const interval = setInterval(loadLiveWind, 15 * 1000);
    return () => clearInterval(interval);
  }, [loadLiveWind]);

  const loadLiveWindHistory = useCallback(async () => {
    try {
      const history = await fetchLiveWindHistory(LIVE_WIND_LOCATION_ID, 6);
      setLiveWindHistory(history);
    } catch (e) {
      console.warn('Live wind history failed:', (e as Error).message);
    }
  }, []);

  useEffect(() => {
    loadLiveWindHistory();
    const interval = setInterval(loadLiveWindHistory, 60 * 1000);
    return () => clearInterval(interval);
  }, [loadLiveWindHistory]);

  const availableDays = Array.from({ length: 5 }, (_, i) => startOfDay(addDays(new Date(), i)));
  const dayForecasts = filterForDay(forecasts, selectedDay);
  const isTodaySelected = isSameDay(selectedDay, new Date());
  const chartForecastsForWind = isTodaySelected
    ? forecasts.filter(f => f.time.getTime() <= Date.now() + 12 * 60 * 60 * 1000)
    : forecasts.filter(f => isSameDay(f.time, selectedDay));
  const isLoading = loadState === 'loading';
  const showDateSelector = activeTab !== 'forecast' && activeTab !== 'events';

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 bg-background/75 backdrop-blur-xl border-b border-border/60" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-2xl mx-auto px-4 pt-3 pb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <MapPin className="h-4 w-4 text-primary shrink-0" strokeWidth={2.5} />
            <h1 className="font-display text-xl font-semibold leading-none tracking-tight truncate">
              {LOCATION_NAME}
            </h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <InstallButton />
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/70" />
            ) : lastUpdated && (
              <span className="text-muted-foreground/60 text-[11px] tabular-nums" title={`Updated ${format(lastUpdated, 'HH:mm:ss')}`}>
                {format(lastUpdated, 'HH:mm')}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-3" style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}>
        {isLoading && !forecasts.length ? (
          <LoadingSkeleton />
        ) : loadState === 'error' ? (
          <div className="text-center py-12 space-y-3">
            <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
            <p className="text-destructive font-medium">Failed to load</p>
            <p className="text-muted-foreground text-sm">{error}</p>
            <button
              onClick={loadData}
              className="mt-2 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg text-sm font-medium transition-colors"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {showDateSelector && (
              <DateSelector selected={selectedDay} onChange={setSelectedDay} availableDays={availableDays} />
            )}

            {activeTab === 'wind' && (
              <div key={`wind-${selectedDay.getTime()}`} className="space-y-3 animate-in fade-in-50 duration-300">
                <ConditionsHeader forecasts={forecasts} selectedDay={selectedDay} sunInfo={sunInfo} />
                <WindCard
                  forecasts={dayForecasts}
                  chartForecasts={chartForecastsForWind}
                  chartHistoryForecasts={forecastHistory}
                  selectedDay={selectedDay}
                  liveWind={liveWind}
                  liveWindHistory={liveWindHistory}
                />
              </div>
            )}
            {activeTab === 'tides' && (
              <div key={`tides-${selectedDay.getTime()}`} className="animate-in fade-in-50 duration-300">
                {tideData ? (
                  <TideChart tideData={tideData} selectedDay={selectedDay} />
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <Waves className="mx-auto h-10 w-10 mb-3" />
                    Tide data unavailable — check UKHO API key
                  </div>
                )}
              </div>
            )}
            {activeTab === 'forecast' && (
              <div className="animate-in fade-in-50 duration-300">
                <ForecastStrip forecasts={forecasts} chartHistoryForecasts={forecastHistory} liveWindHistory={liveWindHistory} />
              </div>
            )}
            {activeTab === 'events' && (
              <div className="animate-in fade-in-50 duration-300">
                <RaceCalendar
                  ref={eventsRef}
                  forecasts={forecasts}
                  tideData={tideData}
                  liveWindHistory={liveWindHistory}
                />
              </div>
            )}
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-20 bg-background/95 backdrop-blur-lg border-t" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="max-w-2xl mx-auto flex px-2 pt-1.5 pb-1">
          {NAV_ITEMS.map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => onNavTap(id)}
                aria-current={active ? 'page' : undefined}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl transition-all active:scale-95 ${
                  active
                    ? 'text-primary bg-primary/10'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.5 : 1.75} />
                <span className={`text-[11px] tracking-wide ${active ? 'font-semibold' : 'font-normal'}`}>{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
