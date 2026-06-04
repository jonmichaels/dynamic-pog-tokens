import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scss = readFileSync(join(__dirname, '..', 'scss', 'module.scss'), 'utf8');
const containerMatch = scss.match(/\.dpog-image-container\s*\{([\s\S]*?)\n\}/);
assert.ok(containerMatch, 'expected .dpog-image-container rule to exist');
const containerRule = containerMatch[1];

assert.match(containerRule, /width:\s*100%\s*;/, 'image containers should fill panel width');
assert.match(containerRule, /aspect-ratio:\s*1\s*;/, 'image containers should be square');
assert.doesNotMatch(containerRule, /\n    max-height\s*:/, 'image containers must not cap height below their square width');

console.log('static-square-preview-panels: ok');
