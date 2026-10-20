import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
// @ts-ignore TS5097
import { computeResizeSize, computeResizeWidth, MAX_UPLOAD_IMAGE_WIDTH } from './imageResize.ts';

describe('computeResizeWidth', () => {
  it('shrinks wide photos to the maximum width', () => {
    assert.equal(computeResizeWidth(4032), MAX_UPLOAD_IMAGE_WIDTH);
    assert.equal(computeResizeWidth(1281), 1280);
  });

  it('leaves small or unknown-size photos alone', () => {
    assert.equal(computeResizeWidth(1280), null);
    assert.equal(computeResizeWidth(640), null);
    assert.equal(computeResizeWidth(undefined), null);
    assert.equal(computeResizeWidth(0), null);
    assert.equal(computeResizeWidth(NaN), null);
  });
});

describe('computeResizeSize', () => {
  it('keeps the aspect ratio', () => {
    assert.deepEqual(computeResizeSize(4000, 3000), { width: 1280, height: 960 });
    assert.deepEqual(computeResizeSize(3000, 4000), { width: 1280, height: 1707 });
  });

  it('returns null when no resize is needed or the height is invalid', () => {
    assert.equal(computeResizeSize(800, 600), null);
    assert.equal(computeResizeSize(4000, 0), null);
  });
});
