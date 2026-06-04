import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(join(__dirname, '..', 'scripts', 'app', 'pog-tokens-app.js'), 'utf8');

assert.match(
  appSource,
  /function decodeFilenameComponent\(value\)/,
  'filename rename code must decode URL/HTML-style escaped source filenames before sanitizing'
);

assert.match(
  appSource,
  /function sanitizeFilenameStem\(stem\)/,
  'filename rename code must use a dedicated stem sanitizer'
);

assert.match(
  appSource,
  /\.replace\(\/\[\^A-Za-z0-9\]\+\/g, ['"]_['"]\)/,
  'filename sanitizer must treat punctuation/symbol runs as word boundaries'
);

assert.match(
  appSource,
  /function getUniqueFilename\(stem, ext, usedNames\)/,
  'filename rename code must use a dedicated unique-name helper'
);

assert.match(
  appSource,
  /const existingDest\s*=\s*await FilePicker\.browse\("data", this\._destPath\);/,
  'batch processing must inspect destination folder before upload to avoid overwrites'
);

assert.match(
  appSource,
  /const outputStem\s*=\s*sanitizeFilenameStem\(prefix \+ nameWithoutExt \+ suffix\);\s*const outputName\s*=\s*getUniqueFilename\(outputStem, ext, usedOutputNames\);/,
  'output filename must sanitize stem and reserve a unique filename before appending extension'
);

const helpersSource = appSource.match(/function decodeFilenameComponent\(value\) \{[\s\S]*?\n\}\n\nfunction sanitizeFilenameStem\(stem\) \{[\s\S]*?\n\}\n\nfunction getUniqueFilename\(stem, ext, usedNames\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(helpersSource, 'filename helper function source must be extractable for behavior checks');
const context = {};
vm.createContext(context);
vm.runInContext(`${helpersSource}; this.sanitizeFilenameStem = sanitizeFilenameStem; this.getUniqueFilename = getUniqueFilename;`, context);

assert.equal(
  context.sanitizeFilenameStem('Beast%2C%20Bear'),
  'Beast_Bear',
  'sanitizer must decode Foundry URL-escaped comma/space before converting to word boundaries'
);
assert.equal(
  context.sanitizeFilenameStem('Beast, Bear'),
  'Beast_Bear',
  'sanitizer must convert comma-space to one underscore'
);
assert.equal(
  context.sanitizeFilenameStem('Beast,Bear'),
  'Beast_Bear',
  'sanitizer must treat comma without whitespace as a word boundary'
);
assert.equal(
  context.sanitizeFilenameStem('  My Goblin, Boss #1 (Large)!  '),
  'My_Goblin_Boss_1_Large',
  'sanitizer must keep words, remove punctuation/symbols, and separate words with underscores'
);
assert.equal(
  context.sanitizeFilenameStem(',,, ***'),
  'token',
  'sanitizer must provide a safe fallback when the stem has no usable characters'
);

const usedNames = new Set(['beast_bear.webp']);
assert.equal(
  context.getUniqueFilename('Beast_Bear', '.webp', usedNames),
  'Beast_Bear_1.webp',
  'unique filename helper must append _1 when destination already has the sanitized name'
);
assert.equal(
  context.getUniqueFilename('Beast_Bear', '.webp', usedNames),
  'Beast_Bear_2.webp',
  'unique filename helper must increment suffixes for repeated collisions in the same batch'
);

console.log('static-filename-sanitization: ok');
