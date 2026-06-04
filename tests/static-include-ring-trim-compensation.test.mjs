import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, '..', 'scripts', 'app', 'pog-tokens-app.js'), 'utf8');

assert.match(
  source,
  /const\s+exportTrimPx\s*=\s*Math\.max\(0,\s*Number\(result\.stats\.previewTrimPx\)\s*\|\|\s*0\)/,
  'Include Ring export composition must use the output-space trim amount from processToken stats'
);

assert.match(
  source,
  /const\s+exportTokenSize\s*=\s*canvasSize\s*\+\s*\(exportTrimPx\s*\*\s*2\)/,
  'Include Ring export token layer must expand by double the output-space trim amount to close the trim-created transparent gap'
);

assert.match(
  source,
  /const\s+exportTokenOffset\s*=\s*-exportTrimPx/,
  'Include Ring export token expansion must remain centered by using a negative output-space trim offset'
);

assert.match(
  source,
  /ctx\.drawImage\(tokenImg,\s*exportTokenOffset,\s*exportTokenOffset,\s*exportTokenSize,\s*exportTokenSize\)/,
  'Include Ring export must draw the processed token with trim compensation before drawing the ring frame'
);

console.log('static-include-ring-trim-compensation: ok');
