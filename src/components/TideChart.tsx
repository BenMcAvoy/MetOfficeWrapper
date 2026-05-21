import type { TideData, MarineData, MarinePoint } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Waves, ArrowUp } from 'lucide-react';
import { TideChartInner } from '@/components/charts';
import { isAfter, isBefore, addHours, startOfDay, endOfDay, isSameDay, format } from 'date-fns';
import { degreesToCardinal } from '@/lib/units';

interface TideChartProps {
  tideData: TideData;
  marineData: MarineData | null;
  selectedDay: Date;
}

// Open-Meteo ocean_current_velocity is in km/h. 1 km/h = 0.539957 knots.
const KMH_TO_KNOTS = 0.539957;

function TideExtremeRow({ time, height, type }: { time: Date; height: number; type: 'High' | 'Low' }) {
  const isPast = isBefore(time, new Date());
  const isHigh = type === 'High';
  return (
    <div className={`grid grid-cols-[3rem_1fr_auto] items-center gap-3 py-1.5 px-3 rounded-md text-sm ${
      isPast ? 'opacity-40' : 'bg-muted/30'
    }`}>
      <span className="tabular-nums text-foreground font-medium">{format(time, 'HH:mm')}</span>
      <div className="flex items-center gap-2 min-w-0">
        <span className={`h-1.5 w-1.5 rounded-full ${isHigh ? 'bg-primary' : 'bg-muted-foreground/60'}`} />
        <span className="font-medium text-foreground truncate">{isHigh ? 'High water' : 'Low water'}</span>
        <span className="text-muted-foreground text-xs hidden min-[380px]:inline">
          {format(time, 'EEE d MMM')}
        </span>
      </div>
      <span className={`tabular-nums font-semibold ${isHigh ? 'text-primary' : 'text-muted-foreground'}`}>
        {height.toFixed(2)}m
      </span>
    </div>
  );
}

function getTidalCharacter(extremes: import('@/lib/api').TideExtreme[], forDay: Date): {
  label: string;
  range: number | null;
  className: string;
} | null {
  // Moon phase approach: springs lag ~1.5 days behind new/full moon, neaps behind quarter moons.
  // Known new moon: 6 Jan 2000 18:14 UTC. Synodic period: 29.53059 days.
  const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14);
  const synodic = 29.53059;
  const daysSince = (forDay.getTime() - knownNewMoon) / 86400000;
  const cycleDay = ((daysSince % synodic) + synodic) % synodic;

  // Fold into 0–14.77 day half-cycle (new→full or full→new)
  const half = synodic / 2;
  const posInHalf = cycleDay % half;

  // posInHalf 0 = new or full moon. Springs peak ~1.5 days later, neaps ~1.5 days after quarter (~7.38 days in).
  // 0–2.5: approaching springs / just sprung
  // 2.5–5: springs (peak and early ebb)
  // 5–7.5: easing toward neaps
  // 7.5–10: neaps
  // 10–12.5: building toward springs
  // 12.5–14.77: approaching springs

  let label: string;
  let className: string;

  if (posInHalf < 2.5 || posInHalf >= 12.5) {
    label = 'Building to Springs';
    className = 'bg-muted text-muted-foreground';
  } else if (posInHalf < 5.5) {
    label = 'Springs';
    className = 'bg-primary/10 text-primary';
  } else if (posInHalf < 7.5) {
    label = 'Easing to Neaps';
    className = 'bg-muted text-muted-foreground';
  } else if (posInHalf < 10) {
    label = 'Neaps';
    className = 'bg-muted text-muted-foreground';
  } else {
    label = 'Building to Springs';
    className = 'bg-muted text-muted-foreground';
  }

  // Compute actual range from nearest HW/LW pair for display only
  let range: number | null = null;
  let minDiff = Infinity;
  for (let i = 0; i < extremes.length; i++) {
    if (extremes[i].type !== 'High') continue;
    const prev = extremes[i - 1];
    const next = extremes[i + 1];
    const lws = [prev, next].filter(e => e?.type === 'Low').map(e => e.height);
    if (!lws.length) continue;
    const avgLw = lws.reduce((a, b) => a + b, 0) / lws.length;
    const diff = Math.abs(extremes[i].time.getTime() - forDay.getTime());
    if (diff < minDiff) {
      minDiff = diff;
      range = extremes[i].height - avgLw;
    }
  }

  return { label, range, className };
}

function HourlyTideRow({ time, height, flow, isPast, isNow }: {
  time: Date;
  height: number;
  flow: MarinePoint | null;
  isPast: boolean;
  isNow: boolean;
}) {
  const knots = flow?.currentVelocity != null ? flow.currentVelocity * KMH_TO_KNOTS : null;
  const dir = flow?.currentDirection ?? null;
  return (
    <div className={`flex items-center justify-between py-1.5 px-3 rounded-md text-sm ${
      isNow ? 'bg-primary/10 ring-1 ring-primary/30' : isPast ? 'opacity-40' : ''
    }`}>
      <span className="tabular-nums text-foreground font-medium w-12">{format(time, 'HH:mm')}</span>
      <span className="tabular-nums text-foreground w-16 text-right">{height.toFixed(2)}m</span>
      <span className="flex items-center gap-1.5 text-muted-foreground text-xs tabular-nums w-24 justify-end">
        {knots != null && dir != null ? (
          <>
            <ArrowUp className="h-3 w-3" style={{ transform: `rotate(${dir}deg)` }} />
            <span>{knots.toFixed(1)}kt {degreesToCardinal(dir)}</span>
          </>
        ) : <span className="opacity-50">—</span>}
      </span>
    </div>
  );
}

function TideTimelineRow({ row, now, isToday }: {
  row:
    | { kind: 'hourly'; time: Date; height: number; flow: MarinePoint | null }
    | { kind: 'extreme'; time: Date; height: number; type: 'High' | 'Low' };
  now: Date;
  isToday: boolean;
}) {
  if (row.kind === 'extreme') {
    return (
      <TideExtremeRow
        time={row.time}
        height={row.height}
        type={row.type}
      />
    );
  }

  const isPast = isBefore(row.time, addHours(now, -0.5));
  const isNow = isToday && Math.abs(row.time.getTime() - now.getTime()) < 30 * 60 * 1000;
  return (
    <HourlyTideRow
      time={row.time}
      height={row.height}
      flow={row.flow}
      isPast={isPast}
      isNow={isNow}
    />
  );
}

function interpolateHeight(heights: { time: Date; height: number }[], at: Date): number | null {
  if (heights.length < 2) return null;
  const t = at.getTime();
  const before = [...heights].reverse().find(h => h.time.getTime() <= t);
  const after = heights.find(h => h.time.getTime() >= t);
  if (!before || !after) return null;
  if (before === after) return before.height;
  const ratio = (t - before.time.getTime()) / (after.time.getTime() - before.time.getTime());
  return before.height + ratio * (after.height - before.height);
}

function findMarinePoint(points: MarinePoint[], at: Date): MarinePoint | null {
  if (!points.length) return null;
  let nearest = points[0];
  let nearestDiff = Math.abs(points[0].time.getTime() - at.getTime());
  for (const p of points) {
    const d = Math.abs(p.time.getTime() - at.getTime());
    if (d < nearestDiff) { nearest = p; nearestDiff = d; }
  }
  return nearestDiff <= 90 * 60 * 1000 ? nearest : null;
}

export default function TideChart({ tideData, marineData, selectedDay }: TideChartProps) {
  const now = new Date();
  const isToday = isSameDay(selectedDay, now);

  const chartStart = isToday ? addHours(now, -1) : startOfDay(selectedDay);
  const chartEnd = isToday ? addHours(now, 23) : endOfDay(selectedDay);


  const currentHeight = (() => {
    const before = [...tideData.heights].reverse().find(h => !isAfter(h.time, now));
    const after = tideData.heights.find(h => isAfter(h.time, now));
    if (!before || !after) return null;
    const ratio = (now.getTime() - before.time.getTime()) / (after.time.getTime() - before.time.getTime());
    return before.height + ratio * (after.height - before.height);
  })();

  const tidalCharacter = getTidalCharacter(tideData.extremes, isToday ? now : selectedDay);

  const upcomingExtremes = tideData.extremes
    .filter(e => isToday
      ? isAfter(e.time, addHours(now, -1))
      : isAfter(e.time, chartStart) && isBefore(e.time, chartEnd))
    .slice(0, 6);

  const nextExtreme = tideData.extremes.find(e =>
    isToday ? isAfter(e.time, now) : isAfter(e.time, chartStart));
  const minutesUntilNext = nextExtreme
    ? Math.round((nextExtreme.time.getTime() - now.getTime()) / 60000)
    : null;

  // Build hourly list for the selected day (or "rolling 24h" if today).
  const hourlyStart = isToday ? new Date(now.getTime() - 60 * 60 * 1000) : startOfDay(selectedDay);
  const hourlyEnd = isToday ? addHours(now, 23) : endOfDay(selectedDay);
  const hourlyRows: { time: Date; height: number; flow: MarinePoint | null }[] = [];
  const firstHour = new Date(hourlyStart);
  firstHour.setMinutes(0, 0, 0);
  if (firstHour.getTime() < hourlyStart.getTime()) firstHour.setHours(firstHour.getHours() + 1);
  for (let t = firstHour.getTime(); t <= hourlyEnd.getTime(); t += 60 * 60 * 1000) {
    const ht = new Date(t);
    const h = interpolateHeight(tideData.heights, ht);
    if (h == null) continue;
    const flow = marineData ? findMarinePoint(marineData.points, ht) : null;
    hourlyRows.push({ time: ht, height: h, flow });
  }

  const tideTimelineRows = [
    ...hourlyRows.map(row => ({ kind: 'hourly' as const, ...row })),
    ...upcomingExtremes.map(row => ({ kind: 'extreme' as const, ...row })),
  ].sort((a, b) => a.time.getTime() - b.time.getTime());

  const currentFlow = marineData ? findMarinePoint(marineData.points, now) : null;
  const currentKnots = currentFlow?.currentVelocity != null ? currentFlow.currentVelocity * KMH_TO_KNOTS : null;
  const currentDir = currentFlow?.currentDirection ?? null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Current Tide</p>
            <p className="text-2xl font-bold text-primary">
              {currentHeight !== null ? `${currentHeight.toFixed(2)}m` : '—'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">
              Next {nextExtreme?.type} Water
            </p>
            {nextExtreme && minutesUntilNext !== null ? (
              <>
                <p className="text-2xl font-bold">{nextExtreme.height.toFixed(2)}m</p>
                <p className="text-muted-foreground text-xs mt-0.5">
                  in {minutesUntilNext >= 60
                    ? `${Math.floor(minutesUntilNext / 60)}h ${minutesUntilNext % 60}m`
                    : `${minutesUntilNext}m`} @ {format(nextExtreme.time, 'HH:mm')}
                </p>
              </>
            ) : <p className="text-muted-foreground">—</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            <Waves className="h-4 w-4" />
            {tideData.stationName}
            {tidalCharacter && (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ml-1 ${tidalCharacter.className}`}>
                {tidalCharacter.label}{tidalCharacter.range !== null ? ` · ${tidalCharacter.range.toFixed(1)}m` : ''}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TideChartInner
            tideData={tideData}
            windowStart={chartStart}
            windowEnd={chartEnd}
            nowRefLine={currentHeight ?? undefined}
            height={240}
            flowPoints={marineData?.points}
            arrowIntervalHours={isToday ? 3 : 2}
            tickIntervalHours={isToday ? 2 : 3}
          />
        </CardContent>
      </Card>

      {currentFlow && (
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Tidal Flow</p>
                {currentKnots != null && currentDir != null ? (
                  <>
                    <p className="text-2xl font-bold tabular-nums">
                      {currentKnots.toFixed(1)}<span className="text-base font-medium text-muted-foreground ml-1">kt</span>
                    </p>
                    <p className="text-muted-foreground text-xs mt-0.5">
                      flowing {degreesToCardinal(currentDir)} ({Math.round(currentDir)}°)
                    </p>
                  </>
                ) : <p className="text-muted-foreground">—</p>}
              </div>
              {currentDir != null && (
                <div className="relative h-16 w-16 rounded-full border border-border bg-muted/30 flex items-center justify-center">
                  <ArrowUp
                    className="h-9 w-9 text-primary"
                    style={{ transform: `rotate(${currentDir}deg)` }}
                    strokeWidth={2.4}
                  />
                  <span className="absolute top-0.5 text-[8px] text-muted-foreground">N</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {tideTimelineRows.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span>Tide Timeline</span>
              <span className="text-xs font-normal text-muted-foreground">hourly · highs/lows · flow</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {tideTimelineRows.map((row, i) => (
                <TideTimelineRow
                  key={`${row.kind}-${row.time.getTime()}-${i}`}
                  row={row}
                  now={now}
                  isToday={isToday}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
