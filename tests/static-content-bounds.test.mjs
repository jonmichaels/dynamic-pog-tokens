import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, '..', 'scripts', 'app', 'pog-processor.js'), 'utf8');

assert.match(
  source,
  /function\s+detectContentBounds\s*\(/,
  'processor must detect non-transparent content bounds before trim, mask, resize, and sizing'
);

assert.match(
  source,
  /imageData\.data\[idx \+ 3\]\s*>\s*0/,
  'content bounds must be based on alpha/non-transparent pixels'
);

assert.match(
  source,
  /function\s+cropTransparentPadding\s*\(/,
  'processor must crop transparent canvas padding before applying trim or resize calculations'
);

assert.match(
  source,
  /cropTransparentPadding\s*\(\s*workingBitmap\s*\)/,
  'processToken must crop transparent padding immediately after load, before trimImage and calculateTargetSize'
);

assert.match(
  source,
  /stats:\s*\{[\s\S]*contentBounds/s,
  'processToken stats should expose detected content bounds for verification/debugging'
);

console.log('static-content-bounds: ok');
