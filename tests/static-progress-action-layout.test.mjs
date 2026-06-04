import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const template = readFileSync(join(__dirname, '..', 'templates', 'dynamic-pog-tokens.hbs'), 'utf8');
const scss = readFileSync(join(__dirname, '..', 'scss', 'module.scss'), 'utf8');

function ruleBlock(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = scss.match(new RegExp(`${escaped}\\s*{([^}]*)}`));
  assert.ok(match, `${selector} rule must exist`);
  return match[1];
}

assert.match(
  template,
  /<div class="dpog-action-section">\s*<div class="dpog-progress-bar dpog-hidden"[\s\S]*<span class="dpog-progress-text dpog-hidden" id="dpog-progress-text">0%<\/span>\s*<button type="button" id="dpog-process-all"/,
  'progress bar and percentage must be direct children of the Process button action row'
);

assert.doesNotMatch(
  template,
  /id="dpog-progress-section"/,
  'progress bar and percentage must not be wrapped in a separate progress section div'
);

assert.doesNotMatch(
  template,
  /id="dpog-progress-status"/,
  'progress status text must be removed from the visible template'
);

assert.match(
  ruleBlock('.dpog-action-section'),
  /display:\s*flex;/,
  'action row must place progress bar, percentage, and Process button on the same line'
);

assert.match(
  ruleBlock('.dpog-action-section'),
  /align-items:\s*center;/,
  'action row must vertically align progress bar, percentage, and Process button'
);

assert.match(
  ruleBlock('.dpog-progress-bar'),
  /flex:\s*1\s+1\s+auto;/,
  'progress bar must shrink to leave room for the percentage on its right'
);

assert.match(
  ruleBlock('.dpog-progress-text'),
  /text-align:\s*left;/,
  'progress percentage must be left justified'
);

console.log('static-progress-action-layout: ok');
