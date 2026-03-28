const CHARS = '0123456789bcdefghjkmnpqrstuvwxyz';

export function decodeGeohash(geohash: string): { lat: number; lon: number } {
  let isLon = true;
  let lonMin = -180, lonMax = 180;
  let latMin = -90, latMax = 90;

  for (const char of geohash.toLowerCase()) {
    const idx = CHARS.indexOf(char);
    if (idx < 0) break;
    for (let i = 4; i >= 0; i--) {
      const bit = (idx >> i) & 1;
      if (isLon) {
        const mid = (lonMin + lonMax) / 2;
        if (bit) lonMin = mid; else lonMax = mid;
      } else {
        const mid = (latMin + latMax) / 2;
        if (bit) latMin = mid; else latMax = mid;
      }
      isLon = !isLon;
    }
  }

  return {
    lat: (latMin + latMax) / 2,
    lon: (lonMin + lonMax) / 2,
  };
}
