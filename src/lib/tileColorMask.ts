import type { GeoPoint } from './tideMapMask';

export type ColorMaskVerdict = 'land' | 'water' | 'unknown';

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a?: number;
}

const TILE_SIZE = 256;
const COLOR_MASK_ZOOM = 14;
// Each cached ImageData is ~256 KB. Cap at 64 tiles → ~16 MB ceiling. Map
// preserves insertion order so the oldest entry is always at the front, which
// makes LRU-by-set + LRU-on-hit trivial without an external dep.
const TILE_CACHE_MAX = 64;
const tileCache = new Map<string, Promise<ImageData | null>>();

function touchCache(key: string, promise: Promise<ImageData | null>): void {
  tileCache.delete(key);
  tileCache.set(key, promise);
  while (tileCache.size > TILE_CACHE_MAX) {
    const oldest = tileCache.keys().next().value;
    if (oldest === undefined) break;
    tileCache.delete(oldest);
  }
}

export function classifyMapColor({ r, g, b, a = 255 }: Rgba): ColorMaskVerdict {
  if (a < 32) return 'unknown';

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;
  const brightness = (r + g + b) / 3;

  // CARTO Voyager water is a soft blue/cyan family. Require blue dominance so
  // pale cream land and white roads do not get swallowed as water.
  if (
    b >= 170 &&
    g >= 155 &&
    b >= r + 14 &&
    g >= r + 2
  ) {
    return 'water';
  }

  // Voyager land is mostly cream/white, with parks and marshes rendered green.
  if (
    brightness >= 205 &&
    chroma <= 42 &&
    b <= Math.max(r, g) + 12
  ) {
    return 'land';
  }
  if (
    g >= 145 &&
    g >= r - 16 &&
    g >= b + 8 &&
    brightness >= 130
  ) {
    return 'land';
  }
  if (
    r >= 210 &&
    g >= 195 &&
    b <= 190
  ) {
    return 'land';
  }

  // Dark labels, roads, contour strokes and seamark symbols are ignored. The
  // neighbourhood vote will classify around them from surrounding fill pixels.
  return 'unknown';
}

export function classifyMapPixelNeighbourhood(
  imageData: ImageData,
  x: number,
  y: number,
  radiusPx = 8,
  stepPx = 2,
): ColorMaskVerdict {
  let land = 0;
  let water = 0;

  const cx = Math.round(x);
  const cy = Math.round(y);
  for (let dy = -radiusPx; dy <= radiusPx; dy += stepPx) {
    for (let dx = -radiusPx; dx <= radiusPx; dx += stepPx) {
      const px = cx + dx;
      const py = cy + dy;
      if (px < 0 || py < 0 || px >= imageData.width || py >= imageData.height) continue;
      const i = (py * imageData.width + px) * 4;
      const verdict = classifyMapColor({
        r: imageData.data[i],
        g: imageData.data[i + 1],
        b: imageData.data[i + 2],
        a: imageData.data[i + 3],
      });
      if (verdict === 'land') land++;
      else if (verdict === 'water') water++;
    }
  }

  const known = land + water;
  if (known < 4) return 'unknown';
  if (land / known >= 0.58) return 'land';
  if (water / known >= 0.58) return 'water';
  return 'unknown';
}

export async function classifyBasemapPoint(point: GeoPoint): Promise<ColorMaskVerdict> {
  if (typeof document === 'undefined') return 'unknown';

  const tilePoint = latLonToTilePixel(point.lat, point.lon, COLOR_MASK_ZOOM);
  const imageData = await loadTileImageData(tilePoint.tileX, tilePoint.tileY, COLOR_MASK_ZOOM);
  if (!imageData) return 'unknown';

  return classifyMapPixelNeighbourhood(imageData, tilePoint.pixelX, tilePoint.pixelY);
}

function latLonToTilePixel(lat: number, lon: number, zoom: number) {
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const sinLat = Math.sin((clampedLat * Math.PI) / 180);
  const scale = 2 ** zoom;
  const tileFloatX = ((lon + 180) / 360) * scale;
  const tileFloatY = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;

  const tileX = Math.floor(tileFloatX);
  const tileY = Math.floor(tileFloatY);
  return {
    tileX,
    tileY,
    pixelX: (tileFloatX - tileX) * TILE_SIZE,
    pixelY: (tileFloatY - tileY) * TILE_SIZE,
  };
}

function loadTileImageData(x: number, y: number, z: number): Promise<ImageData | null> {
  const key = `${z}/${x}/${y}`;
  const cached = tileCache.get(key);
  if (cached) {
    // Mark as recently used so the LRU doesn't evict tiles being actively read.
    touchCache(key, cached);
    return cached;
  }

  const promise = fetch(`https://a.basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`, {
    mode: 'cors',
  })
    .then(async res => {
      if (!res.ok) return null;
      const blob = await res.blob();
      const canvas = document.createElement('canvas');
      canvas.width = TILE_SIZE;
      canvas.height = TILE_SIZE;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      if (typeof createImageBitmap === 'function') {
        const bitmap = await createImageBitmap(blob);
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
      } else {
        const image = await loadBlobImage(blob);
        ctx.drawImage(image, 0, 0);
      }
      return ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE);
    })
    .catch(() => null);

  touchCache(key, promise);
  return promise;
}

function loadBlobImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Unable to decode map tile'));
    };
    image.src = url;
  });
}
