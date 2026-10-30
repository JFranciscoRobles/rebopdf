import type { Page } from '@rebopdf/core';
import { describe, expect, it } from 'vitest';
import { geometryOf, pathData } from '../src/layers';

const page = (rotation: Page['rotation']): Page => ({ id: 'p', source: 's', index: 0, box: { x: 10, y: 20, width: 200, height: 100 }, rotation });

describe('the geometry of a page', () => {
  it('puts the corners of the page where it is turned to', () => {
    const top = { x: 10, y: 120 };
    expect(geometryOf(page(0), 2).toScreen(top)).toEqual({ x: 0, y: 0 });
    // Turned right, the top left corner is the top right.
    expect(geometryOf(page(90), 2).toScreen(top)).toEqual({ x: 200, y: 0 });
    expect(geometryOf(page(180), 2).toScreen(top)).toEqual({ x: 400, y: 200 });
    expect(geometryOf(page(270), 2).toScreen(top)).toEqual({ x: 0, y: 400 });
    expect(geometryOf(page(90), 2)).toMatchObject({ width: 200, height: 400 });
  });

  it('takes a point of the screen back to the same point of the page', () => {
    for (const rotation of [0, 90, 180, 270] as const) {
      const geo = geometryOf(page(rotation), 1.5);
      const point = { x: 57.5, y: 33.25 };
      const back = geo.toPage(geo.toScreen(point));
      expect(back.x).toBeCloseTo(point.x);
      expect(back.y).toBeCloseTo(point.y);
    }
  });

  it('turns a box with the page: its bottom left corner, turned right, is its top left', () => {
    expect(geometryOf(page(90), 1).toScreenRect({ x: 10, y: 20, width: 50, height: 10 })).toEqual({ x: 0, y: 0, width: 10, height: 50 });
  });

  it('draws a line through points, smoothed', () => {
    expect(pathData([])).toBe('');
    expect(pathData([{ x: 1, y: 2 }])).toBe('M1 2l0.01 0');
    expect(
      pathData([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ]),
    ).toBe('M0 0Q10 0 10 5L10 10');
  });
});
