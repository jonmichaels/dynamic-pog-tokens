import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, '..', 'scripts', 'app', 'pog-processor.js'), 'utf8');

assert.match(
  source,
  /const\s+previewTrimPx\s*=\s*appliedTrimPx\s*>\s*0[\s\S]*Math\.round\(appliedTrimPx\s*\*\s*\(sizing\.ringDiameter\s*\/\s*Math\.max\(workingW, workingH\)\)\)/,
  'processToken must convert applied trim from source-space to output-space before the After preview uses it'
);

assert.match(
  source,
  /previewTrimPx,/,
  'processToken stats must expose previewTrimPx for visual-only After preview scaling'
);

assert.doesNotMatch(
  source,
  /resizeToRing\(\s*workingBitmap,\s*sizing\.ringDiameter\s*\+\s*\(appliedTrimPx\s*\*\s*2\)/,
  'trim compensation must not alter the actual processed image resize/export path'
);

console.log('static-preview-trim-output-space: ok');
