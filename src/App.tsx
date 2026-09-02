import { useEffect, useRef, useState, useCallback, lazy, Suspense } from 'react';
import { useNow } from '@/lib/useNow';
import { haptic } from '@/lib/haptics';
import type { HourlyForecast, SunInfo, TideData, LiveWind, LiveWindHistoryPoint, WindForecastPoint, MarineData } from '@/lib/api';
import { fetchMetOfficeHourly, fetchWeatherNextHourly, fetchSunInfo, fetchTides, fetchLiveWind, fetchLiveWindHistory, fetchForecastHistory, fetchMarine } from '@/lib/api';
import { decodeGeohash } from '@/lib/geohash';
import { filterForDay } from '@/lib/forecastUtils';
import { useSkyTint } from '@/lib/useSkyTint';
import { Skeleton } from '@/components/ui/skeleton';
import WindCard from '@/components/WindCard';
import TideChart from '@/components/TideChart';
const TideMap = lazy(() => import('@/components/TideMap'));
import ForecastStrip from '@/components/ForecastStrip';
import RaceCalendar, { type RaceCalendarHandle } from '@/components/RaceCalendar';
import InstallButton from '@/components/InstallButton';
import SettingsPage from '@/components/SettingsPage';
import HomePage from '@/components/HomePage';
import { useSettings } from '@/lib/settings';
import { buildForecastSeries } from '@/lib/windChartData';
import {
  MapPin, AlertTriangle, Waves, Loader2, Home,
  Wind, CalendarDays, Anchor, Settings as SettingsIcon,
} from 'lucide-react';
import { format, addDays, startOfDay, isSameDay } from 'date-fns';
import { Analytics } from '@vercel/analytics/react';

type LoadState = 'idle' | 'loading' | 'error' | 'ok';
export type Tab = 'home' | 'wind' | 'tides' | 'forecast' | 'events' | 'settings';

function useThemeMode(theme: 'auto' | 'light' | 'dark') {
  useEffect(() => {
    const apply = (dark: boolean) =>
      document.documentElement.classList.toggle('dark', dark);
    if (theme === 'light') { apply(false); return; }
    if (theme === 'dark')  { apply(true);  return; }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    apply(mq.matches);
    const onChange = (e: MediaQueryListEvent) => apply(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);
}

function DateSelector({ selected, onChange, availableDays }: {
  selected: Date;
  onChange: (d: Date) => void;
  availableDays: Date[];
}) {
  return (
    <div
      className="flex gap-1.5 overflow-x-auto pb-1 pt-1 no-scrollbar touch-pan-x -mx-4 px-4"
      style={{ maskImage: 'linear-gradient(to right, black calc(100% - 32px), transparent)', WebkitMaskImage: 'linear-gradient(to right, black calc(100% - 32px), transparent)' }}
    >
      {availableDays.map((day, i) => {
        const active = isSameDay(day, selected);
        const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : format(day, 'EEE d');
        return (
          <button
            key={i}
            onClick={() => { haptic('light'); onChange(day); }}
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
  { id: 'home',     label: 'Home',     Icon: Home },
  { id: 'wind',     label: 'Wind',     Icon: Wind },
  { id: 'tides',    label: 'Tides',    Icon: Waves },
  { id: 'forecast', label: '7-Day',    Icon: CalendarDays },
  { id: 'events',   label: 'Events',   Icon: Anchor },
];

const TAB_IDS: readonly Tab[] = ['home', 'wind', 'tides', 'forecast', 'events', 'settings'];
function isTab(value: string | null): value is Tab {
  return value !== null && (TAB_IDS as readonly string[]).includes(value);
}

function formatRelativeTime(date: Date, nowMs: number): string {
  const seconds = Math.max(0, Math.round((nowMs - date.getTime()) / 1000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

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
  const settings = useSettings();
  useThemeMode(settings.theme);

  const { geohash: LOCATION_GEOHASH, name: LOCATION_NAME, liveWindId: LIVE_WIND_LOCATION_ID } = settings.location;
  const { lat, lon } = decodeGeohash(LOCATION_GEOHASH);

  const [forecasts, setForecasts] = useState<HourlyForecast[]>([]);
  const [metOfficeForecasts, setMetOfficeForecasts] = useState<HourlyForecast[]>([]);
  const [weatherNextForecasts, setWeatherNextForecasts] = useState<HourlyForecast[]>([]);
  const [forecastHistory, setForecastHistory] = useState<WindForecastPoint[]>([]);
  const [tideData, setTideData] = useState<TideData | null>(null);
  const [marineData, setMarineData] = useState<MarineData | null>(null);
  const [sunInfo, setSunInfo] = useState<SunInfo | null>(null);
  const [liveWind, setLiveWind] = useState<LiveWind | null>(null);
  const [liveWindHistory, setLiveWindHistory] = useState<LiveWindHistoryPoint[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    try {
      const urlTab = new URLSearchParams(window.location.search).get('tab');
      if (isTab(urlTab)) return urlTab;
      const saved = sessionStorage.getItem('wx-active-tab');
      if (isTab(saved)) return saved;
    } catch { /* ignore */ }
    return 'home';
  });
  const [selectedDay, setSelectedDay] = useState<Date>(() => {
    try {
      const saved = sessionStorage.getItem('wx-selected-day');
      if (saved) {
        const d = startOfDay(new Date(Number(saved)));
        // Only restore if it's still in the available 7-day window.
        const todayMs = startOfDay(new Date()).getTime();
        const diffDays = Math.round((d.getTime() - todayMs) / 86_400_000);
        if (diffDays >= 0 && diffDays < 7) return d;
      }
    } catch { /* ignore */ }
    return startOfDay(new Date());
  });
  const [showUpdatedToast, setShowUpdatedToast] = useState(false);

  useEffect(() => {
    try { sessionStorage.setItem('wx-active-tab', activeTab); } catch { /* ignore */ }
  }, [activeTab]);
  useEffect(() => {
    try { sessionStorage.setItem('wx-selected-day', String(selectedDay.getTime())); } catch { /* ignore */ }
  }, [selectedDay]);

  useEffect(() => {
    try {
      if (sessionStorage.getItem('wx-just-updated') === '1') {
        sessionStorage.removeItem('wx-just-updated');
        setShowUpdatedToast(true);
        const t = window.setTimeout(() => setShowUpdatedToast(false), 3500);
        return () => window.clearTimeout(t);
      }
    } catch { /* ignore */ }
  }, []);
  const eventsRef = useRef<RaceCalendarHandle>(null);
  const nowMs = useNow(15_000);

  const onNavTap = useCallback((id: Tab) => {
    haptic('light');
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
      const [met, weatherNext, td, sun, marine] = await Promise.allSettled([
        settings.compareForecasts || settings.forecastProvider === 'metoffice'
          ? fetchMetOfficeHourly(LOCATION_GEOHASH)
          : Promise.resolve([]),
        settings.compareForecasts || settings.forecastProvider === 'weathernext'
          ? fetchWeatherNextHourly(lat, lon)
          : Promise.resolve([]),
        fetchTides(lat, lon),
        fetchSunInfo(lat, lon),
        fetchMarine(lat, lon),
      ]);

      if (met.status === 'fulfilled') setMetOfficeForecasts(met.value);
      if (weatherNext.status === 'fulfilled') setWeatherNextForecasts(weatherNext.value);
      const primary = settings.forecastProvider === 'weathernext' ? weatherNext : met;
      if (primary.status === 'fulfilled' && primary.value.length) {
        setForecasts(primary.value);
      } else if (primary.status === 'rejected') {
        throw new Error(`Weather: ${(primary.reason as Error).message}`);
      } else {
        throw new Error('Weather: no forecast data returned');
      }

      if (settings.compareForecasts) {
        if (met.status === 'rejected') console.warn('Met Office comparison failed:', (met.reason as Error).message);
        if (weatherNext.status === 'rejected') console.warn('WeatherNext comparison failed:', (weatherNext.reason as Error).message);
      }

      if (settings.compareForecasts || settings.forecastProvider === 'metoffice') {
        try {
          setForecastHistory(await fetchForecastHistory(lat, lon, 6));
        } catch (e) {
          console.warn('Forecast history failed:', (e as Error).message);
        }
      } else {
        setForecastHistory([]);
      }

      if (td.status === 'fulfilled') setTideData(td.value);
      else console.warn('Tides failed:', (td.reason as Error).message);

      if (sun.status === 'fulfilled') setSunInfo(sun.value);
      else console.warn('Sun info failed:', (sun.reason as Error).message);

      if (marine.status === 'fulfilled') setMarineData(marine.value);
      else console.warn('Marine failed:', (marine.reason as Error).message);

      setLoadState('ok');
      setLastUpdated(new Date());
    } catch (e) {
      setError((e as Error).message);
      setLoadState('error');
    }
  }, [lat, lon, LOCATION_GEOHASH, settings.forecastProvider, settings.compareForecasts]);

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
  }, [LIVE_WIND_LOCATION_ID]);

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
  }, [LIVE_WIND_LOCATION_ID]);

  useEffect(() => {
    loadLiveWindHistory();
    const interval = setInterval(loadLiveWindHistory, 60 * 1000);
    return () => clearInterval(interval);
  }, [loadLiveWindHistory]);

  // Background timers are throttled or suspended by the OS in PWAs / hidden tabs,
  // so a multi-hour gap can leave us showing yesterday's forecast. Re-fetch when
  // the tab regains visibility — the localStorage TTL still absorbs rapid toggles.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        loadData();
        loadLiveWind();
        loadLiveWindHistory();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [loadData, loadLiveWind, loadLiveWindHistory]);

  const availableDays = Array.from({ length: 7 }, (_, i) => startOfDay(addDays(new Date(), i)));
  const dayForecasts = filterForDay(forecasts, selectedDay);
  const isTodaySelected = isSameDay(selectedDay, new Date());
  const chartForecastsForWind = isTodaySelected
    ? forecasts.filter(f => f.time.getTime() <= Date.now() + 12 * 60 * 60 * 1000)
    : forecasts.filter(f => isSameDay(f.time, selectedDay));
  const comparisonForecasts = settings.compareForecasts
    ? [
        { id: 'metoffice', label: 'Met Office', series: buildForecastSeries(forecastHistory, metOfficeForecasts), color: 'var(--chart-avg)' },
        { id: 'deepmind', label: 'Google DeepMind', series: buildForecastSeries([], weatherNextForecasts), color: 'var(--accent-gold)' },
      ]
    : undefined;
  const isLoading = loadState === 'loading';
  const showDateSelector = activeTab === 'wind' || activeTab === 'tides';

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Analytics />
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
                {formatRelativeTime(lastUpdated, nowMs)}
              </span>
            )}
            <button
              onClick={() => { haptic('light'); setActiveTab(t => t === 'settings' ? 'home' : 'settings'); }}
              aria-label="Settings"
              aria-pressed={activeTab === 'settings'}
              className={`p-2 -mr-2 rounded-full transition-colors active:opacity-60 ${
                activeTab === 'settings'
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <SettingsIcon className="h-4 w-4" strokeWidth={2.25} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-3" style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}>
        {isLoading && !forecasts.length && activeTab !== 'tides' ? (
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

            {activeTab === 'home' && (
              <HomePage
                forecasts={forecasts}
                forecastHistory={forecastHistory}
                comparisonForecasts={comparisonForecasts}
                liveWind={liveWind}
                liveWindHistory={liveWindHistory}
                tideData={tideData}
                sunInfo={sunInfo}
                onNavigate={setActiveTab}
              />
            )}
            {activeTab === 'wind' && (
              <div key={`wind-${selectedDay.getTime()}`} className="space-y-3 page-enter">
                <WindCard
                  forecasts={dayForecasts}
                  chartForecasts={chartForecastsForWind}
                  chartHistoryForecasts={forecastHistory}
                  comparisonForecasts={comparisonForecasts}
                  selectedDay={selectedDay}
                  liveWind={liveWind}
                  liveWindHistory={liveWindHistory}
                />
              </div>
            )}
            {activeTab === 'tides' && (
              <div key={`tides-${selectedDay.getTime()}`} className="page-enter space-y-3">
                {tideData ? (
                  <TideChart
                    tideData={tideData}
                    marineData={marineData}
                    selectedDay={selectedDay}
                  />
                ) : (
                  <div className="text-center py-6 text-muted-foreground text-sm">
                    <Waves className="mx-auto h-6 w-6 mb-2 opacity-60" />
                    Tide times unavailable — check UKHO API key
                  </div>
                )}
                <Suspense fallback={<div className="h-[380px] rounded-lg bg-muted/40 animate-pulse" />}>
                  <TideMap
                    centerLat={lat}
                    centerLon={lon}
                    locationName={LOCATION_NAME}
                    at={isSameDay(selectedDay, new Date()) ? new Date() : selectedDay}
                  />
                </Suspense>
              </div>
            )}
            {activeTab === 'forecast' && (
              <div className="page-enter">
                <ForecastStrip forecasts={forecasts} chartHistoryForecasts={forecastHistory} comparisonForecasts={comparisonForecasts} liveWindHistory={liveWindHistory} />
              </div>
            )}
            {activeTab === 'events' && (
              <div className="page-enter">
                <RaceCalendar
                  ref={eventsRef}
                  forecasts={forecasts}
                  tideData={tideData}
                  liveWindHistory={liveWindHistory}
                />
              </div>
            )}
            {activeTab === 'settings' && (
              <div key="settings" className="page-enter">
                <SettingsPage onRefresh={loadData} />
              </div>
            )}
          </div>
        )}
      </main>

      {showUpdatedToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed left-1/2 -translate-x-1/2 z-30 px-3.5 py-2 rounded-full bg-primary text-primary-foreground text-xs font-medium shadow-lg backdrop-blur"
          style={{ bottom: 'calc(5.5rem + env(safe-area-inset-bottom))' }}
        >
          Updated to latest version
        </div>
      )}

      <nav className="fixed bottom-0 inset-x-0 z-20 bg-background/95 backdrop-blur-lg border-t" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="max-w-2xl mx-auto flex px-2 pt-1.5 pb-1">
          {NAV_ITEMS.map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => onNavTap(id)}
                aria-current={active ? 'page' : undefined}
                className={`flex-1 flex flex-col items-center gap-1 py-1.5 rounded-xl transition-colors active:opacity-60 ${
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon
                  key={`${id}-${active}`}
                  className={`h-[22px] w-[22px] transition-transform ${active ? 'nav-pop' : ''}`}
                  strokeWidth={active ? 2.4 : 1.9}
                />
                <span className={`text-[10.5px] tracking-tight ${active ? 'font-semibold' : 'font-medium'}`}>{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
