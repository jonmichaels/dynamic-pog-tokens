import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, '..', 'scripts', 'app', 'pog-tokens-app.js'), 'utf8');

const uploadCalls = [...source.matchAll(/await\s+FilePicker\.upload\(([^;]+?)\);/gs)].map(match => match[1]);
assert.equal(uploadCalls.length, 1, 'expected exactly one executable FilePicker.upload call');

for (const call of uploadCalls) {
  assert.match(
    call,
    /^\s*["']data["']\s*,\s*this\._destPath\s*,\s*file\s*,\s*\{\}\s*$/s,
    `FilePicker.upload call must use v13 signature: ${call.trim()}`
  );
}

console.log('static-upload-args: ok');
