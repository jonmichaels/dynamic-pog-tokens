import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const template = readFileSync(join(__dirname, '..', 'templates', 'dynamic-pog-tokens.hbs'), 'utf8');
const appSource = readFileSync(join(__dirname, '..', 'scripts', 'app', 'pog-tokens-app.js'), 'utf8');
const i18n = JSON.parse(readFileSync(join(__dirname, '..', 'languages', 'en.json'), 'utf8'));

assert.match(template, /id="dpog-before-img"/, 'Before preview image must remain present');
assert.match(template, /id="dpog-after-img"/, 'After preview image must remain present');

assert.doesNotMatch(template, /id="dpog-export-ring"/, 'Export With Ring must no longer be a button in the After panel');
assert.doesNotMatch(template, /id="dpog-process-btn"/, 'Old single-preview Process button must be removed');
assert.match(template, /id="dpog-process-all"/, 'Exactly one bottom process button must remain');
assert.equal((template.match(/id="dpog-process-all"/g) || []).length, 1, 'Only one bottom process button is allowed');

assert.match(template, /id="dpog-suffix"/, 'Suffix input must be present');
assert.match(template, /name="suffix"/, 'Suffix input must submit/store with suffix name');
assert.match(template, /name="includeRing"/, 'Export Ring checkbox must be present');
assert.match(template, /{{localize "DynPog\.IncludeRing"}}/, 'Export Ring checkbox label must use Include Ring i18n key');
assert.match(template, /id="dpog-select-images" class="dpog-select-btn dpog-source-dest-btn"/, 'Source picker button must use compact matched-width button class');
assert.match(template, /id="dpog-browse-dest" class="dpog-select-btn dpog-source-dest-btn"/, 'Destination picker button must match source button width');
assert.match(template, /dpog-ring-row/, 'Ring Size row must be constrained to match Prefix input column width');

assert.match(template, /id="dpog-threshold"/, 'Threshold value must remain in DOM for required mask processing data');
assert.match(template, /dpog-threshold-row[^\n"]*dpog-hidden|dpog-hidden[^\n"]*dpog-threshold-row/, 'Threshold row must stay hidden from the UI');

assert.match(appSource, /const suffix\s*=.*#dpog-suffix/s, 'Batch processing must read suffix input');
assert.match(appSource, /prefix \+ nameWithoutExt \+ suffix \+ ext/, 'Output filename must insert suffix before extension');
assert.doesNotMatch(appSource, /querySelector\("#dpog-export-ring"\)/, 'App must not bind old Export With Ring button');
assert.doesNotMatch(appSource, /querySelector\("#dpog-process-btn"\)/, 'App must not bind old preview Process button');
assert.doesNotMatch(appSource, /thresholdRow\.classList\.toggle/, 'App must never reveal hidden Threshold row from saved mask settings');

assert.equal(i18n.DynPog.Suffix, 'Suffix', 'Suffix label must exist');
assert.equal(i18n.DynPog.ExportRing, 'Export Ring', 'Export Ring group label must exist');
assert.equal(i18n.DynPog.IncludeRing, 'Include Ring', 'Include Ring checkbox label must exist');
assert.equal(i18n.DynPog.Process, 'Process', 'Single bottom process button label must be Process');
assert.equal(i18n.DynPog.SelectFolder, 'Image / Folder', 'Source picker button label must be Image / Folder');
assert.equal(i18n.DynPog.Browse, 'Folder', 'Destination picker button label must be Folder');

console.log('static-wireframe-contract: ok');
