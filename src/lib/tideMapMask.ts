export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface ElevationMaskSample extends GeoPoint {
  elevation: number | null;
}

export const LAND_ELEVATION_THRESHOLD_M = 3;

const TARGET_ARROW_PX = 34;

// Marine currents are coarse, but coastlines inside Poole Harbour are not.
// Keep the flow grid modest and use this denser elevation-only grid for the
// land mask so the overlay does not paint currents over peninsulas and islands.
const INNER_STEP_DEG = 0.022;  // ~2.4 km
const INNER_HALF = 5;          // 11x11 = 121 points spanning ~24 km
const OUTER_STEP_DEG = 0.13;   // ~14 km
const OUTER_HALF = 4;          // 9x9 = 81 points spanning ~117 km

const MASK_INNER_STEP_DEG = 0.011; // ~1.2 km
const MASK_INNER_HALF = 11;        // 23x23 = 529 points
const MASK_OUTER_STEP_DEG = 0.13;
const MASK_OUTER_HALF = 4;

export function cellDegForZoom(zoom: number, lat: number): { lat: number; lon: number } {
  const lonPxPerDeg = (256 * Math.pow(2, zoom) * Math.cos((lat * Math.PI) / 180)) / 360;
  const latPxPerDeg = (256 * Math.pow(2, zoom)) / 360;
  return {
    lat: TARGET_ARROW_PX / latPxPerDeg,
    lon: TARGET_ARROW_PX / lonPxPerDeg,
  };
}

export function buildGridPoints(centerLat: number, centerLon: number): GeoPoint[] {
  return buildTieredPoints(
    centerLat,
    centerLon,
    INNER_STEP_DEG,
    INNER_HALF,
    OUTER_STEP_DEG,
    OUTER_HALF,
  );
}

export function buildLandMaskPoints(centerLat: number, centerLon: number): GeoPoint[] {
  return buildTieredPoints(
    centerLat,
    centerLon,
    MASK_INNER_STEP_DEG,
    MASK_INNER_HALF,
    MASK_OUTER_STEP_DEG,
    MASK_OUTER_HALF,
  );
}

export function localDistanceSq(a: GeoPoint, b: GeoPoint, referenceLat: number): number {
  const lonScale = Math.cos((referenceLat * Math.PI) / 180);
  const dLat = a.lat - b.lat;
  const dLon = (a.lon - b.lon) * lonScale;
  return dLat * dLat + dLon * dLon;
}

export function isLandElevation(elevation: number | null): boolean {
  return elevation != null && elevation > LAND_ELEVATION_THRESHOLD_M;
}

export function isLikelyLand(point: GeoPoint, samples: ElevationMaskSample[], referenceLat: number): boolean {
  let nearestLandDistSq = Infinity;
  let nearestWaterDistSq = Infinity;
  const nearest: { distSq: number; land: boolean }[] = [];

  for (const sample of samples) {
    if (sample.elevation == null) continue;
    const distSq = localDistanceSq(point, sample, referenceLat);
    const land = isLandElevation(sample.elevation);
    if (land) nearestLandDistSq = Math.min(nearestLandDistSq, distSq);
    else nearestWaterDistSq = Math.min(nearestWaterDistSq, distSq);

    nearest.push({ distSq, land });
  }

  if (nearestLandDistSq === Infinity) return false;
  if (nearestWaterDistSq === Infinity) return true;

  // A single nearest sample is noisy around tidal flats. Use it for clear cases,
  // then fall back to a small weighted neighbourhood at the shoreline.
  if (nearestWaterDistSq / nearestLandDistSq >= 1.2) return true;
  if (nearestLandDistSq / nearestWaterDistSq >= 1.2) return false;

  nearest.sort((a, b) => a.distSq - b.distSq);
  const local = nearest.slice(0, 9);
  let landWeight = 0;
  let totalWeight = 0;
  for (const item of local) {
    const weight = 1 / Math.max(item.distSq, 1e-9);
    totalWeight += weight;
    if (item.land) landWeight += weight;
  }

  return totalWeight > 0 && landWeight / totalWeight >= 0.62;
}

function buildTieredPoints(
  centerLat: number,
  centerLon: number,
  innerStepDeg: number,
  innerHalf: number,
  outerStepDeg: number,
  outerHalf: number,
): GeoPoint[] {
  const lonScale = 1 / Math.cos((centerLat * Math.PI) / 180);
  const seen = new Set<string>();
  const points: GeoPoint[] = [];
  const add = (lat: number, lon: number) => {
    const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    if (seen.has(key)) return;
    seen.add(key);
    points.push({ lat, lon });
  };

  for (let dy = -innerHalf; dy <= innerHalf; dy++) {
    for (let dx = -innerHalf; dx <= innerHalf; dx++) {
      add(centerLat + dy * innerStepDeg, centerLon + dx * innerStepDeg * lonScale);
    }
  }
  for (let dy = -outerHalf; dy <= outerHalf; dy++) {
    for (let dx = -outerHalf; dx <= outerHalf; dx++) {
      add(centerLat + dy * outerStepDeg, centerLon + dx * outerStepDeg * lonScale);
    }
  }

  return points;
}
