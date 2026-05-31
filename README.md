# Dynamic Pog Tokens

> **⚠️ Disclaimer:** This module was created by an AI coding agent (Hephaestus, via Hermes Agent) under the direction of Jon Michaels. While tested and functional, users should verify behavior in their own games before relying on it in critical sessions.

[![Foundry VTT](https://img.shields.io/badge/Foundry-v13%20%7C%20v14-orange)](https://foundryvtt.com)
[![D&D 5E](https://img.shields.io/badge/System-D%26D%205E-red)](https://dnd.wizards.com)
[![Version](https://img.shields.io/badge/Version-0.1.0-green)](https://github.com/jonmichaels/dynamic-pog-tokens/releases)

Batch-process pog-style tokens for **Foundry VTT Dynamic Token Rings**. Resize, trim, and mask tokens with high-quality Lanczos3 scaling via pica.

## Features

| Feature | Description |
|---------|-------------|
| **Batch processing** | Process multiple pog-style tokens at once |
| **Lanczos3 scaling** | High-quality image resizing via pica (better than browser default bilinear) |
| **Trim & mask** | Automatic border trimming and circular/ring masking for Dynamic Rings |
| **Before/After preview** | Side-by-side comparison of original and processed tokens |
| **WEBP & PNG export** | Choose between modern WEBP or classic PNG output |
| **ApplicationV2 UI** | Modern Foundry VTT ApplicationV2 interface with Handlebars templates |

## Installation

**In Foundry VTT:**
1. Go to **Add-on Modules** → **Install Module**
2. Paste the manifest URL: `https://github.com/jonmichaels/dynamic-pog-tokens/releases/latest/download/module.json`
3. Click **Install**

**Manual:**
Download the [latest release](https://github.com/jonmichaels/dynamic-pog-tokens/releases) and extract to `Data/modules/dynamic-pog-tokens/`.

## Requirements

- **Foundry VTT** v13+
- **D&D 5E** (v5.0+) or compatible system

## How It Works

1. Activate the module in your world
2. Click the **Dynamic Pog Tokens** button in the scene controls or token sidebar
3. Select one or more pog-style token images
4. Configure processing options (quality, trim, mask, ring size, export format)
5. Click **Process** to batch-convert tokens to Dynamic Ring-compatible format

The module uses pica for high-quality Lanczos3 image resizing and the Canvas API for masking and compositing.

## Credits

[Dynamic Pog Tokens](https://github.com/jonmichaels/dynamic-pog-tokens) by Jon Michaels. Coded by Hephaestus, a Hermes AI-Coding Agent.

## License

This module is available under the [MIT License](LICENSE).
