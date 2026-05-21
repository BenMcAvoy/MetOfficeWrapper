import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { MarineGrid, MarineLocation, MarinePoint } from '@/lib/api';
import { fetchMarineGrid } from '@/lib/api';
import { degreesToCardinal } from '@/lib/units';

const KMH_TO_KNOTS = 0.539957;

interface TideMapProps {
  centerLat: number;
  centerLon: number;
  locationName: string;
  at: Date;
}

// Input sampling grid cell (~1.6 km). This is the finest resolution we can
// show arrows at; the displayed bucket cell scales up from here at low zoom.
const ARROW_CELL_DEG = 0.015;

// Target on-screen spacing between arrows in pixels. Display cell width is
// derived from this and the current map zoom.
const TARGET_ARROW_PX = 46;

function cellDegForZoom(zoom: number, lat: number): { lat: number; lon: number } {
  // 1 deg lon at given lat → pixels: 256 * 2^zoom * cos(lat) / 360
  const lonPxPerDeg = (256 * Math.pow(2, zoom) * Math.cos((lat * Math.PI) / 180)) / 360;
  const latPxPerDeg = (256 * Math.pow(2, zoom)) / 360;
  // No floor: at high zoom the bucket can go finer than the input sample step.
  // We compensate by snapping to the nearest input sample's flow values, so
  // adjacent cells happily share values (the ocean model is ~9 km anyway).
  return {
    lat: TARGET_ARROW_PX / latPxPerDeg,
    lon: TARGET_ARROW_PX / lonPxPerDeg,
  };
}

function buildGridPoints(centerLat: number, centerLon: number): { lat: number; lon: number }[] {
  // Dense sample over a wide area so we get good coverage of harbour, channels, and open sea.
  // 1 deg lat ≈ 111 km. Step ~0.015 deg ≈ 1.65 km; 17x17 = 289 candidates spanning ~26 km.
  // Open-Meteo accepts up to 1000 points per multi-location request, so 289 is one request.
  const step = ARROW_CELL_DEG;
  const half = 8;
  const lonScale = 1 / Math.cos((centerLat * Math.PI) / 180);
  const points: { lat: number; lon: number }[] = [];
  for (let dy = -half; dy <= half; dy++) {
    for (let dx = -half; dx <= half; dx++) {
      points.push({
        lat: centerLat + dy * step,
        lon: centerLon + dx * step * lonScale,
      });
    }
  }
  return points;
}

// FitBounds: fits the camera to the supplied bounds exactly ONCE, the first
// time non-null bounds arrive. Subsequent re-renders (e.g. when `at` ticks
// with `useNow`) must not override the user's zoom/pan.
function FitBounds({ bounds }: { bounds: L.LatLngBoundsExpression | null }) {
  const map = useMap();
  const didFit = useRef(false);
  useEffect(() => {
    if (didFit.current || !bounds) return;
    didFit.current = true;
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 13 });
  }, [bounds, map]);
  return null;
}

// Subscribes to map zoom changes and re-renders the arrow layer with a bucket
// cell that scales with current zoom — sparser when zoomed out, denser in.
function FlowArrowLayer({
  grid, at, centerLat, centerLon,
}: {
  grid: MarineGrid;
  at: Date;
  centerLat: number;
  centerLon: number;
}) {
  const map = useMap();
  const [view, setView] = useState(() => ({ zoom: map.getZoom(), bounds: map.getBounds() }));
  useMapEvents({
    moveend: () => setView({ zoom: map.getZoom(), bounds: map.getBounds() }),
  });

  const arrows = useMemo(() => {
    // 1. Build the list of usable input samples (water + valid flow).
    const samples: { lat: number; lon: number; flow: MarinePoint }[] = [];
    for (const loc of grid.locations) {
      if (loc.elevation != null && loc.elevation > 1) continue;
      const flow = nearestFlow(loc.points, at);
      if (!flow || flow.currentDirection == null || flow.currentVelocity == null) continue;
      samples.push({ lat: loc.lat, lon: loc.lon, flow });
    }
    if (!samples.length) return [];

    // 2. Build display grid aligned to (centerLat, centerLon). Clip to the
    // intersection of (visible viewport) ∩ (input-sample bounding box) so we
    // don't render arrows outside the sampled region.
    const cell = cellDegForZoom(view.zoom, centerLat);
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const s of samples) {
      if (s.lat < minLat) minLat = s.lat;
      if (s.lat > maxLat) maxLat = s.lat;
      if (s.lon < minLon) minLon = s.lon;
      if (s.lon > maxLon) maxLon = s.lon;
    }
    const vb = view.bounds;
    const lo = vb.getSouthWest(), hi = vb.getNorthEast();
    minLat = Math.max(minLat, lo.lat);
    maxLat = Math.min(maxLat, hi.lat);
    minLon = Math.max(minLon, lo.lng);
    maxLon = Math.min(maxLon, hi.lng);
    if (minLat > maxLat || minLon > maxLon) return [];

    // 3. For each display cell in range, find the nearest water sample. If
    // it's within ~one input-grid step, render an arrow at the cell centre
    // with the sample's flow values. Otherwise skip (treats it as land/gap).
    const maxDistSq = (ARROW_CELL_DEG * 1.2) ** 2;
    const yStart = Math.floor((minLat - centerLat) / cell.lat);
    const yEnd = Math.ceil((maxLat - centerLat) / cell.lat);
    const xStart = Math.floor((minLon - centerLon) / cell.lon);
    const xEnd = Math.ceil((maxLon - centerLon) / cell.lon);

    const out: { key: string; lat: number; lon: number; flow: MarinePoint }[] = [];
    for (let dy = yStart; dy <= yEnd; dy++) {
      for (let dx = xStart; dx <= xEnd; dx++) {
        const lat = centerLat + dy * cell.lat;
        const lon = centerLon + dx * cell.lon;
        let nearest = samples[0];
        let nearestDistSq = Infinity;
        for (const s of samples) {
          const dLat = s.lat - lat;
          const dLon = s.lon - lon;
          const dSq = dLat * dLat + dLon * dLon;
          if (dSq < nearestDistSq) {
            nearestDistSq = dSq;
            nearest = s;
          }
        }
        if (nearestDistSq > maxDistSq) continue;
        out.push({ key: `${dy}|${dx}`, lat, lon, flow: nearest.flow });
      }
    }
    return out;
  }, [grid, at, view, centerLat, centerLon]);

  return (
    <>
      {arrows.map(a => (
        <Marker
          key={a.key}
          position={[a.lat, a.lon]}
          icon={flowArrowIcon(a.flow.currentDirection!, (a.flow.currentVelocity ?? 0) * KMH_TO_KNOTS)}
          interactive={false}
        />
      ))}
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

// Flow-field arrow: small, unlabelled, dense. Colour and length encode magnitude
// so a regular grid of arrows reads as a tidal stream pattern (chart-plotter style).
function flowArrowIcon(directionDeg: number, knots: number): L.DivIcon {
  const len = Math.min(22, 10 + Math.min(knots, 2) * 6);
  const stroke = knots >= 1.5 ? '#1e3a8a'
    : knots >= 0.8 ? '#1d4ed8'
    : knots >= 0.3 ? '#2563eb'
    : '#64748b';
  const halo = 'rgba(255,255,255,0.85)';
  const sw = 1.5;
  const haloSw = 3.5;
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
  const [grid, setGrid] = useState<MarineGrid | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMarineGrid(gridPoints)
      .then(g => { if (!cancelled) setGrid(g); })
      .catch(e => { if (!cancelled) setError((e as Error).message); });
    return () => { cancelled = true; };
  }, [gridPoints]);

  // Water-only locations for fit-bounds + peak-knots summary.
  // Filter once here (not per zoom) since the bounds shouldn't shift on zoom.
  const waterLocations: { loc: MarineLocation; flow: MarinePoint }[] = [];
  if (grid) {
    for (const loc of grid.locations) {
      if (loc.elevation != null && loc.elevation > 1) continue;
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

  // Auto-fit bounds: include all water positions + the centre dot so the
  // camera frames water (not a random patch including dry land).
  const bounds = useMemo<L.LatLngBoundsExpression | null>(() => {
    if (!waterLocations.length) return null;
    const pts: [number, number][] = waterLocations.map(a => [a.loc.lat, a.loc.lon]);
    pts.push([centerLat, centerLon]);
    return pts;
  }, [waterLocations, centerLat, centerLon]);

  return (
    <div className="space-y-2">
      <div className="relative rounded-lg overflow-hidden border border-border" style={{ height: 380 }}>
        <MapContainer
          center={[centerLat, centerLon]}
          zoom={11}
          scrollWheelZoom={false}
          style={{ height: '100%', width: '100%', background: 'var(--muted)' }}
        >
          <TileLayer
            attribution='&copy; OpenStreetMap'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
          <TileLayer
            attribution='&copy; OpenSeaMap'
            url="https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png"
            maxZoom={18}
            opacity={0.9}
          />
          {grid && <FlowArrowLayer grid={grid} at={at} centerLat={centerLat} centerLon={centerLon} />}
          <FitBounds bounds={bounds} />
        </MapContainer>
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
