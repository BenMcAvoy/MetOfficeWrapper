// Met Office public-site scraper.
//
// Parses https://weather.metoffice.gov.uk/forecast/<geohash> — a server-rendered
// page with 7 days of hourly data laid out as one <table data-date="YYYY-MM-DD">
// per day inside each "detailed-forecast/<param>" section. Wind/temp/etc each
// have their own section; we join cells by index per day.
//
// Output shape matches HourlyForecast from src/lib/api.ts (wind in m/s, etc.).
// No DOM dependency — uses plain string scanning so it runs in edge runtimes too.

const MPH_TO_MS = 0.44704;

export interface ScrapedHourlyForecast {
  time: string; // ISO UTC
  screenTemperature: number;
  feelsLikeTemp: number;
  windSpeed10m: number;       // m/s
  windGustSpeed10m: number;   // m/s
  windDirectionFrom10m: number; // degrees from north
  precipitationRate: number;  // mm/h — not on public site; set to 0
  probOfPrecipitation: number; // %
  uvIndex: number;
  significantWeatherCode: number;
  visibility: number;         // metres
  mslp: number;               // hPa — not on public site; default 1013
  humidity: number;           // %
}

// --- HTML slicing -----------------------------------------------------------

function sliceSection(html: string, id: string): string {
  const marker = `id="${id}"`;
  const start = html.indexOf(marker);
  if (start === -1) return '';
  // Section runs until the next sibling section starts (its own id attribute appears).
  const after = start + marker.length;
  const candidates = [
    html.indexOf('id="detailed-forecast/', after),
    html.indexOf('id="common/', after),
  ].filter(i => i !== -1);
  const nextStart = candidates.length ? Math.min(...candidates) : -1;
  return html.slice(start, nextStart === -1 ? undefined : nextStart);
}

interface DayTable {
  date: string; // YYYY-MM-DD
  html: string;
}

function extractDayTables(sectionHtml: string): DayTable[] {
  const tables: DayTable[] = [];
  const re = /<table class="forecast-table detailed-table" data-date="(\d{4}-\d{2}-\d{2})">([\s\S]*?)<\/table>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sectionHtml))) {
    tables.push({ date: m[1], html: m[2] });
  }
  return tables;
}

function extractTimeLabels(tableHtml: string): string[] {
  const timeRowMatch = /<tr class="step-time heading-s">([\s\S]*?)<\/tr>/.exec(tableHtml);
  if (!timeRowMatch) return [];
  return [...timeRowMatch[1].matchAll(/<td[^>]*>([^<]+)<\/td>/g)].map(m => m[1].trim());
}

function extractDataCells(tableHtml: string): string[] {
  // The first <tr> inside <tbody> (skipping the <th>) holds the data <td> cells.
  const bodyMatch = /<tbody[^>]*>([\s\S]*?)<\/tbody>/.exec(tableHtml);
  if (!bodyMatch) return [];
  const rowMatch = /<tr[^>]*>([\s\S]*?)<\/tr>/.exec(bodyMatch[1]);
  if (!rowMatch) return [];
  // Strip the <th> (row heading), then capture each full <td ...>...</td> so
  // parsers can read both attributes (e.g. title="...visibility (Xkm)") and
  // inner content.
  const withoutTh = rowMatch[1].replace(/<th[\s\S]*?<\/th>/, '');
  return [...withoutTh.matchAll(/<td[\s\S]*?<\/td>/g)].map(m => m[0]);
}

// --- Time conversion --------------------------------------------------------

// Convert a "7pm"/"12am" label into 0-23.
function parseHourLabel(label: string): number | null {
  const m = /^(\d{1,2})(am|pm)$/i.exec(label.trim());
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const ampm = m[2].toLowerCase();
  if (h === 12) h = 0;
  if (ampm === 'pm') h += 12;
  return h;
}

// Convert a UK local wall-clock (date + hour) to a UTC ISO string.
// Handles BST automatically.
function ukLocalToUtcIso(date: string, hour: number): string {
  const utcGuess = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00Z`);
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(utcGuess);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00';
  const ukAsUtc = new Date(
    `${get('year')}-${get('month')}-${get('day')}T${get('hour') === '24' ? '00' : get('hour')}:${get('minute')}:${get('second')}Z`
  );
  const offsetMs = ukAsUtc.getTime() - utcGuess.getTime();
  return new Date(utcGuess.getTime() - offsetMs).toISOString();
}

// --- Per-section cell parsers ----------------------------------------------

function parseTempCell(cell: string): number {
  const m = /(-?\d+)°/.exec(cell);
  return m ? parseInt(m[1], 10) : NaN;
}

function parseWindSpeedCell(cell: string): number {
  const m = /(\d+)\s*mph/.exec(cell);
  return m ? parseInt(m[1], 10) * MPH_TO_MS : 0;
}

function parseWindDirectionCell(cell: string): number {
  // Look for rotate(<deg>, 8, 9) — the arrow rotation on the direction icon.
  const m = /rotate\((\d+(?:\.\d+)?),\s*8,\s*9\)/.exec(cell);
  return m ? parseFloat(m[1]) : 0;
}

function parsePercentCell(cell: string): number {
  const m = /(\d+)%/.exec(cell);
  return m ? parseInt(m[1], 10) : 0;
}

function parseUvCell(cell: string): number {
  const m = /UV index\s+(\d+)/.exec(cell);
  return m ? parseInt(m[1], 10) : 0;
}

function parseVisibilityCell(cell: string): number {
  // title="Good visibility (19km)" or "Moderate visibility (8.0km)"
  const m = /visibility\s*\((\d+(?:\.\d+)?)\s*km\)/i.exec(cell);
  return m ? Math.round(parseFloat(m[1]) * 1000) : 0;
}

function parseWeatherCodeCell(cell: string): number {
  const m = /at-a-glance-weather\/(\d+)\.svg/.exec(cell);
  return m ? parseInt(m[1], 10) : -1;
}

// --- Main entry -------------------------------------------------------------

type Section =
  | 'WindSpeed' | 'WindGusts' | 'WindDirection'
  | 'Temperature' | 'FeelsLikeTemperature' | 'Humidity'
  | 'UV' | 'Visibility' | 'WeatherSymbols'
  | 'ChanceOfPrecipitation';

const SECTION_IDS: Record<Section, string> = {
  WindSpeed: 'detailed-forecast/WindSpeed',
  WindGusts: 'detailed-forecast/WindGusts',
  WindDirection: 'detailed-forecast/WindDirection',
  Temperature: 'detailed-forecast/Temperature',
  FeelsLikeTemperature: 'detailed-forecast/FeelsLikeTemperature',
  Humidity: 'detailed-forecast/Humidity',
  UV: 'detailed-forecast/UV',
  Visibility: 'detailed-forecast/Visibility',
  WeatherSymbols: 'detailed-forecast/WeatherSymbols',
  ChanceOfPrecipitation: 'common/ChanceOfPrecipitation',
};

export function parseMetOfficeHtml(html: string): ScrapedHourlyForecast[] {
  // For each section, build a map date -> { times, cells }.
  const sections: Record<Section, Map<string, { times: string[]; cells: string[] }>> = {
    WindSpeed: new Map(),
    WindGusts: new Map(),
    WindDirection: new Map(),
    Temperature: new Map(),
    FeelsLikeTemperature: new Map(),
    Humidity: new Map(),
    UV: new Map(),
    Visibility: new Map(),
    WeatherSymbols: new Map(),
    ChanceOfPrecipitation: new Map(),
  };

  (Object.keys(SECTION_IDS) as Section[]).forEach(name => {
    const sliced = sliceSection(html, SECTION_IDS[name]);
    if (!sliced) return;
    for (const day of extractDayTables(sliced)) {
      sections[name].set(day.date, {
        times: extractTimeLabels(day.html),
        cells: extractDataCells(day.html),
      });
    }
  });

  // Use WindSpeed as the day/hour grid spine — it's always present per hour.
  const windSpine = sections.WindSpeed;
  const days = [...windSpine.keys()].sort();

  const out: ScrapedHourlyForecast[] = [];

  for (const date of days) {
    const spine = windSpine.get(date)!;
    for (let i = 0; i < spine.times.length; i++) {
      const hour = parseHourLabel(spine.times[i]);
      if (hour === null) continue;

      const cellFrom = (section: Section): string =>
        sections[section].get(date)?.cells[i] ?? '';

      out.push({
        time: ukLocalToUtcIso(date, hour),
        windSpeed10m:         parseWindSpeedCell(spine.cells[i]),
        windGustSpeed10m:     parseWindSpeedCell(cellFrom('WindGusts')),
        windDirectionFrom10m: parseWindDirectionCell(cellFrom('WindDirection')),
        screenTemperature:    parseTempCell(cellFrom('Temperature')),
        feelsLikeTemp:        parseTempCell(cellFrom('FeelsLikeTemperature')),
        humidity:             parsePercentCell(cellFrom('Humidity')),
        uvIndex:              parseUvCell(cellFrom('UV')),
        visibility:           parseVisibilityCell(cellFrom('Visibility')),
        significantWeatherCode: parseWeatherCodeCell(cellFrom('WeatherSymbols')),
        probOfPrecipitation:  parsePercentCell(cellFrom('ChanceOfPrecipitation')),
        precipitationRate:    0,
        mslp:                 1013,
      });
    }
  }

  return out;
}

// Per-instance memo. On edge runtimes the function module is re-used across
// requests while the instance stays warm, so this collapses concurrent and
// near-simultaneous fetches for the same geohash into one upstream hit.
// `lastGood` is kept separately so we can serve stale-on-error.
interface CacheEntry {
  fresh: { expires: number; data: ScrapedHourlyForecast[] } | null;
  lastGood: ScrapedHourlyForecast[] | null;
  inflight: Promise<ScrapedHourlyForecast[]> | null;
}
const SCRAPE_TTL_MS = 20 * 60 * 1000; // Met Office updates roughly hourly; 20m is plenty fresh.
const memo = new Map<string, CacheEntry>();

async function fetchAndParse(geohash: string): Promise<ScrapedHourlyForecast[]> {
  const url = `https://weather.metoffice.gov.uk/forecast/${encodeURIComponent(geohash)}`;
  const res = await fetch(url, {
    headers: {
      // Polite, identifies the project so Met Office can contact if it ever becomes a problem.
      'User-Agent': 'PooleHarbourWxBot/1.0 (+https://github.com/benmcavoy/metofficewrapper) personal-use scraper',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-GB,en;q=0.9',
    },
    redirect: 'follow',
  });
  if (!res.ok) {
    throw new Error(`Met Office scrape failed: ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  const forecasts = parseMetOfficeHtml(html);
  if (!forecasts.length) {
    throw new Error('Met Office scrape parsed zero forecasts — page layout may have changed');
  }
  return forecasts;
}

// Drop one geohash (or everything) from the in-memory cache. Used by the admin
// endpoint when an obviously-bad forecast needs purging before the natural TTL.
export function clearMetOfficeScrapeCache(geohash?: string): { cleared: string[] } {
  if (geohash) {
    const key = geohash.trim().toLowerCase();
    const had = memo.delete(key);
    return { cleared: had ? [key] : [] };
  }
  const cleared = [...memo.keys()];
  memo.clear();
  return { cleared };
}

export async function scrapeMetOfficeForecast(geohash: string): Promise<ScrapedHourlyForecast[]> {
  const key = geohash.trim().toLowerCase();
  const entry = memo.get(key) ?? { fresh: null, lastGood: null, inflight: null };
  const now = Date.now();

  if (entry.fresh && entry.fresh.expires > now) return entry.fresh.data;
  if (entry.inflight) return entry.inflight;

  const promise = fetchAndParse(key)
    .then(data => {
      entry.fresh = { expires: Date.now() + SCRAPE_TTL_MS, data };
      entry.lastGood = data;
      entry.inflight = null;
      memo.set(key, entry);
      return data;
    })
    .catch(err => {
      entry.inflight = null;
      memo.set(key, entry);
      // Serve last good response if Met Office blips — better stale than nothing.
      if (entry.lastGood) return entry.lastGood;
      throw err;
    });

  entry.inflight = promise;
  memo.set(key, entry);
  return promise;
}
