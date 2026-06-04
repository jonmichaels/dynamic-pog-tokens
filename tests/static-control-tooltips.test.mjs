import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const template = readFileSync(join(__dirname, '..', 'templates', 'dynamic-pog-tokens.hbs'), 'utf8');
const translations = JSON.parse(readFileSync(join(__dirname, '..', 'languages', 'en.json'), 'utf8')).DynPog;

const tooltipKeys = {
  TooltipQuick: 'Source image stays the same size. A transparent background canvas extends the dimensions by 1/3.',
  TooltipOptimized: 'The final image will be 256, 512, 1024, 1536, or 2048. The source image will be resized to take up 2/3 of that.',
  TooltipTrim: 'Make a circle crop on the source image to remove an existing ring.',
  TooltipMask: 'Make the pixels outside the circle transparent. Required for JPEGs and other images without a transparent background.',
  TooltipRingSize: 'Auto is typically the best setting. Force a particular size by changing the selection.',
  TooltipPrefix: 'Add text to the head of all token filenames.',
  TooltipSuffix: 'Add text to the end of all token filenames. (Before the extension.)',
  TooltipIncludeRing: 'Print the dynamic ring to the token. Using this setting will hide the actual dynamic ring in Foundry.',
};

for (const [key, value] of Object.entries(tooltipKeys)) {
  assert.equal(translations[key], value, `${key} translation must match requested tooltip text`);
  assert.match(template, new RegExp(`title=\\"{{localize \\"DynPog\\.${key}\\"}}\\"`), `${key} must be wired as a native title tooltip in the template`);
}

console.log('static-control-tooltips: ok');
