import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, CircleMarker, useMap } from 'react-leaflet';
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

// Display cell ~1.6 km — one arrow per cell after sampling.
const ARROW_CELL_DEG = 0.015;

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

// FitBounds: react-leaflet child that runs once after the map mounts and fits
// the view to the supplied bounds with sensible padding.
function FitBounds({ bounds }: { bounds: L.LatLngBoundsExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (!bounds) return;
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 13 });
  }, [bounds, map]);
  return null;
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

  const arrows: { loc: MarineLocation; flow: MarinePoint }[] = [];
  if (grid) {
    // Spatial bucket dedup: one arrow per ~1.6 km cell. This gives a uniform
    // arrow field across water so the eye reads it as a flow pattern, even
    // though adjacent buckets often share values (Open-Meteo's ocean model
    // resolution is ~9 km). Land points return null currents and are dropped.
    const seen = new Map<string, { loc: MarineLocation; flow: MarinePoint; distSq: number }>();
    const cell = ARROW_CELL_DEG;
    for (const loc of grid.locations) {
      // Filter land: Open-Meteo returns positive elevation on land and
      // negative (bathymetric depth) on sea. Tidal reaches near the coast
      // can sit slightly above 0 m; allow a small buffer so estuaries pass.
      if (loc.elevation != null && loc.elevation > 1) continue;
      const flow = nearestFlow(loc.points, at);
      if (!flow || flow.currentDirection == null || flow.currentVelocity == null) continue;
      const cy = Math.round((loc.lat - centerLat) / cell);
      const cx = Math.round((loc.lon - centerLon) / cell);
      const key = `${cy}|${cx}`;
      const dLat = loc.lat - (centerLat + cy * cell);
      const dLon = loc.lon - (centerLon + cx * cell);
      const distSq = dLat * dLat + dLon * dLon;
      const existing = seen.get(key);
      if (!existing || distSq < existing.distSq) {
        seen.set(key, { loc, flow, distSq });
      }
    }
    for (const v of seen.values()) arrows.push({ loc: v.loc, flow: v.flow });
  }

  const maxKnots = arrows.reduce((m, a) => Math.max(m, (a.flow.currentVelocity ?? 0) * KMH_TO_KNOTS), 0);

  // Auto-fit bounds: include all arrow positions + the centre dot so the
  // camera frames water (not a random patch including dry land).
  const bounds = useMemo<L.LatLngBoundsExpression | null>(() => {
    if (!arrows.length) return null;
    const pts: [number, number][] = arrows.map(a => [a.loc.lat, a.loc.lon]);
    pts.push([centerLat, centerLon]);
    return pts;
  }, [arrows, centerLat, centerLon]);

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
          <CircleMarker
            center={[centerLat, centerLon]}
            radius={6}
            pathOptions={{ color: 'var(--primary)', fillColor: 'var(--primary)', fillOpacity: 1, weight: 2 }}
          />
          {arrows.map(({ loc, flow }) => (
            <Marker
              key={`${loc.lat}-${loc.lon}`}
              position={[loc.lat, loc.lon]}
              icon={flowArrowIcon(flow.currentDirection!, (flow.currentVelocity ?? 0) * KMH_TO_KNOTS)}
              interactive={false}
            />
          ))}
          <FitBounds bounds={bounds} />
        </MapContainer>
        {grid && arrows.length === 0 && (
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
          : arrows.length > 0
            ? <span>
                Peak {maxKnots.toFixed(1)}kt
                {arrows[0]?.flow.currentDirection != null && ` ${degreesToCardinal(arrows[0].flow.currentDirection)}`}
              </span>
            : <span>Loading flow…</span>}
      </div>
    </div>
  );
}
