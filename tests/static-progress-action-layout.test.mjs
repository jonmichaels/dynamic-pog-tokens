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
  /<div class="dpog-progress-meta">[\s\S]*<span class="dpog-progress-text" id="dpog-progress-text">0%<\/span>[\s\S]*<span class="dpog-progress-status" id="dpog-progress-status">/,
  'progress percentage and status must share one metadata row'
);

assert.match(
  ruleBlock('.dpog-progress'),
  /flex:\s*1\s+1\s+auto;/,
  'progress section must consume available space to the left of the fixed Process button'
);

assert.match(
  ruleBlock('.dpog-progress-meta'),
  /display:\s*flex;/,
  'progress metadata row must place percentage and status on the same line'
);

assert.match(
  ruleBlock('.dpog-progress-text'),
  /text-align:\s*left;/,
  'progress percentage must be left justified'
);

assert.match(
  ruleBlock('.dpog-progress-status'),
  /text-align:\s*right;/,
  'progress status must be right justified'
);

assert.match(
  ruleBlock('.dpog-progress-status'),
  /white-space:\s*nowrap;/,
  'progress status must stay on the same line as the percentage'
);

console.log('static-progress-action-layout: ok');
