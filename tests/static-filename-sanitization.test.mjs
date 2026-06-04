import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(join(__dirname, '..', 'scripts', 'app', 'pog-tokens-app.js'), 'utf8');

assert.match(
  appSource,
  /function sanitizeFilenameStem\(stem\)/,
  'filename rename code must use a dedicated stem sanitizer'
);

assert.match(
  appSource,
  /\.replace\(\/\\s\+\/g, ['"]_['"]\)/,
  'filename sanitizer must convert spaces and other whitespace to underscores'
);

assert.match(
  appSource,
  /\.replace\(\/\[\^A-Za-z0-9_-\]\+\/g, ['"]['"]\)/,
  'filename sanitizer must remove commas and other punctuation/symbol characters'
);

assert.match(
  appSource,
  /const outputName\s*=\s*sanitizeFilenameStem\(prefix \+ nameWithoutExt \+ suffix\) \+ ext;/,
  'output filename must sanitize the combined prefix + basename + suffix stem before appending extension'
);

const functionSource = appSource.match(/function sanitizeFilenameStem\(stem\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(functionSource, 'sanitizer function source must be extractable for behavior checks');
const context = {};
vm.createContext(context);
vm.runInContext(`${functionSource}; this.sanitizeFilenameStem = sanitizeFilenameStem;`, context);

assert.equal(
  context.sanitizeFilenameStem('  My Goblin, Boss #1 (Large)!  '),
  'My_Goblin_Boss_1_Large',
  'sanitizer must remove punctuation/symbols and convert spaces to underscores'
);
assert.equal(
  context.sanitizeFilenameStem(',,, ***'),
  'token',
  'sanitizer must provide a safe fallback when the stem has no usable characters'
);

console.log('static-filename-sanitization: ok');
