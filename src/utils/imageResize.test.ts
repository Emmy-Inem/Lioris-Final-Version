import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
// @ts-ignore TS5097
import {
  computeResizeSize,
  computeResizeWidth,
  MAX_DOCUMENT_IMAGE_WIDTH,
  MAX_UPLOAD_IMAGE_WIDTH,
  resizedFileName,
  shouldResizeImage,
} from './imageResize.ts';

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

describe('document photos keep more pixels', () => {
  it('uses a larger limit than the avatar default', () => {
    assert.equal(MAX_DOCUMENT_IMAGE_WIDTH, 2000);
    assert.equal(computeResizeWidth(4032, MAX_DOCUMENT_IMAGE_WIDTH), 2000);
    assert.equal(computeResizeWidth(1900, MAX_DOCUMENT_IMAGE_WIDTH), null);
    assert.equal(computeResizeWidth(1900), MAX_UPLOAD_IMAGE_WIDTH);
  });
});

describe('shouldResizeImage', () => {
  it('re-encodes ordinary photos', () => {
    assert.equal(shouldResizeImage('image/jpeg', 'a.jpg', 'file:///a.jpg'), true);
    assert.equal(shouldResizeImage('image/heic'), true);
    assert.equal(shouldResizeImage('image/png', null, 'data:image/png;base64,AAAA'), true);
    assert.equal(shouldResizeImage(undefined, undefined, 'content://media/external/images/media/42'), true);
  });

  it('never touches GIFs, SVGs or PDFs', () => {
    assert.equal(shouldResizeImage('image/gif'), false);
    assert.equal(shouldResizeImage(null, 'party.GIF', 'file:///x'), false);
    assert.equal(shouldResizeImage(undefined, undefined, 'file:///cache/anim.gif?x=1'), false);
    assert.equal(shouldResizeImage(undefined, undefined, 'data:image/gif;base64,AAAA'), false);
    assert.equal(shouldResizeImage('image/svg+xml'), false);
    assert.equal(shouldResizeImage('application/pdf'), false);
    assert.equal(shouldResizeImage(null, 'id.pdf'), false);
  });

  it('leaves non-images alone', () => {
    assert.equal(shouldResizeImage('video/mp4'), false);
  });
});

describe('resizedFileName', () => {
  it('swaps the extension for .jpg', () => {
    assert.equal(resizedFileName('IMG_0001.HEIC'), 'IMG_0001.jpg');
    assert.equal(resizedFileName('my.photo.png'), 'my.photo.jpg');
    assert.equal(resizedFileName('noext'), 'noext.jpg');
  });

  it('has nothing to say about a missing name', () => {
    assert.equal(resizedFileName(null), undefined);
    assert.equal(resizedFileName(''), undefined);
  });
});
