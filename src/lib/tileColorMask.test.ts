import { describe, expect, it } from 'vitest';
import { classifyMapColor, classifyMapPixelNeighbourhood } from './tileColorMask';

describe('tile colour land mask', () => {
  it('classifies CARTO-style blue fills as water', () => {
    expect(classifyMapColor({ r: 170, g: 211, b: 223 })).toBe('water');
    expect(classifyMapColor({ r: 188, g: 219, b: 231 })).toBe('water');
  });

  it('classifies cream, white and green fills as land', () => {
    expect(classifyMapColor({ r: 242, g: 239, b: 233 })).toBe('land');
    expect(classifyMapColor({ r: 250, g: 249, b: 244 })).toBe('land');
    expect(classifyMapColor({ r: 202, g: 226, b: 187 })).toBe('land');
  });

  it('ignores dark label pixels so neighbourhoods decide the mask', () => {
    expect(classifyMapColor({ r: 66, g: 74, b: 82 })).toBe('unknown');
  });

  it('uses a neighbourhood majority instead of one noisy pixel', () => {
    const width = 5;
    const height = 5;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const offset = i * 4;
      data[offset] = 242;
      data[offset + 1] = 239;
      data[offset + 2] = 233;
      data[offset + 3] = 255;
    }
    const centre = (2 * width + 2) * 4;
    data[centre] = 170;
    data[centre + 1] = 211;
    data[centre + 2] = 223;

    const imageData = { data, width, height } as ImageData;
    expect(classifyMapPixelNeighbourhood(imageData, 2, 2, 2, 1)).toBe('land');
  });
});
