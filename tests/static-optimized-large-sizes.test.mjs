import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const processor = readFileSync('scripts/app/pog-processor.js', 'utf8');
const labels = readFileSync('languages/en.json', 'utf8');

assert.match(
  processor,
  /\{ name: 'huge', ring: 1026, canvas: 1536 \}/,
  'Huge optimized output must use a 1026px subject on a 1536px canvas'
);

assert.match(
  processor,
  /\{ name: 'grg',\s+ring: 1368, canvas: 2048 \}/,
  'Gargantuan optimized output must use a 1368px subject on a 2048px canvas'
);

assert.match(
  processor,
  /const MAX_LARGE_TIER_UPSCALE_RATIO\s*=\s*1\.10/,
  'Optimized sizing must allow only modest Huge/Gargantuan uprez before downrezzing instead'
);

assert.doesNotMatch(
  processor,
  /maxDim > 684 \? 684 : maxDim/,
  'Optimized sizing must not cap all sources at 684px / 1024px'
);

const ringTableMatch = processor.match(/const RING_SIZES = \[[\s\S]*?\];/);
const largeSizeNamesMatch = processor.match(/const LARGE_SIZE_NAMES = new Set\([\s\S]*?\);/);
const maxUpscaleMatch = processor.match(/const MAX_LARGE_TIER_UPSCALE_RATIO = 1\.10;/);
const calculateMatch = processor.match(/export function calculateTargetSize\([\s\S]*?^}/m);
assert.ok(ringTableMatch, 'test must find RING_SIZES table');
assert.ok(largeSizeNamesMatch, 'test must find LARGE_SIZE_NAMES');
assert.ok(maxUpscaleMatch, 'test must find MAX_LARGE_TIER_UPSCALE_RATIO');
assert.ok(calculateMatch, 'test must find calculateTargetSize implementation');

const calculateTargetSize = Function(`
  ${ringTableMatch[0]}
  ${largeSizeNamesMatch[0]}
  ${maxUpscaleMatch[0]}
  ${calculateMatch[0].replace('export ', '')}
  return calculateTargetSize;
`)();

assert.deepEqual(calculateTargetSize(300, 300, 'optimized'), {
  ringDiameter: 344,
  canvasSize: 512,
  targetRing: 'sm',
  mode: 'optimized',
}, '300px source should keep existing optimized uprez behavior to 344px');

assert.deepEqual(calculateTargetSize(900, 900, 'optimized'), {
  ringDiameter: 684,
  canvasSize: 1024,
  targetRing: 'lg',
  mode: 'optimized',
}, '900px source should downrez to Large rather than over-uprez to Huge');

assert.deepEqual(calculateTargetSize(933, 933, 'optimized'), {
  ringDiameter: 1026,
  canvasSize: 1536,
  targetRing: 'huge',
  mode: 'optimized',
}, '933px source should allow modest uprez to Huge');

assert.deepEqual(calculateTargetSize(1244, 1244, 'optimized'), {
  ringDiameter: 1368,
  canvasSize: 2048,
  targetRing: 'grg',
  mode: 'optimized',
}, '1244px source should allow modest uprez to Gargantuan');

assert.deepEqual(calculateTargetSize(1500, 1500, 'optimized'), {
  ringDiameter: 1368,
  canvasSize: 2048,
  targetRing: 'grg',
  mode: 'optimized',
}, 'Sources above Gargantuan subject size should downrez to 1368px');

assert.match(labels, /"RingHuge": "Huge \(1026@1536\)"/, 'Huge dropdown label must show the new optimized size');
assert.match(labels, /"RingGargantuan": "Gargantuan \(1368@2048\)"/, 'Gargantuan dropdown label must show the new optimized size');

console.log('static-optimized-large-sizes: ok');
