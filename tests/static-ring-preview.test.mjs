import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, '..', 'scripts', 'app', 'pog-tokens-app.js'), 'utf8');

assert.match(
  source,
  /_previewRequestId\s*=\s*0/,
  'preview rendering must track request ids so stale async trim previews cannot overwrite the current After display'
);

assert.match(
  source,
  /const\s+requestId\s*=\s*\+\+this\._previewRequestId/,
  'each preview render must increment the request id'
);

assert.match(
  source,
  /if\s*\(requestId\s*!==\s*this\._previewRequestId\)\s*return/,
  'preview rendering must bail out when an older async render completes after a newer trim value'
);

assert.match(
  source,
  /_colorizeDefaultRingFrame\s*\(/,
  'After preview must colorize the raw Dynamic Ring foreground frame instead of drawing the magenta mask directly'
);

assert.match(
  source,
  /frame\.colorBand\s*\|\|\s*cache\.config\.defaultColorBand/,
  'ring preview colorization must use the spritesheet color band metadata'
);

assert.match(
  source,
  /data\[idx \+ 1\]\s*=\s*strength;[\s\S]*data\[idx \+ 2\]\s*=\s*strength;/,
  'default ring colorization must convert the magenta band to neutral white/gray for the default ring'
);

assert.match(
  source,
  /1536:\s*"token-ring-large-huge"/,
  '1536px Huge previews/exports must explicitly use the large-huge ring frame scaled to the Huge canvas'
);

assert.match(
  source,
  /const\s+url2\s*=\s*URL\.createObjectURL\(blob2\);[\s\S]*if\s*\(requestId\s*!==\s*this\._previewRequestId\)\s*{[\s\S]*URL\.revokeObjectURL\(url2\);[\s\S]*return;[\s\S]*afterImg\._objectUrl\s*=\s*url2/,
  'final ring-composited preview must re-check request id after toBlob before assigning afterImg.src'
);

assert.match(
  source,
  /const\s+url\s*=\s*URL\.createObjectURL\(result\.blob\);[\s\S]*URL\.revokeObjectURL\(url\);[\s\S]*resolve\(i\)/,
  'temporary token preview blob URLs must be revoked after image load'
);

console.log('static-ring-preview: ok');
