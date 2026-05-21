import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { ElevationGrid, MarineGrid, MarineLocation, MarinePoint } from '@/lib/api';
import { fetchElevationGrid, fetchMarineGrid } from '@/lib/api';
import {
  buildGridPoints,
  buildLandMaskPoints,
  cellDegForZoom,
  isLikelyLand,
  localDistanceSq,
} from '@/lib/tideMapMask';
import { classifyBasemapPoint } from '@/lib/tileColorMask';
import { degreesToCardinal } from '@/lib/units';
import { Plus, Minus, Clock } from 'lucide-react';
import { format, isSameDay } from 'date-fns';

// Watches the app's `.dark` class so map elements (arrows, popover) can
// re-theme themselves alongside everything else. The BASEMAP itself stays the
// same (CARTO Voyager) in both modes — its cream-land / soft-blue-water style
// reads like a paper nautical chart and feels warmer than a fully dark tile.
function useIsDarkMode(): boolean {
  const [isDark, setIsDark] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  );
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const obs = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

const KMH_TO_KNOTS = 0.539957;

interface TideMapProps {
  centerLat: number;
  centerLon: number;
  locationName: string;
  at: Date;
}

// Subscribes to map zoom changes and re-renders the arrow layer with a bucket
// cell that scales with current zoom — sparser when zoomed out, denser in.
function FlowArrowLayer({
  grid, landMask, at, centerLat, centerLon, onArrowClick,
}: {
  grid: MarineGrid;
  landMask: ElevationGrid | null;
  at: Date;
  centerLat: number;
  centerLon: number;
  onArrowClick: (info: { knots: number; dir: number; lat: number; lon: number }) => void;
}) {
  const map = useMap();
  const [view, setView] = useState(() => ({ zoom: map.getZoom(), bounds: map.getBounds() }));
  useMapEvents({
    moveend: () => setView({ zoom: map.getZoom(), bounds: map.getBounds() }),
  });

  const [arrows, setArrows] = useState<{ key: string; lat: number; lon: number; flow: MarinePoint }[]>([]);

  const arrowCandidates = useMemo(() => {
    // 1. Use all valid-current samples as flow sources. Land/water is decided
    // separately by the denser elevation mask below, because marine cells can
    // snap inland points back to nearby ocean current data.
    const waterSamples: { lat: number; lon: number; flow: MarinePoint }[] = [];
    let sMinLat = Infinity, sMaxLat = -Infinity, sMinLon = Infinity, sMaxLon = -Infinity;
    for (const loc of grid.locations) {
      if (loc.lat < sMinLat) sMinLat = loc.lat;
      if (loc.lat > sMaxLat) sMaxLat = loc.lat;
      if (loc.lon < sMinLon) sMinLon = loc.lon;
      if (loc.lon > sMaxLon) sMaxLon = loc.lon;
      const flow = nearestFlow(loc.points, at);
      if (!flow || flow.currentDirection == null || flow.currentVelocity == null) continue;
      waterSamples.push({ lat: loc.lat, lon: loc.lon, flow });
    }
    if (!waterSamples.length) return [];

    // 2. Build display grid clipped to (visible viewport) ∩ (sample box).
    const cell = cellDegForZoom(view.zoom, centerLat);
    const vb = view.bounds;
    const lo = vb.getSouthWest(), hi = vb.getNorthEast();
    const minLat = Math.max(sMinLat, lo.lat);
    const maxLat = Math.min(sMaxLat, hi.lat);
    const minLon = Math.max(sMinLon, lo.lng);
    const maxLon = Math.min(sMaxLon, hi.lng);
    if (minLat > maxLat || minLon > maxLon) return [];

    const yStart = Math.floor((minLat - centerLat) / cell.lat);
    const yEnd = Math.ceil((maxLat - centerLat) / cell.lat);
    const xStart = Math.floor((minLon - centerLon) / cell.lon);
    const xEnd = Math.ceil((maxLon - centerLon) / cell.lon);

    // 3. For each display cell, use the dense elevation mask to skip likely
    // land and the nearest valid marine source for the flow value.
    const maskSamples = landMask?.locations ?? grid.locations;
    const out: { key: string; lat: number; lon: number; flow: MarinePoint; elevationSaysLand: boolean }[] = [];
    for (let dy = yStart; dy <= yEnd; dy++) {
      for (let dx = xStart; dx <= xEnd; dx++) {
        const lat = centerLat + dy * cell.lat;
        const lon = centerLon + dx * cell.lon;
        const elevationSaysLand = maskSamples.length > 0 && isLikelyLand({ lat, lon }, maskSamples, centerLat);

        let nearestWater = waterSamples[0];
        let nearestWaterDistSq = Infinity;
        for (const s of waterSamples) {
          const dSq = localDistanceSq({ lat, lon }, s, centerLat);
          if (dSq < nearestWaterDistSq) { nearestWaterDistSq = dSq; nearestWater = s; }
        }

        out.push({ key: `${dy}|${dx}`, lat, lon, flow: nearestWater.flow, elevationSaysLand });
      }
    }
    return out;
  }, [grid, landMask, at, view, centerLat, centerLon]);

  useEffect(() => {
    let cancelled = false;

    Promise.all(arrowCandidates.map(async candidate => {
      const verdict = await classifyBasemapPoint(candidate);
      if (verdict === 'land') return null;
      if (verdict === 'water' || !candidate.elevationSaysLand) {
        return {
          key: candidate.key,
          lat: candidate.lat,
          lon: candidate.lon,
          flow: candidate.flow,
        };
      }
      return null;
    })).then(next => {
      if (!cancelled) {
        setArrows(next.filter((arrow): arrow is { key: string; lat: number; lon: number; flow: MarinePoint } => arrow !== null));
      }
    });

    return () => { cancelled = true; };
  }, [arrowCandidates]);

  return (
    <>
      {arrows.map(a => {
        const knots = (a.flow.currentVelocity ?? 0) * KMH_TO_KNOTS;
        const dir = a.flow.currentDirection!;
        return (
          <Marker
            key={a.key}
            position={[a.lat, a.lon]}
            icon={flowArrowIcon(dir, knots)}
            eventHandlers={{
              click: () => onArrowClick({ knots, dir, lat: a.lat, lon: a.lon }),
            }}
          />
        );
      })}
    </>
  );
}

function nearestFlow(points: MarinePoint[], at: Date): MarinePoint | null {
  if (!points.length) return null;
  let nearest = points[0];
  let bestDiff = Math.abs(points[0].time.getTime() - at.getTime());
  for (const p of points) {
    const d = Math.abs(p.time.getTime() - at.getTime());
    if (d < bestDiff) { bestDiff = d; nearest = p; }
  }
  return bestDiff <= 90 * 60 * 1000 ? nearest : null;
}

// Flow-field arrow. Length, stroke weight, AND opacity all scale smoothly
// with knots so weak flows whisper and strong flows pop — the eye instantly
// finds the hot spots without colour-jumps between tiers.
function flowArrowIcon(directionDeg: number, knots: number): L.DivIcon {
  const t = Math.min(1, knots / 2); // 0 → weak, 1 → ≥2 kt
  const len = 9 + t * 16;            // 9 .. 25 px
  const sw = 1.0 + t * 1.4;          // 1.0 .. 2.4 px stroke
  const alpha = (0.35 + t * 0.5).toFixed(2); // 0.35 .. 0.85
  // Deep navy — calm and chart-like; pairs with CARTO Voyager's cream basemap.
  const stroke = `rgba(30, 58, 138, ${alpha})`;
  // Soft cream halo to lift the arrow off the basemap without that "default
  // Leaflet white sticker" feel.
  const halo = 'rgba(254, 250, 240, 0.55)';
  const haloSw = sw + 2.2;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="-14 -14 28 28" style="overflow:visible">
      <g transform="rotate(${directionDeg})">
        <line x1="0" y1="${len / 2}" x2="0" y2="${-len / 2 + 1}"
              stroke="${halo}" stroke-width="${haloSw}" stroke-linecap="round" />
        <polyline points="-3.5,${-len / 2 + 4.5} 0,${-len / 2} 3.5,${-len / 2 + 4.5}"
                  stroke="${halo}" stroke-width="${haloSw}" fill="none"
                  stroke-linecap="round" stroke-linejoin="round" />
        <line x1="0" y1="${len / 2}" x2="0" y2="${-len / 2 + 1}"
              stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" />
        <polyline points="-3,${-len / 2 + 4} 0,${-len / 2} 3,${-len / 2 + 4}"
                  stroke="${stroke}" stroke-width="${sw}" fill="none"
                  stroke-linecap="round" stroke-linejoin="round" />
      </g>
    </svg>
  `;
  return L.divIcon({
    html: svg,
    className: 'tide-flow-arrow',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

export default function TideMap({ centerLat, centerLon, locationName, at }: TideMapProps) {
  const gridPoints = useMemo(() => buildGridPoints(centerLat, centerLon), [centerLat, centerLon]);
  const landMaskPoints = useMemo(() => buildLandMaskPoints(centerLat, centerLon), [centerLat, centerLon]);
  const [grid, setGrid] = useState<MarineGrid | null>(null);
  const [landMask, setLandMask] = useState<ElevationGrid | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [map, setMap] = useState<L.Map | null>(null);
  const [selectedArrow, setSelectedArrow] = useState<{ knots: number; dir: number; lat: number; lon: number } | null>(null);
  const isDark = useIsDarkMode();
  // CARTO Voyager: cream/parchment land, soft blue water — nautical-chart feel.
  const baseTileUrl = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

  useEffect(() => {
    let cancelled = false;
    fetchMarineGrid(gridPoints)
      .then(g => {
        if (!cancelled) {
          setGrid(g);
          setError(null);
        }
      })
      .catch(e => { if (!cancelled) setError((e as Error).message); });

    fetchElevationGrid(landMaskPoints)
      .then(mask => { if (!cancelled) setLandMask(mask); })
      .catch(() => { if (!cancelled) setLandMask(null); });

    return () => { cancelled = true; };
  }, [gridPoints, landMaskPoints]);

  // Water-only locations for fit-bounds + peak-knots summary.
  // Filter once here (not per zoom) since the bounds shouldn't shift on zoom.
  const waterLocations: { loc: MarineLocation; flow: MarinePoint }[] = [];
  if (grid) {
    const maskLocations = landMask?.locations ?? [];
    for (const loc of grid.locations) {
      if (maskLocations.length > 0 && isLikelyLand(loc, maskLocations, centerLat)) continue;
      const flow = nearestFlow(loc.points, at);
      if (!flow || flow.currentDirection == null || flow.currentVelocity == null) continue;
      waterLocations.push({ loc, flow });
    }
  }

  const maxKnots = waterLocations.reduce(
    (m, a) => Math.max(m, (a.flow.currentVelocity ?? 0) * KMH_TO_KNOTS),
    0,
  );
  const peakArrow = waterLocations.reduce<{ loc: MarineLocation; flow: MarinePoint } | null>(
    (best, a) => !best || (a.flow.currentVelocity ?? 0) > (best.flow.currentVelocity ?? 0) ? a : best,
    null,
  );


  return (
    <div className="space-y-2">
      <div className="relative rounded-lg overflow-hidden border border-border" style={{ height: 380 }}>
        <MapContainer
          ref={setMap as unknown as React.Ref<L.Map>}
          center={[centerLat, centerLon]}
          zoom={11}
          scrollWheelZoom={false}
          zoomControl={false}
          attributionControl={false}
          style={{ height: '100%', width: '100%', background: 'var(--muted)' }}
        >
          <TileLayer
            key={baseTileUrl}
            url={baseTileUrl}
            subdomains="abcd"
            maxZoom={19}
          />
          <TileLayer
            url="https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png"
            maxZoom={18}
            opacity={isDark ? 0.6 : 0.9}
          />
          {grid && (
            <FlowArrowLayer
              grid={grid}
              landMask={landMask}
              at={at}
              centerLat={centerLat}
              centerLon={centerLon}
              onArrowClick={setSelectedArrow}
            />
          )}
        </MapContainer>

        {/* Custom zoom controls — replaces Leaflet's default white +/− stack. */}
        <div className="absolute top-2 left-2 z-[400] flex flex-col rounded-lg overflow-hidden shadow-md border border-border bg-background/95 backdrop-blur-sm">
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => map?.zoomIn()}
            className="h-8 w-8 flex items-center justify-center text-foreground hover:bg-muted active:bg-muted/80 transition-colors border-b border-border"
          >
            <Plus className="h-4 w-4" strokeWidth={2.4} />
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => map?.zoomOut()}
            className="h-8 w-8 flex items-center justify-center text-foreground hover:bg-muted active:bg-muted/80 transition-colors"
          >
            <Minus className="h-4 w-4" strokeWidth={2.4} />
          </button>
        </div>

        {/* Time-of-flow badge — top right. Tells the user which moment the
            arrow field represents. */}
        <div className="absolute top-0 right-0 z-[400] inline-flex items-center gap-1.5 text-[9.5px] font-medium leading-none text-foreground bg-background/85 backdrop-blur-sm px-1.5 py-1 rounded-bl">
          <Clock className="h-3 w-3 text-primary" strokeWidth={2.4} />
          {isSameDay(at, new Date())
            ? <>Now · {format(at, 'HH:mm')}</>
            : <>{format(at, 'EEE d · HH:mm')}</>}
        </div>

        {/* Selected-arrow popover. */}
        {selectedArrow && (
          <div className="absolute bottom-2 right-2 z-[401] bg-background/95 backdrop-blur-sm border border-border rounded-lg shadow-md px-3 py-2 text-xs flex items-start gap-2 max-w-[220px]">
            <div className="flex-1 space-y-0.5">
              <p className="font-semibold text-foreground tabular-nums">
                {selectedArrow.knots.toFixed(2)} kt
              </p>
              <p className="text-muted-foreground tabular-nums">
                Flowing {degreesToCardinal(selectedArrow.dir)} ({Math.round(selectedArrow.dir)}°)
              </p>
              <p className="text-[10px] text-muted-foreground/70 tabular-nums">
                {selectedArrow.lat.toFixed(3)}, {selectedArrow.lon.toFixed(3)}
              </p>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setSelectedArrow(null)}
              className="text-muted-foreground hover:text-foreground -mt-0.5 -mr-0.5 text-base leading-none"
            >
              ×
            </button>
          </div>
        )}

        {/* Attribution — flush to the bottom-left corner of the chart. */}
        <div className="absolute bottom-0 left-0 z-[400] text-[9.5px] leading-none text-muted-foreground bg-background/85 backdrop-blur-sm px-1.5 py-1 rounded-tr">
          ©{' '}
          <a
            href="https://www.carto.com/attributions"
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground underline-offset-2 hover:underline"
          >
            CARTO
          </a>
          {' · '}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground underline-offset-2 hover:underline"
          >
            OSM
          </a>
          {' · '}
          <a
            href="https://www.openseamap.org/"
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground underline-offset-2 hover:underline"
          >
            OpenSeaMap
          </a>
        </div>

        {grid && waterLocations.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-sm pointer-events-none">
            <p className="text-sm text-muted-foreground px-3 py-1.5 rounded-md bg-background/80 border border-border">
              No tidal flow data for this area
            </p>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <span>{locationName}</span>
        {error
          ? <span className="text-destructive">Flow data unavailable</span>
          : waterLocations.length > 0
            ? <span>
                Peak {maxKnots.toFixed(1)}kt
                {peakArrow?.flow.currentDirection != null && ` ${degreesToCardinal(peakArrow.flow.currentDirection)}`}
              </span>
            : <span>Loading flow…</span>}
      </div>
    </div>
  );
}
