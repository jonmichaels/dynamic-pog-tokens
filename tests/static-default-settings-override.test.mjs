import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, '..', 'scripts', 'app', 'pog-tokens-app.js'), 'utf8');
const restoreMatch = source.match(/_restoreSettings\(\) \{([\s\S]*?)\n    \}\n\n    \/\*\*/);
assert.ok(restoreMatch, 'expected _restoreSettings method to exist');
const restoreBody = restoreMatch[1];

assert.match(restoreBody, /this\._settings\s*=\s*\{\s*\.\.\.DEFAULT_SETTINGS,\s*\.\.\.configuredDefaults\s*\}/, 'restoreSettings must seed controls from configured defaults');
assert.doesNotMatch(restoreBody, /lastSettings|JSON\.parse\(saved\)|\.\.\.parsed/, 'last-used settings must not override configured defaults');
assert.doesNotMatch(source, /game\.settings\.set\(MODULE_ID, 'lastSettings'/, 'closing the app must not save stale control values over configured defaults');

console.log('static-default-settings-override: ok');
