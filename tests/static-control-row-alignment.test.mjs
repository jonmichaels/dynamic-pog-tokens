import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scss = readFileSync(join(__dirname, '..', 'scss', 'module.scss'), 'utf8');

function ruleBlock(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = scss.match(new RegExp(`${escaped}\\s*{([^}]*)}`));
  assert.ok(match, `${selector} rule must exist`);
  return match[1];
}

assert.match(
  ruleBlock('.dpog-wide-row'),
  /align-items:\s*center;/,
  'Source and Destination wide rows must vertically center labels, buttons, and path spans'
);

assert.match(
  ruleBlock('.dpog-control-label'),
  /align-self:\s*center;/,
  'All control labels must vertically center themselves in their control rows'
);

assert.match(
  ruleBlock('.dpog-path-display'),
  /align-self:\s*center;/,
  'Source and Destination path display spans must vertically center themselves in their rows'
);

console.log('static-control-row-alignment: ok');
