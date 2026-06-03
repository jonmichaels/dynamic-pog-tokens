import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, '..', 'scripts', 'app', 'pog-processor.js'), 'utf8');

assert.match(
  source,
  /function\s+applyCircularEdgeTrim\s*\(/,
  'trim pipeline must include a circular edge-trim mask, not only square cropping'
);

assert.match(
  source,
  /Math\.hypot\s*\(/,
  'circular trim must use radial distance from image center to remove an outer annulus'
);

assert.match(
  source,
  /imageData\.data\[idx \+ 3\]\s*=\s*0/,
  'circular trim must remove the outer ring by making pixels transparent'
);

assert.match(
  source,
  /const\s+radius\s*=\s*Math\.max\(0,\s*\(Math\.min\(width, height\) \/ 2\) - trimPx\)/,
  'circular trim must move the circular edge inward by the applied trim amount so the ring band visibly disappears'
);

assert.match(
  source,
  /appliedTrimPx:\s*safeTrim/,
  'trimImage must report the clamped trim amount used for the circular edge trim'
);

assert.match(
  source,
  /applyCircularEdgeTrim\s*\(\s*circularTrimCanvas\s*,\s*appliedTrimPx\s*\)/,
  'processToken must pass the applied trim amount into the circular edge-trim mask'
);

console.log('static-circular-trim: ok');
