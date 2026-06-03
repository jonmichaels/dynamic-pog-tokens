import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, '..', 'scripts', 'app', 'pog-tokens-app.js'), 'utf8');

const restoreMatch = source.match(/_restoreSettings\(\) \{([\s\S]*?)\n    \}\n\n    \/\*\*/);
assert.ok(restoreMatch, 'expected _restoreSettings method to exist');
const restoreBody = restoreMatch[1];

assert.match(
  restoreBody,
  /finally\s*\{[\s\S]*this\._applySettingsToUI\(\);[\s\S]*\}/,
  'restoreSettings must apply default settings to the DOM even when no saved settings exist'
);

console.log('static-restore-defaults: ok');
