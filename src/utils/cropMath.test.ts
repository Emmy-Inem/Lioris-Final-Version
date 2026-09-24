import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { baseScale, clampCrop, cropRect, zoomTo, MAX_ZOOM } from './cropMath.ts';

describe('cropMath', () => {
  // A landscape 2000x1000 photo shown in a 300x300 square viewport.
  const iw = 2000;
  const ih = 1000;
  const vw = 300;
  const vh = 300;

  it('covers the viewport at zoom 1', () => {
    assert.equal(baseScale(iw, ih, vw, vh), 0.3); // limited by height: 300 / 1000
  });

  it('crops the centre square when centred and unzoomed', () => {
    const rect = cropRect({ zoom: 1, tx: 0, ty: 0 }, iw, ih, vw, vh);
    assert.deepEqual(rect, { originX: 500, originY: 0, width: 1000, height: 1000 });
  });

  it('halves the crop size when zoomed to 2x', () => {
    const rect = cropRect({ zoom: 2, tx: 0, ty: 0 }, iw, ih, vw, vh);
    assert.equal(rect.width, 500);
    assert.equal(rect.height, 500);
    assert.equal(rect.originX, 750);
    assert.equal(rect.originY, 250);
  });

  it('never lets the picture leave an empty edge in the viewport', () => {
    const clamped = clampCrop({ zoom: 1, tx: 9999, ty: 9999 }, iw, ih, vw, vh);
    // Image is 600x300 on screen, so it can slide 150px sideways and not at all vertically.
    assert.equal(clamped.tx, 150);
    assert.equal(clamped.ty, 0);
  });

  it('follows a drag: dragging right shows more of the left of the picture', () => {
    const rect = cropRect({ zoom: 1, tx: 150, ty: 0 }, iw, ih, vw, vh);
    assert.equal(rect.originX, 0);
  });

  it('keeps the rect inside the image at every extreme', () => {
    for (const zoom of [1, 1.7, 3, MAX_ZOOM, 99]) {
      for (const tx of [-1e6, 0, 1e6]) {
        for (const ty of [-1e6, 0, 1e6]) {
          const r = cropRect({ zoom, tx, ty }, iw, ih, vw, vh);
          assert.ok(r.originX >= 0 && r.originY >= 0);
          assert.ok(r.originX + r.width <= iw && r.originY + r.height <= ih);
        }
      }
    }
  });

  it('keeps the same aspect as the viewport (wide banner)', () => {
    const rect = cropRect({ zoom: 1.5, tx: 0, ty: 0 }, 4000, 3000, 320, 180);
    assert.ok(Math.abs(rect.width / rect.height - 320 / 180) < 0.02);
  });

  it('zoomTo clamps to the allowed range', () => {
    const state = zoomTo({ zoom: 1, tx: 0, ty: 0 }, 50, iw, ih, vw, vh);
    assert.equal(state.zoom, MAX_ZOOM);
    assert.equal(zoomTo(state, 0.1, iw, ih, vw, vh).zoom, 1);
  });
});
