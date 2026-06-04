import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const processor = readFileSync('scripts/app/pog-processor.js', 'utf8');

assert.match(
  processor,
  /function\s+centerCropToSquare\s*\(\s*imageBitmap\s*\)/,
  'processor must define a centered square crop helper for non-square sources'
);

assert.match(
  processor,
  /const\s+size\s*=\s*Math\.min\(\s*imageBitmap\.width\s*,\s*imageBitmap\.height\s*\)/,
  'center crop must use the smaller source dimension as the square size'
);

assert.match(
  processor,
  /const\s+sx\s*=\s*Math\.floor\(\(imageBitmap\.width\s*-\s*size\)\s*\/\s*2\)/,
  'center crop must remove equal pixels from left and right when width is larger'
);

assert.match(
  processor,
  /const\s+sy\s*=\s*Math\.floor\(\(imageBitmap\.height\s*-\s*size\)\s*\/\s*2\)/,
  'center crop must remove equal pixels from top and bottom when height is larger'
);

assert.match(
  processor,
  /centerCropToSquare\s*\(\s*workingBitmap\s*\)/,
  'processToken must center-crop non-square sources before trim, mask, and sizing'
);

assert.match(
  processor,
  /stats:\s*\{[\s\S]*squareCrop/s,
  'processToken stats must expose squareCrop details for troubleshooting'
);

console.log('static-non-square-center-crop: ok');
