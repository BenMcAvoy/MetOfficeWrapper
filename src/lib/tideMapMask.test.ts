import { describe, expect, it } from 'vitest';
import {
  buildGridPoints,
  buildLandMaskPoints,
  isLikelyLand,
  localDistanceSq,
  type ElevationMaskSample,
} from './tideMapMask';

describe('tide map land mask', () => {
  it('uses latitude-corrected distance so east-west separation is not overstated', () => {
    const referenceLat = 50;
    const origin = { lat: referenceLat, lon: 0 };
    const north = { lat: referenceLat + 0.1, lon: 0 };
    const east = { lat: referenceLat, lon: 0.1 };

    expect(localDistanceSq(origin, east, referenceLat)).toBeLessThan(
      localDistanceSq(origin, north, referenceLat),
    );
  });

  it('keeps narrow water when nearby water samples beat surrounding land', () => {
    const samples: ElevationMaskSample[] = [
      { lat: 50, lon: -2.000, elevation: 0 },
      { lat: 50, lon: -1.990, elevation: 0 },
      { lat: 50, lon: -2.020, elevation: 12 },
      { lat: 50, lon: -1.970, elevation: 15 },
      { lat: 50.015, lon: -2.000, elevation: 18 },
      { lat: 49.985, lon: -2.000, elevation: 16 },
    ];

    expect(isLikelyLand({ lat: 50, lon: -1.995 }, samples, 50)).toBe(false);
  });

  it('masks inland points when land samples dominate the local neighbourhood', () => {
    const samples: ElevationMaskSample[] = [
      { lat: 50, lon: -2.000, elevation: 20 },
      { lat: 50, lon: -1.990, elevation: 22 },
      { lat: 50.010, lon: -2.000, elevation: 18 },
      { lat: 49.990, lon: -2.000, elevation: 17 },
      { lat: 50, lon: -2.030, elevation: 0 },
    ];

    expect(isLikelyLand({ lat: 50, lon: -1.998 }, samples, 50)).toBe(true);
  });

  it('builds a denser elevation mask than the marine current grid', () => {
    expect(buildLandMaskPoints(50.71, -2.01).length).toBeGreaterThan(
      buildGridPoints(50.71, -2.01).length,
    );
  });
});
