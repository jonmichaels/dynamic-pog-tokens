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
  /steps\.push\('mask'\);[\s\S]+applyCircularEdgeTrim\s*\(\s*circularTrimCanvas\s*\)/,
  'processToken must apply circular trim after maskImage so trim-created alpha does not suppress background masking'
);

console.log('static-circular-trim: ok');
