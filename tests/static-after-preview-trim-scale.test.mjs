import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, '..', 'scripts', 'app', 'pog-tokens-app.js'), 'utf8');

assert.match(
  source,
  /const\s+previewTrimPx\s*=\s*Math\.max\(0,\s*Number\(result\.stats\.previewTrimPx\)\s*\|\|\s*0\)/,
  'After preview must use the processToken output-space trim amount, not raw source-space trim settings'
);

assert.match(
  source,
  /const\s+previewTokenSize\s*=\s*cs\s*\+\s*\(previewTrimPx\s*\*\s*2\)/,
  'After preview token image must grow by double the trim amount so the subject edge reaches the ring interior'
);

assert.match(
  source,
  /const\s+previewTokenOffset\s*=\s*-previewTrimPx/,
  'After preview token growth must be centered by offsetting the enlarged token image by negative trim'
);

assert.match(
  source,
  /ctx\.drawImage\(tokenImg,\s*previewTokenOffset,\s*previewTokenOffset,\s*previewTokenSize,\s*previewTokenSize\)/,
  'After preview must draw the processed token enlarged only in the visual preview, not change processToken output'
);

console.log('static-after-preview-trim-scale: ok');
