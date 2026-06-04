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
  /<div class="dpog-action-section">[\s\S]*<div class="dpog-progress dpog-hidden" id="dpog-progress-section">[\s\S]*<button type="button" id="dpog-process-all"/,
  'progress section must live inside the action row before the Process button'
);

assert.match(
  template,
  /<div class="dpog-progress-row">[\s\S]*<div class="dpog-progress-bar">[\s\S]*<span class="dpog-progress-text" id="dpog-progress-text">0%<\/span>/,
  'progress percentage must share the progress bar row and sit to the right of the bar'
);

assert.doesNotMatch(
  template,
  /id="dpog-progress-status"/,
  'progress status text must be removed from the visible template'
);

assert.match(
  ruleBlock('.dpog-progress'),
  /flex:\s*1\s+1\s+auto;/,
  'progress section must consume available space to the left of the fixed Process button'
);

assert.match(
  ruleBlock('.dpog-progress-row'),
  /display:\s*flex;/,
  'progress row must place bar and percentage on the same line'
);

assert.match(
  ruleBlock('.dpog-progress-row'),
  /align-items:\s*center;/,
  'progress row must vertically align the bar and percentage'
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
