import { describe, expect, it } from 'vitest';
import { MS_TO_KNOTS, msToKnots, beaufortScale, degreesToCardinal } from './units';

describe('msToKnots', () => {
  it('converts 0 m/s to 0 kt', () => {
    expect(msToKnots(0)).toBe(0);
  });

  it('uses the MS_TO_KNOTS constant', () => {
    expect(msToKnots(5)).toBeCloseTo(5 * MS_TO_KNOTS, 5);
  });

  it('handles negative values', () => {
    expect(msToKnots(-3)).toBeCloseTo(-3 * MS_TO_KNOTS, 5);
  });
});

describe('beaufortScale', () => {
  it.each([
    [0, 0, 'Calm'],
    [0.99, 0, 'Calm'],
    [1, 1, 'Light air'],
    [3, 1, 'Light air'],
    [4, 2, 'Light breeze'],
    [10, 3, 'Gentle breeze'],
    [16, 4, 'Moderate breeze'],
    [21, 5, 'Fresh breeze'],
    [27, 6, 'Strong breeze'],
    [33, 7, 'Near gale'],
    [40, 8, 'Gale'],
    [47, 9, 'Severe gale'],
    [55, 10, 'Storm'],
    [63, 11, 'Violent storm'],
    [80, 12, 'Hurricane'],
  ])('%d kt -> F%d %s', (kt, force, description) => {
    expect(beaufortScale(kt)).toEqual({ force, description });
  });
});

describe('degreesToCardinal', () => {
  it.each([
    [0, 'N'],
    [22.5, 'NNE'],
    [45, 'NE'],
    [90, 'E'],
    [180, 'S'],
    [270, 'W'],
    [360, 'N'],
  ])('%d deg -> %s', (deg, label) => {
    expect(degreesToCardinal(deg)).toBe(label);
  });
});
