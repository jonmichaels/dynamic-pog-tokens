import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const source = readFileSync('scripts/app/pog-tokens-app.js', 'utf8');

assert(
  !source.includes('controls.find('),
  'getSceneControlButtons must not treat controls as an array; Foundry v13/v14 pass a Record<string, SceneControl>',
);

assert(
  source.includes('controls.tokens'),
  'scene control hook should target the token control via controls.tokens',
);

assert(
  source.includes('controls.tokens.tools.dynamicPogTokens'),
  'scene control hook should add the tool as a keyed entry in controls.tokens.tools',
);

assert(
  source.includes('button: true'),
  'scene control tool should be a button so it opens the app without becoming the active token tool',
);

assert(
  source.includes('onChange:'),
  'scene control tool should use onChange; onClick is deprecated since Foundry v13',
);

console.log('static-scene-control-api: ok');
