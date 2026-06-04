import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(join(__dirname, '..', 'scripts', 'app', 'pog-tokens-app.js'), 'utf8');
const template = readFileSync(join(__dirname, '..', 'templates', 'dynamic-pog-tokens.hbs'), 'utf8');
const i18n = JSON.parse(readFileSync(join(__dirname, '..', 'languages', 'en.json'), 'utf8'));

assert.match(appSource, /const DEFAULT_SETTINGS\s*=\s*\{[\s\S]*mode:\s*'quick'/, 'Default quality must be Quick');
assert.match(appSource, /const DEFAULT_SETTINGS\s*=\s*\{[\s\S]*trimPx:\s*0/, 'Default trim must be 0px');
assert.match(appSource, /const DEFAULT_SETTINGS\s*=\s*\{[\s\S]*maskEnabled:\s*false/, 'Default mask must be off');
assert.match(appSource, /const DEFAULT_SETTINGS\s*=\s*\{[\s\S]*ringOverride:\s*'auto'/, 'Default ring size must be Auto');
assert.match(appSource, /const DEFAULT_SETTINGS\s*=\s*\{[\s\S]*prefix:\s*''/, 'Default prefix must be empty');
assert.match(appSource, /const DEFAULT_SETTINGS\s*=\s*\{[\s\S]*suffix:\s*'_dr'/, 'Default suffix must be _dr');
assert.match(appSource, /const DEFAULT_SETTINGS\s*=\s*\{[\s\S]*format:\s*'image\/webp'/, 'Default export format must be WEBP');
assert.match(appSource, /const DEFAULT_SETTINGS\s*=\s*\{[\s\S]*includeRing:\s*false/, 'Default export ring must be off');

assert.match(template, /name="quality" value="quick" checked/, 'Quick radio must be checked in template defaults');
assert.match(template, /id="dpog-prefix"[^>]*value=""/, 'Prefix input template default must be empty');
assert.match(template, /id="dpog-suffix"[^>]*value="_dr"/, 'Suffix input template default must be _dr');
assert.doesNotMatch(template, /name="quality" value="optimized" checked/, 'Optimized must not be checked in template defaults');

const settingKeys = [
  'defaultMode',
  'defaultTrimPx',
  'defaultMaskEnabled',
  'defaultRingOverride',
  'defaultPrefix',
  'defaultSuffix',
  'defaultFormat',
  'defaultIncludeRing',
];
for (const key of settingKeys) {
  assert.match(appSource, new RegExp(`${key}:\\s*\\{`), `${key} must be listed in default setting definitions`);
}
assert.match(appSource, /for \(const \[settingName, definition\] of Object\.entries\(DEFAULT_SETTING_DEFINITIONS\)\)/, 'Default setting definitions must be registered as a group');
assert.match(appSource, /game\.settings\.register\(MODULE_ID, settingName, \{[\s\S]*?config:\s*true/, 'Default settings must be configurable from the standard Foundry Settings page');

assert.match(appSource, /_getConfiguredDefaults\(\)/, 'App must read configured defaults from Foundry settings');
assert.match(appSource, /sanitizeFilenameStem\(prefix \+ nameWithoutExt \+ suffix\) \+ ext/, 'Output filename must still use sanitized prefix + basename + suffix + extension');
assert.ok(i18n.DynPog.SettingsDefaultSuffix, 'Settings i18n must include default suffix label');

console.log('static-default-settings: ok');
