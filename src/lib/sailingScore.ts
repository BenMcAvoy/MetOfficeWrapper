import { useEffect, useState } from 'react';
import { isSameDay } from 'date-fns';
import type { HourlyForecast, TideData, SunInfo } from './api';
import { msToKnots, degreesToCardinal } from './units';
import { getWeatherInfo } from './weatherCodes';

export type Cardinal = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
export type TideHeightPref = 'high' | 'mid' | 'low' | 'any';
export type TideMovementPref = 'rising' | 'falling' | 'any';
export type Stars = 1 | 2 | 3 | 4 | 5;

export interface SailingPrefs {
  windMinKt: number;
  windMaxKt: number;
  maxGustKt: number;
  preferredDirections: Set<Cardinal>;
  tideHeight: TideHeightPref;
  tideMovement: TideMovementPref;
  maxPrecipPct: number;
  minSailHours: number;
}

export interface DayScore {
  date: Date;
  score: number;
  stars: Stars;
  reason: string;
  breakdown: Record<string, number>;
}

export const DEFAULT_PREFS: SailingPrefs = {
  windMinKt: 6,
  windMaxKt: 20,
  maxGustKt: 28,
  preferredDirections: new Set(),
  tideHeight: 'any',
  tideMovement: 'any',
  maxPrecipPct: 40,
  minSailHours: 2,
};

const WEIGHTS = {
  wind: 0.4,
  gust: 0.15,
  direction: 0.1,
  tide: 0.15,
  weather: 0.15,
} as const;

const PREFS_KEY = 'sailingPrefs.v1';

interface SerialisedPrefs extends Omit<SailingPrefs, 'preferredDirections'> {
  preferredDirections: Cardinal[];
}

export function loadPrefs(): SailingPrefs {
  if (typeof localStorage === 'undefined') return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<SerialisedPrefs>;
    return {
      ...DEFAULT_PREFS,
      ...parsed,
      preferredDirections: new Set(parsed.preferredDirections ?? []),
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs: SailingPrefs): void {
  if (typeof localStorage === 'undefined') return;
  const serialised: SerialisedPrefs = {
    ...prefs,
    preferredDirections: [...prefs.preferredDirections],
  };
  localStorage.setItem(PREFS_KEY, JSON.stringify(serialised));
}

export function useSailingPrefs(): [SailingPrefs, (next: SailingPrefs) => void] {
  const [prefs, setPrefs] = useState<SailingPrefs>(() => loadPrefs());
  useEffect(() => { savePrefs(prefs); }, [prefs]);
  return [prefs, setPrefs];
}

function starsFor(score: number): Stars {
  if (score < 20) return 1;
  if (score < 40) return 2;
  if (score < 60) return 3;
  if (score < 80) return 4;
  return 5;
}

function windFactor(meanKt: number, prefs: SailingPrefs): number {
  const { windMinKt: lo, windMaxKt: hi } = prefs;
  if (meanKt >= lo && meanKt <= hi) return 100;
  const width = Math.max(1, hi - lo);
  const margin = width * 0.5;
  if (meanKt < lo) {
    const d = lo - meanKt;
    return Math.max(0, 100 * (1 - d / margin));
  }
  const d = meanKt - hi;
  return Math.max(0, 100 * (1 - d / margin));
}

function gustFactor(maxGustKt: number, prefs: SailingPrefs): number {
  if (maxGustKt <= prefs.maxGustKt) return 100;
  const over = maxGustKt - prefs.maxGustKt;
  return Math.max(0, 100 * (1 - over / 10));
}

function directionFactor(avgDeg: number, prefs: SailingPrefs): number | null {
  if (prefs.preferredDirections.size === 0) return null;
  const eight = toEightPoint(avgDeg);
  return prefs.preferredDirections.has(eight) ? 100 : 0;
}

export function toEightPoint(deg: number): Cardinal {
  const eight: Cardinal[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return eight[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

function weatherFactor(forecasts: HourlyForecast[], prefs: SailingPrefs): number {
  if (!forecasts.length) return 50;
  const meanPrecip = forecasts.reduce((s, f) => s + f.probOfPrecipitation, 0) / forecasts.length;
  const precipScore = meanPrecip <= prefs.maxPrecipPct
    ? 100
    : Math.max(0, 100 * (1 - (meanPrecip - prefs.maxPrecipPct) / 60));
  // Worst code in the window dictates the weather code score.
  let codeScore = 100;
  for (const f of forecasts) {
    const desc = getWeatherInfo(f.significantWeatherCode).description.toLowerCase();
    let s = 100;
    if (desc.includes('thunder')) s = 0;
    else if (desc.includes('heavy') || desc.includes('hail')) s = 10;
    else if (desc.includes('snow')) s = 20;
    else if (desc.includes('light rain') || desc.includes('drizzle') || desc.includes('shower') || desc.includes('sleet')) s = 50;
    else if (desc.includes('fog') || desc.includes('mist')) s = 60;
    else if (desc.includes('cloud') || desc.includes('overcast')) s = 90;
    if (s < codeScore) codeScore = s;
  }
  return (precipScore + codeScore) / 2;
}

function tideFactor(
  tideData: TideData | null,
  windowStartMs: number,
  windowEndMs: number,
  prefs: SailingPrefs,
): number | null {
  if (!tideData || tideData.heights.length === 0) return null;
  if (prefs.tideHeight === 'any' && prefs.tideMovement === 'any') return 100;

  const inWindow = tideData.heights.filter(h =>
    h.time.getTime() >= windowStartMs && h.time.getTime() <= windowEndMs,
  );
  if (inWindow.length < 2) return null;

  const allHeights = tideData.heights.map(h => h.height);
  const lo = Math.min(...allHeights);
  const hi = Math.max(...allHeights);
  const range = Math.max(0.01, hi - lo);
  const bandLo = lo + range / 3;
  const bandHi = hi - range / 3;

  let okMs = 0;
  for (let i = 1; i < inWindow.length; i++) {
    const a = inWindow[i - 1];
    const b = inWindow[i];
    const dur = b.time.getTime() - a.time.getTime();
    const meanH = (a.height + b.height) / 2;
    const rising = b.height > a.height;

    let heightOk = true;
    if (prefs.tideHeight === 'high') heightOk = meanH >= bandHi;
    else if (prefs.tideHeight === 'low') heightOk = meanH <= bandLo;
    else if (prefs.tideHeight === 'mid') heightOk = meanH > bandLo && meanH < bandHi;

    let movementOk = true;
    if (prefs.tideMovement === 'rising') movementOk = rising;
    else if (prefs.tideMovement === 'falling') movementOk = !rising;

    if (heightOk && movementOk) okMs += dur;
  }
  const requiredMs = prefs.minSailHours * 60 * 60 * 1000;
  if (okMs >= requiredMs) return 100;
  return Math.max(0, 100 * (okMs / requiredMs));
}

function clipWindow(day: Date, sunInfo: SunInfo | null): { start: number; end: number } | null {
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  if (!sunInfo || !isSameDay(sunInfo.sunrise, day)) {
    return { start: dayStart.getTime(), end: dayEnd.getTime() };
  }
  const start = sunInfo.sunrise.getTime() + 30 * 60 * 1000;
  const end = sunInfo.sunset.getTime() - 30 * 60 * 1000;
  if (end <= start) return null;
  return { start, end };
}

function meanDegrees(degs: number[]): number {
  if (!degs.length) return 0;
  let sx = 0, sy = 0;
  for (const d of degs) {
    const r = (d * Math.PI) / 180;
    sx += Math.cos(r);
    sy += Math.sin(r);
  }
  const a = Math.atan2(sy / degs.length, sx / degs.length);
  const deg = (a * 180) / Math.PI;
  return (deg + 360) % 360;
}

export function scoreDay(
  day: Date,
  forecasts: HourlyForecast[],
  tideData: TideData | null,
  sunInfo: SunInfo | null,
  prefs: SailingPrefs,
): DayScore {
  const window = clipWindow(day, sunInfo);
  const baseDate = new Date(day);
  baseDate.setHours(12, 0, 0, 0);

  if (!window) {
    return {
      date: baseDate, score: 0, stars: 1,
      reason: 'Daylight too short',
      breakdown: { daylight: 0 },
    };
  }

  const windowMs = window.end - window.start;
  if (windowMs < prefs.minSailHours * 60 * 60 * 1000) {
    return {
      date: baseDate, score: 0, stars: 1,
      reason: `Need ${prefs.minSailHours}h daylight`,
      breakdown: { daylight: 0 },
    };
  }

  const inWindow = forecasts.filter(f =>
    f.time.getTime() >= window.start && f.time.getTime() <= window.end,
  );
  if (inWindow.length === 0) {
    return {
      date: baseDate, score: 0, stars: 1,
      reason: 'No forecast data',
      breakdown: {},
    };
  }

  const meanWindMs = inWindow.reduce((s, f) => s + f.windSpeed10m, 0) / inWindow.length;
  const meanWindKt = msToKnots(meanWindMs);
  const maxGustKt = msToKnots(Math.max(...inWindow.map(f => f.windGustSpeed10m)));
  const avgDir = meanDegrees(inWindow.map(f => f.windDirectionFrom10m));

  const fWind = windFactor(meanWindKt, prefs);
  const fGust = gustFactor(maxGustKt, prefs);
  const fDir = directionFactor(avgDir, prefs);
  const fWeather = weatherFactor(inWindow, prefs);
  const fTide = tideFactor(tideData, window.start, window.end, prefs);

  let totalWeight = WEIGHTS.wind + WEIGHTS.gust + WEIGHTS.weather;
  let weighted = fWind * WEIGHTS.wind + fGust * WEIGHTS.gust + fWeather * WEIGHTS.weather;
  if (fDir != null) { weighted += fDir * WEIGHTS.direction; totalWeight += WEIGHTS.direction; }
  if (fTide != null) { weighted += fTide * WEIGHTS.tide; totalWeight += WEIGHTS.tide; }

  const score = Math.round(weighted / totalWeight);
  const stars = starsFor(score);

  const breakdown: Record<string, number> = {
    wind: Math.round(fWind),
    gust: Math.round(fGust),
    weather: Math.round(fWeather),
  };
  if (fDir != null) breakdown.direction = Math.round(fDir);
  if (fTide != null) breakdown.tide = Math.round(fTide);

  const reason = buildReason({
    stars, meanWindKt, maxGustKt, avgDir,
    fWind, fGust, fWeather, fDir, fTide,
    tideData, windowStart: window.start, windowEnd: window.end,
  });

  return { date: baseDate, score, stars, reason, breakdown };
}

function buildReason(args: {
  stars: Stars;
  meanWindKt: number; maxGustKt: number; avgDir: number;
  fWind: number; fGust: number; fWeather: number;
  fDir: number | null; fTide: number | null;
  tideData: TideData | null; windowStart: number; windowEnd: number;
}): string {
  const dirLabel = degreesToCardinal(args.avgDir);
  const windLabel = `${dirLabel} ${Math.round(args.meanWindKt)} kt`;
  if (args.stars >= 5) return `${windLabel} — great`;

  const factors: { name: string; score: number; label: string }[] = [
    { name: 'wind', score: args.fWind, label: args.meanWindKt < 6 ? 'Light wind' : args.meanWindKt > 22 ? 'Too windy' : `${windLabel}` },
    { name: 'gust', score: args.fGust, label: `Gusty (${Math.round(args.maxGustKt)} kt)` },
    { name: 'weather', score: args.fWeather, label: 'Wet weather' },
  ];
  if (args.fDir != null) factors.push({ name: 'direction', score: args.fDir, label: `Wind ${dirLabel}` });
  if (args.fTide != null) factors.push({ name: 'tide', score: args.fTide, label: 'Tide off' });

  factors.sort((a, b) => a.score - b.score);
  const worst = factors[0];
  return `${windLabel} · ${worst.label}`;
}

export function groupForecastsByDay(forecasts: HourlyForecast[]): Map<string, HourlyForecast[]> {
  const out = new Map<string, HourlyForecast[]>();
  for (const f of forecasts) {
    const d = new Date(f.time);
    d.setHours(0, 0, 0, 0);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const list = out.get(key);
    if (list) list.push(f);
    else out.set(key, [f]);
  }
  return out;
}
