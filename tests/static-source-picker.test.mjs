import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, '..', 'scripts', 'app', 'pog-tokens-app.js'), 'utf8');

assert.match(
  source,
  /new FilePicker\(\{[\s\S]*?type:\s*['"]image['"][\s\S]*?callback:\s*async \(selectedPath\)/,
  'source picker should open an image FilePicker so image files are visible and selectable'
);

assert.match(
  source,
  /#addUseCurrentFolderButton\(/,
  'source image picker should add a Use Current Folder action for folder selection'
);

assert.match(
  source,
  /_sourceFiles\s*=\s*\[filePath\]/,
  'selecting one image should process only that selected image'
);

assert.match(
  source,
  /_sourceFiles\s*=\s*null/,
  'selecting a folder should clear the single-file list and process the whole folder'
);

assert.match(
  source,
  /Hooks\.on\(["']renderFilePicker["'],\s*addFolderButton\)/,
  'source picker should re-add the folder action after FilePicker navigation re-renders'
);

assert.match(
  source,
  /Hooks\.off\(["']renderFilePicker["'],\s*addFolderButton\)/,
  'source picker should remove its render hook when the FilePicker closes'
);

assert.match(
  source,
  /this\._sourceFiles\s*\?\s*this\._sourceFiles\s*:\s*await\s+this\.#getImageFilesFromFolder\(this\._sourceDir\)/,
  'batch processing should use the selected image list when present, otherwise scan the selected folder'
);

console.log('static-source-picker: ok');
