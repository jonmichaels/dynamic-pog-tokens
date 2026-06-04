import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, '..', 'scripts', 'app', 'pog-tokens-app.js'), 'utf8');

assert.match(
  source,
  /source scaled so non-transparent content matches the processed token size|source crop so its effective square content matches the After token size/,
  'before preview should document matching effective source content size to after preview'
);

assert.match(
  source,
  /const scale = Math\.max\(result\.afterData\.width, result\.afterData\.height\) \/ Math\.max\(cropSource\.width, cropSource\.height\)/,
  'before preview should derive scale from processed token size and effective crop bounds'
);

assert.match(
  source,
  /ctx\.drawImage\(\s*srcImg,\s*cropSource\.x,\s*cropSource\.y,\s*cropSource\.width,\s*cropSource\.height,/,
  'before preview should draw the same effective square crop used by processing'
);

assert.match(
  source,
  /const cw = result\.afterData\.canvasSize;\s*const ch = result\.afterData\.canvasSize;/,
  'before preview should render to the same canvas size as after preview so CSS scales both equally'
);

assert.match(
  source,
  /this\._drawCheckerboard\(ctx, iw, ih, dx, dy\)/,
  'before preview checkerboard should only be drawn inside the source image rectangle'
);

assert.doesNotMatch(
  source,
  /this\._drawCheckerboard\(ctx, cw, ch\)/,
  'before preview should not fill the entire before canvas with checkerboard'
);

assert.doesNotMatch(
  source,
  /const pad = 16/,
  'before preview should not add artificial checkerboard padding around the source image'
);

console.log('static-before-preview: ok');
