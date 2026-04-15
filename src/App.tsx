import { useEffect, useState, useCallback } from 'react';
import type { HourlyForecast, TideData, LiveWind, LiveWindHistoryPoint } from '@/lib/api';
import { fetchMetOfficeHourly, fetchTides, fetchLiveWind, fetchLiveWindHistory } from '@/lib/api';
import { decodeGeohash } from '@/lib/geohash';
import { Skeleton } from '@/components/ui/skeleton';
import WindCard from '@/components/WindCard';
import TideChart from '@/components/TideChart';
import ForecastStrip from '@/components/ForecastStrip';
import RaceCalendar from '@/components/RaceCalendar';
import {
  MapPin, AlertTriangle, Waves, RefreshCw, Loader2,
  Wind, CalendarDays, Anchor,
} from 'lucide-react';
import { format, addDays, startOfDay, isSameDay, isBefore, startOfHour } from 'date-fns';

const LOCATION_GEOHASH = 'gcn86rd2z';
const LOCATION_NAME = 'Poole Harbour';
const LIVE_WIND_LOCATION_ID = 'GBR00015';
const { lat, lon } = decodeGeohash(LOCATION_GEOHASH);

type LoadState = 'idle' | 'loading' | 'error' | 'ok';
type Tab = 'wind' | 'tides' | 'forecast' | 'races';

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
    <div className="flex gap-2 overflow-x-auto pb-1 pt-1 no-scrollbar">
      {availableDays.map((day, i) => {
        const active = isSameDay(day, selected);
        const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : format(day, 'EEE d');
        return (
          <button
            key={i}
            onClick={() => onChange(day)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              active
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function filterForDay(forecasts: HourlyForecast[], day: Date): HourlyForecast[] {
  const isToday = isSameDay(day, new Date());
  return forecasts.filter(f =>
    isToday
      ? isSameDay(f.time, day) && !isBefore(f.time, startOfHour(new Date()))
      : isSameDay(f.time, day)
  );
}

const NAV_ITEMS: { id: Tab; label: string; Icon: React.ElementType }[] = [
  { id: 'wind',     label: 'Wind',     Icon: Wind },
  { id: 'tides',    label: 'Tides',    Icon: Waves },
  { id: 'forecast', label: '5-Day',    Icon: CalendarDays },
  { id: 'races',    label: 'Races',    Icon: Anchor },
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
  const [tideData, setTideData] = useState<TideData | null>(null);
  const [liveWind, setLiveWind] = useState<LiveWind | null>(null);
  const [liveWindHistory, setLiveWindHistory] = useState<LiveWindHistoryPoint[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('wind');
  const [selectedDay, setSelectedDay] = useState<Date>(startOfDay(new Date()));

  const loadData = useCallback(async () => {
    setLoadState('loading');
    setError(null);
    try {
      const [fc, td] = await Promise.allSettled([
        fetchMetOfficeHourly(lat, lon),
        fetchTides(lat, lon),
      ]);

      if (fc.status === 'fulfilled') setForecasts(fc.value);
      else throw new Error(`Weather: ${(fc.reason as Error).message}`);

      if (td.status === 'fulfilled') setTideData(td.value);
      else console.warn('Tides failed:', (td.reason as Error).message);

      setLoadState('ok');
      setLastUpdated(new Date());
    } catch (e) {
      setError((e as Error).message);
      setLoadState('error');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
  const isLoading = loadState === 'loading';
  const showDateSelector = activeTab !== 'forecast' && activeTab !== 'races';

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary shrink-0" />
            <div>
              <h1 className="font-semibold text-sm leading-tight">Weather App</h1>
              <p className="text-muted-foreground text-xs">{LOCATION_NAME}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-muted-foreground text-xs">
                {format(lastUpdated, 'HH:mm')}
              </span>
            )}
            <button
              onClick={loadData}
              disabled={isLoading}
              className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
              title="Refresh"
            >
              {isLoading
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <RefreshCw className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-4" style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}>
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
              <WindCard
                forecasts={dayForecasts}
                chartForecasts={forecasts.filter(f => isSameDay(f.time, selectedDay))}
                selectedDay={selectedDay}
                liveWind={liveWind}
                liveWindHistory={liveWindHistory}
              />
            )}
            {activeTab === 'tides' && (
              tideData ? (
                <TideChart tideData={tideData} selectedDay={selectedDay} />
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Waves className="mx-auto h-10 w-10 mb-3" />
                  Tide data unavailable — check UKHO API key
                </div>
              )
            )}
            {activeTab === 'forecast' && (
              <ForecastStrip forecasts={forecasts} liveWindHistory={liveWindHistory} />
            )}
            {activeTab === 'races' && (
              <RaceCalendar forecasts={forecasts} tideData={tideData} liveWindHistory={liveWindHistory} />
            )}
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-20 bg-background/95 backdrop-blur border-t" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="max-w-2xl mx-auto flex">
          {NAV_ITEMS.map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex-1 flex flex-col items-center gap-1 py-3 transition-colors ${
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 1.75} />
                <span className={`text-xs ${active ? 'font-semibold' : 'font-normal'}`}>{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
