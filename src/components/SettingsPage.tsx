import { useState } from 'react';
import { Check, RotateCcw, Trash2, ExternalLink } from 'lucide-react';
import { useSettings, setSettings, resetSettings, DEFAULT_LOCATION, type Theme, type WindUnit } from '@/lib/settings';
import { clearCache } from '@/lib/cache';
import { decodeGeohash } from '@/lib/geohash';
import { haptic } from '@/lib/haptics';
import { Button } from '@/components/ui/button';
import {
  DEFAULT_PREFS, useSailingPrefs,
  type Cardinal, type SailingPrefs,
} from '@/lib/sailingScore';

const THEMES: { id: Theme; label: string }[] = [
  { id: 'auto',  label: 'Auto' },
  { id: 'light', label: 'Light' },
  { id: 'dark',  label: 'Dark' },
];

const WIND_UNITS: { id: WindUnit; label: string }[] = [
  { id: 'kn',  label: 'kt' },
  { id: 'mph', label: 'mph' },
  { id: 'kmh', label: 'km/h' },
  { id: 'ms',  label: 'm/s' },
];

const CARDINALS: Cardinal[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <div className="px-1">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
        {description && <p className="text-xs text-muted-foreground/80 mt-0.5">{description}</p>}
      </div>
      <div className="rounded-2xl bg-card border border-border/60 overflow-hidden">{children}</div>
    </section>
  );
}

function SegmentedRow<T extends string>({ options, value, onChange }: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex gap-1 p-1 m-1.5 bg-muted/40 rounded-xl">
      {options.map(opt => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            onClick={() => { haptic('light'); onChange(opt.id); }}
            className={`flex-1 h-9 rounded-lg text-sm font-medium transition-all active:scale-[0.97] ${
              active ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function SailingPrefsFields({
  prefs, setPrefs,
}: {
  prefs: SailingPrefs;
  setPrefs: (p: SailingPrefs) => void;
}) {
  const update = <K extends keyof SailingPrefs>(key: K, value: SailingPrefs[K]) => {
    setPrefs({ ...prefs, [key]: value });
  };

  const toggleDir = (d: Cardinal) => {
    haptic('light');
    const next = new Set(prefs.preferredDirections);
    if (next.has(d)) next.delete(d); else next.add(d);
    update('preferredDirections', next);
  };

  return (
    <div className="divide-y divide-border/60">
      <div className="px-3 py-3 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Min wind</span>
            <input
              type="number"
              min={0}
              max={60}
              value={prefs.windMinKt}
              onChange={e => update('windMinKt', Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm tabular-nums outline-none focus:border-foreground/40"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Max wind</span>
            <input
              type="number"
              min={0}
              max={60}
              value={prefs.windMaxKt}
              onChange={e => update('windMaxKt', Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm tabular-nums outline-none focus:border-foreground/40"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Max gust</span>
            <input
              type="number"
              min={0}
              max={80}
              value={prefs.maxGustKt}
              onChange={e => update('maxGustKt', Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm tabular-nums outline-none focus:border-foreground/40"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Min sail hours</span>
            <input
              type="number"
              min={1}
              max={12}
              step={0.5}
              value={prefs.minSailHours}
              onChange={e => update('minSailHours', Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm tabular-nums outline-none focus:border-foreground/40"
            />
          </label>
        </div>
      </div>

      <fieldset className="px-3 py-3">
        <legend className="text-xs font-medium mb-2">Preferred wind directions</legend>
        <div className="grid grid-cols-4 gap-1.5">
          {CARDINALS.map(d => {
            const on = prefs.preferredDirections.has(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggleDir(d)}
                aria-pressed={on}
                className={`rounded-lg border px-2 py-1.5 text-sm font-medium tabular-nums transition-colors active:scale-[0.97] ${
                  on
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-foreground border-border hover:border-foreground/40'
                }`}
              >
                {d}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">Leave empty for no direction preference.</p>
      </fieldset>

      <div className="px-3 py-3 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Tide height</span>
            <select
              value={prefs.tideHeight}
              onChange={e => update('tideHeight', e.target.value as SailingPrefs['tideHeight'])}
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-foreground/40"
            >
              <option value="any">Any</option>
              <option value="high">High</option>
              <option value="mid">Mid</option>
              <option value="low">Low</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Tide movement</span>
            <select
              value={prefs.tideMovement}
              onChange={e => update('tideMovement', e.target.value as SailingPrefs['tideMovement'])}
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-foreground/40"
            >
              <option value="any">Any</option>
              <option value="rising">Rising</option>
              <option value="falling">Falling</option>
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Max precipitation</span>
          <input
            type="number"
            min={0}
            max={100}
            value={prefs.maxPrecipPct}
            onChange={e => update('maxPrecipPct', Number(e.target.value))}
            className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm tabular-nums outline-none focus:border-foreground/40"
          />
        </label>
      </div>

      <div className="px-3 py-2.5 flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setPrefs({ ...DEFAULT_PREFS, preferredDirections: new Set() })}
        >
          Reset sailing
        </Button>
      </div>
    </div>
  );
}

export default function SettingsPage({ onRefresh }: { onRefresh: () => void }) {
  const settings = useSettings();
  const [sailingPrefs, setSailingPrefs] = useSailingPrefs();
  const [geohash, setGeohash] = useState(settings.location.geohash);
  const [name, setName] = useState(settings.location.name);
  const [liveWindId, setLiveWindId] = useState(settings.location.liveWindId);
  const [geohashError, setGeohashError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [clearedFlash, setClearedFlash] = useState(false);

  const dirty =
    geohash.trim() !== settings.location.geohash ||
    name.trim() !== settings.location.name ||
    liveWindId.trim() !== settings.location.liveWindId;

  function saveLocation() {
    const g = geohash.trim().toLowerCase();
    try {
      const { lat, lon } = decodeGeohash(g);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || g.length < 3) {
        setGeohashError('Invalid geohash');
        return;
      }
    } catch {
      setGeohashError('Invalid geohash');
      return;
    }
    setGeohashError(null);
    setSettings({
      location: {
        geohash: g,
        name: name.trim() || DEFAULT_LOCATION.name,
        liveWindId: liveWindId.trim() || DEFAULT_LOCATION.liveWindId,
      },
    });
    clearCache();
    onRefresh();
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  }

  function restoreLocationDefault() {
    setGeohash(DEFAULT_LOCATION.geohash);
    setName(DEFAULT_LOCATION.name);
    setLiveWindId(DEFAULT_LOCATION.liveWindId);
    setGeohashError(null);
  }

  function handleClearCache() {
    clearCache();
    onRefresh();
    setClearedFlash(true);
    setTimeout(() => setClearedFlash(false), 1500);
  }

  return (
    <div className="space-y-5 animate-in fade-in-50 duration-300">
      <Section title="Appearance">
        <div className="px-3 py-2.5 flex items-center justify-between gap-3">
          <span className="text-sm font-medium">Theme</span>
          <div className="flex-1 max-w-[260px]">
            <SegmentedRow
              options={THEMES}
              value={settings.theme}
              onChange={(theme) => setSettings({ theme })}
            />
          </div>
        </div>
      </Section>

      <Section title="Units">
        <div className="px-3 py-2.5 flex items-center justify-between gap-3">
          <span className="text-sm font-medium">Wind speed</span>
          <div className="flex-1 max-w-[260px]">
            <SegmentedRow
              options={WIND_UNITS}
              value={settings.windUnit}
              onChange={(windUnit) => setSettings({ windUnit })}
            />
          </div>
        </div>
      </Section>

      <Section title="Sailing" description="Ratings use knots here, regardless of display unit.">
        <SailingPrefsFields prefs={sailingPrefs} setPrefs={setSailingPrefs} />
      </Section>

      <Section title="Location" description="Geohash + Met Office area + weatherfile.com live station.">
        <div className="divide-y divide-border/60">
          <label className="px-3 py-2.5 flex items-center gap-3">
            <span className="text-sm font-medium w-20 shrink-0">Name</span>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="flex-1 min-w-0 bg-transparent text-sm text-right outline-none focus:text-foreground placeholder:text-muted-foreground/50"
              placeholder={DEFAULT_LOCATION.name}
            />
          </label>
          <label className="px-3 py-2.5 flex items-center gap-3">
            <span className="text-sm font-medium w-20 shrink-0">Geohash</span>
            <input
              value={geohash}
              onChange={e => { setGeohash(e.target.value); setGeohashError(null); }}
              className="flex-1 min-w-0 bg-transparent text-sm text-right outline-none font-mono lowercase placeholder:text-muted-foreground/50"
              placeholder={DEFAULT_LOCATION.geohash}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
            />
          </label>
          <label className="px-3 py-2.5 flex items-center gap-3">
            <span className="text-sm font-medium w-20 shrink-0">Live ID</span>
            <input
              value={liveWindId}
              onChange={e => setLiveWindId(e.target.value)}
              className="flex-1 min-w-0 bg-transparent text-sm text-right outline-none font-mono placeholder:text-muted-foreground/50"
              placeholder={DEFAULT_LOCATION.liveWindId}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
            />
          </label>
          {geohashError && (
            <div className="px-3 py-2 text-xs text-destructive">{geohashError}</div>
          )}
          <div className="px-3 py-2.5 flex items-center gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={saveLocation}
              disabled={!dirty && !savedFlash}
            >
              {savedFlash ? <><Check className="mr-1" />Saved</> : 'Apply'}
            </Button>
            <Button variant="ghost" size="sm" onClick={restoreLocationDefault}>
              <RotateCcw className="mr-1" />Restore default
            </Button>
          </div>
        </div>
      </Section>

      <Section title="Data">
        <div className="divide-y divide-border/60">
          <div className="px-3 py-2.5 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Refresh now</div>
              <div className="text-xs text-muted-foreground">Re-fetch forecast, tides and sun.</div>
            </div>
            <Button variant="outline" size="sm" onClick={onRefresh}>Refresh</Button>
          </div>
          <div className="px-3 py-2.5 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Clear cache</div>
              <div className="text-xs text-muted-foreground">Drop all locally cached responses.</div>
            </div>
            <Button variant="destructive" size="sm" onClick={handleClearCache}>
              {clearedFlash ? <><Check className="mr-1" />Cleared</> : <><Trash2 className="mr-1" />Clear</>}
            </Button>
          </div>
          <div className="px-3 py-2.5 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Reset all settings</div>
              <div className="text-xs text-muted-foreground">Restore theme, units, location and sailing preferences.</div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                resetSettings();
                setGeohash(DEFAULT_LOCATION.geohash);
                setName(DEFAULT_LOCATION.name);
                setLiveWindId(DEFAULT_LOCATION.liveWindId);
                setSailingPrefs({ ...DEFAULT_PREFS, preferredDirections: new Set() });
                clearCache();
                onRefresh();
              }}
            >
              Reset
            </Button>
          </div>
        </div>
      </Section>

      <Section title="About">
        <div className="divide-y divide-border/60 text-sm">
          <div className="px-3 py-2.5 flex items-center justify-between">
            <span className="text-muted-foreground">App</span>
            <span className="font-medium">Poole Harbour Wx</span>
          </div>
          <div className="px-3 py-2.5 flex items-center justify-between">
            <span className="text-muted-foreground">Build</span>
            <span className="font-mono text-xs">{import.meta.env.MODE}</span>
          </div>
          <div className="px-3 py-2.5">
            <div className="text-muted-foreground mb-1.5">Data sources</div>
            <ul className="space-y-1 text-xs">
              <li className="flex items-center gap-1.5">
                <ExternalLink className="h-3 w-3 text-muted-foreground" />
                <a href="https://www.metoffice.gov.uk/services/data" target="_blank" rel="noreferrer" className="hover:underline">Met Office DataHub — forecast</a>
              </li>
              <li className="flex items-center gap-1.5">
                <ExternalLink className="h-3 w-3 text-muted-foreground" />
                <a href="https://admiraltyapi.portal.azure-api.net/" target="_blank" rel="noreferrer" className="hover:underline">UKHO Admiralty — tides</a>
              </li>
              <li className="flex items-center gap-1.5">
                <ExternalLink className="h-3 w-3 text-muted-foreground" />
                <a href="https://weatherfile.com/" target="_blank" rel="noreferrer" className="hover:underline">weatherfile.com — live wind</a>
              </li>
              <li className="flex items-center gap-1.5">
                <ExternalLink className="h-3 w-3 text-muted-foreground" />
                <a href="https://sunrise-sunset.org/api" target="_blank" rel="noreferrer" className="hover:underline">sunrise-sunset.org</a>
              </li>
            </ul>
          </div>
        </div>
      </Section>
    </div>
  );
}
