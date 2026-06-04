# Dynamic Pog Tokens

Foundry VTT module (v13+) for batch-processing pog-style token images into Dynamic Token Rings format. Processes token images through Canvas API + pica (Lanczos3) pipeline: trim transparent padding, center-crop rectangular sources to the smaller square dimension, trim edges, flood-fill background mask, resize to ring dimensions, center on transparent canvas.

## Module ID
`dynamic-pog-tokens`

## Architecture

- **Universal module** — no system lock, works with dnd5e, Black Flag, any system
- **ApplicationV2** — uses `HandlebarsApplicationMixin(ApplicationV2)`
- **Single self-contained Handlebars template** — no partials (Foundry v13 Handlebars partial registration is not supported via `{{> }}` in ApplicationV2 templates)
- **Webpack** — bundles JS + SCSS → `scripts/module.js` + `styles/module.css`
- **pica** — Lanczos3 image resizing, imported from npm, bundled by webpack

## File Layout

```
├── module.json           # Foundry manifest, universal (no relationships.systems)
├── README.md
├── CLAUDE.md
├── .gitignore            # Ignores build artifacts; they're committed for symlink dev
├── webpack.config.js     # Two entries: scripts/module + styles/module
├── package.json
├── languages/en.json     # 44 DynPog.* i18n keys
├── scss/module.scss      # Dark theme, ApplicationV2 compatible
├── scripts/
│   ├── main.js           # Entry: Hooks.once("init") → initDynamicPogTokens()
│   └── app/
│       ├── pog-tokens-app.js   # PogTokensApp class + init function + hooks
│       └── pog-processor.js    # Pure-JS image pipeline: load→trim→mask→resize→compose→export
├── styles/               # Webpack output for CSS
└── templates/
    ├── dynamic-pog-tokens.hbs  # Main template (self-contained, no partials)
    └── partials/               # Dead files — kept for reference, not used
        ├── before-after.hbs
        ├── controls.hbs
        └── progress.hbs
```

## Critical Rules

### Handlebars Helper
Use `{{localize "DynPog.Key"}}` in templates. `{{i18n}}` is NOT a registered Handlebars helper in Foundry v13 — `{{localize}}` is (registered in `client/applications/handlebars.mjs:107-118`).

### No Template Partials
Do NOT use `{{> "path/to/partial"}}` in Handlebars templates. Foundry's `HandlebarsApplicationMixin` only resolves `PARTS.template` paths via `foundry.applications.handlebars.renderTemplate()` — it does NOT register Handlebars partials. Inline everything.

### FilePicker API (v13)
- Constructor callback pattern still works: `new FilePicker({type: 'folder', callback: fn}).browse()`
- Static browse: `FilePicker.browse("data", folderPath)` — first arg is storage identifier, second is directory path
- Paths are relative to user data root (e.g., `assets/tokens/img.png`)

### CSS Targeting
ApplicationV2 wraps the app in `#dynamic-pog-tokens` (matching `DEFAULT_OPTIONS.id`). Use this for scoped selectors.

## Entry Points

1. **Actor Directory footer button** — `renderActorDirectory` hook appends to `.directory-footer`
2. **Scene token controls** — `getSceneControlButtons` hook adds token toolbar button

## Dynamic Token Rings Integration

### How It Works (Core Foundry Feature)
Dynamic Token Rings uses the token's **grid size** (1×1, 2×2, etc.) and the active spritesheet to select a ring. Ring sizes are determined by `gridTarget` values in the spritesheet JSON — these don't change when switching ring styles (Steel → Bronze). Only visual appearance changes.

### Spritesheet Structure (Foundry v13)
Spritesheets at `canvas/tokens/rings-steel.json` + `rings-steel.webp` (and bronze variants):

| Frame Name | gridTarget | Size | Spritesheet Coords |
|---|---|---|---|
| token-ring-tiny | 0.5 | 256×256 | (3328, 2048) |
| token-ring-med | 1 | 512×512 | (2560, 2048) |
| token-ring-large-huge | 2 | 1024×1024 | (1024, 2048) |
| token-ring-gargantuan | 3 | 2048×2048 | (2048, 0) |

Background frames with `-bkg` suffix have same sizes at different coordinates.

### Active Ring Detection
```js
const ringConfigId = game.settings.get("core", "dynamicTokenRing") || "coreSteel";
const config = CONFIG.Token.ring.getConfig(ringConfigId);
config.spritesheet; // "canvas/tokens/rings-steel.json"
```

### Ring Compositing in Preview
`_loadAndPreview` composites: checkerboard (transparency) → token → ring texture (extracted from spritesheet frame). The ring frame is selected by matching the output canvas size (256/512/1024/1536/2048) to the spritesheet frame. Huge 1536 output intentionally uses the `token-ring-large-huge` frame scaled to the 1536 canvas because Foundry's core spritesheet uses the same large/huge artwork family.

### Current State (Hardcoded)
Ring sizes are hardcoded in `pog-processor.js` — `RING_SIZES` table: Matches standard dnd5e/Black Flag sizes:
```js
const RING_SIZES = [
  { name: 'tiny', ring: 172, canvas: 256 },
  { name: 'sm',   ring: 344, canvas: 512 },
  { name: 'med',  ring: 344, canvas: 512 },
  { name: 'lg',   ring: 684,  canvas: 1024 },
  { name: 'huge', ring: 1026, canvas: 1536 },
  { name: 'grg',  ring: 1368, canvas: 2048 },
];
```

### Future: Dynamic Sizing from Spritesheet
If custom spritesheets with different `gridTarget` values are added, read them dynamically:
1. Hook `ready` → access `CONFIG.Token.ring.spritesheet` (path to active spritesheet JSON)
2. Fetch the spritesheet JSON → extract `gridTarget` from each ring entry
3. Group by unique `gridTarget` values → populate dropdown

## Settings Persistence
`game.settings.register('dynamic-pog-tokens', 'lastSettings', ...)` — stores JSON-serialized settings object. Restored on `_onFirstRender`.

## Key Dependencies
- `pica` — npm package for Lanczos3 resizing
- `@foundryvtt/foundry` — external (provided by Foundry runtime)
- Webpack + sass-loader + mini-css-extract-plugin

## Dev Commands
```bash
npm run build    # Webpack production build
npm test         # Static regression suite
```

## Symlinks (Noisy)
```
/home/jon/foundryuserdata/Data/modules/dynamic-pog-tokens → /home/jon/projects/dynamic-pog-tokens
/home/jon/foundryuserdata14/Data/modules/dynamic-pog-tokens → /home/jon/projects/dynamic-pog-tokens
```

## GitHub
`github.com/jonmichaels/dynamic-pog-tokens` — hermes90201 collaborator, noreply email for commits
