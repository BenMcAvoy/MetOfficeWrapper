import type { TideData } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Waves, Anchor } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine
} from 'recharts';
import { XAxisTick, YAxisTick, tooltipStyle } from '@/lib/chartUtils';
import { format, isAfter, isBefore, addHours, startOfDay, endOfDay, isSameDay } from 'date-fns';

interface TideChartProps {
  tideData: TideData;
  selectedDay: Date;
}

function TideExtremeRow({ time, height, type }: { time: Date; height: number; type: 'High' | 'Low' }) {
  const isPast = isBefore(time, new Date());
  return (
    <div className={`flex items-center justify-between py-2 px-3 rounded-lg ${isPast ? 'opacity-40' : 'bg-muted/50'}`}>
      <div className="flex items-center gap-2">
        {type === 'High'
          ? <Waves className="h-4 w-4 text-primary" />
          : <Anchor className="h-4 w-4 text-muted-foreground" />}
        <div>
          <p className="text-foreground font-medium text-sm">{type} Water</p>
          <p className="text-muted-foreground text-xs">{format(time, 'EEE d MMM, HH:mm')}</p>
        </div>
      </div>
      <Badge variant="outline">{height.toFixed(2)}m</Badge>
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
    className = 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300';
  } else if (posInHalf < 5.5) {
    label = 'Springs';
    className = 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300';
  } else if (posInHalf < 7.5) {
    label = 'Easing to Neaps';
    className = 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
  } else if (posInHalf < 10) {
    label = 'Neaps';
    className = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
  } else {
    label = 'Building to Springs';
    className = 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300';
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

export default function TideChart({ tideData, selectedDay }: TideChartProps) {
  const now = new Date();
  const isToday = isSameDay(selectedDay, now);

  const chartStart = isToday ? addHours(now, -1) : startOfDay(selectedDay);
  const chartEnd = isToday ? addHours(now, 48) : endOfDay(selectedDay);

  const chartData = tideData.heights
    .filter(h => isAfter(h.time, chartStart) && isBefore(h.time, chartEnd))
    .map(h => ({
      t: h.time.getTime(),
      height: Math.round(h.height * 100) / 100,
    }));

  const xTicks = (() => {
    const ticks: number[] = [];
    const start = new Date(chartStart);
    start.setMinutes(0, 0, 0);
    if (start.getHours() % 3 !== 0) start.setHours(start.getHours() + (3 - start.getHours() % 3));
    for (let t = start.getTime(); t <= chartEnd.getTime(); t += 3 * 60 * 60 * 1000) ticks.push(t);
    return ticks;
  })();

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
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="tideGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} ticks={xTicks} tickFormatter={(t) => format(new Date(t), 'HH:mm')} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
                <YAxis tick={<YAxisTick unit="m" />} width={40} domain={['auto', 'auto']} />
                <Tooltip {...tooltipStyle} labelFormatter={(t) => format(new Date(t), 'HH:mm')} formatter={(v) => [`${Number(v).toFixed(2)}m`, 'Height']} />
                {currentHeight !== null && (
                  <ReferenceLine
                    y={currentHeight}
                    stroke="var(--primary)"
                    strokeDasharray="4 4"
                    label={(props) => (
                      <text x={props.viewBox?.x} y={(props.viewBox?.y ?? 0) - 4} style={{ fill: 'var(--primary)' }} fontSize={10} textAnchor="middle">Now</text>
                    )}
                  />
                )}
                <Area type="monotone" dataKey="height" stroke="#2563eb" fill="url(#tideGrad)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Tide Times</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            {upcomingExtremes.map((e, i) => (
              <TideExtremeRow key={i} time={e.time} height={e.height} type={e.type} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
