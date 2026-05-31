/**
 * PogProcessor — Pure-JS image processing engine for Dynamic Pog Tokens.
 *
 * Runs entirely in the browser using Canvas API + pica (Lanczos3).
 * No Node.js dependencies. All functions are async and work with standard web APIs.
 *
 * Pipeline: load → trim → mask → calculateTarget → resizeToRing → composeOnCanvas → export
 *
 * @module pog-processor
 */

import pica from 'pica';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Create a canvas (OffscreenCanvas preferred, fallback to HTMLCanvasElement).
 * @param {number} width
 * @param {number} height
 * @returns {HTMLCanvasElement|OffscreenCanvas}
 */
function createCanvas(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height);
  }
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

/**
 * Convert any canvas-like object to an ImageBitmap.
 * Works with both OffscreenCanvas and HTMLCanvasElement.
 * @param {HTMLCanvasElement|OffscreenCanvas} canvas
 * @returns {Promise<ImageBitmap>}
 */
function canvasToBitmap(canvas) {
  return createImageBitmap(canvas);
}

/**
 * Draw an ImageBitmap onto a canvas at natural size.
 * @param {ImageBitmap} bitmap
 * @param {HTMLCanvasElement|OffscreenCanvas} canvas
 */
function drawBitmapToCanvas(bitmap, canvas) {
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
}

/**
 * Compute relative luminance from RGB components (ITU-R BT.709).
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {number}
 */
function luminance(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Sample the image data to determine whether it has an alpha channel
 * (any pixel with alpha < 255).
 * @param {ImageData} imageData
 * @param {number} width
 * @param {number} height
 * @returns {boolean}
 */
function hasAlphaChannel(imageData, width, height) {
  const step = Math.max(1, Math.floor(Math.min(width, height) / 20));
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const alpha = imageData.data[(y * width + x) * 4 + 3];
      if (alpha < 255) return true;
    }
  }
  return false;
}

/**
 * Extract the average background colour from the four corner pixels.
 * @param {ImageData} imageData
 * @param {number} width
 * @param {number} height
 * @returns {{r: number, g: number, b: number}}
 */
function getCornerBackground(imageData, width, height) {
  const corners = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ];
  let r = 0, g = 0, b = 0;
  for (const [x, y] of corners) {
    const idx = (y * width + x) * 4;
    r += imageData.data[idx];
    g += imageData.data[idx + 1];
    b += imageData.data[idx + 2];
  }
  return { r: Math.round(r / 4), g: Math.round(g / 4), b: Math.round(b / 4) };
}

/**
 * Flood-fill from the four corners inward, making pixels transparent when
 * their luminance difference from the background colour is below threshold.
 * Stops at subject edges (where the difference >= threshold).
 *
 * Uses iterative BFS with a flat queue for performance.
 *
 * @param {ImageData} imageData
 * @param {number} width
 * @param {number} height
 * @param {{r:number,g:number,b:number}} bgColor
 * @param {number} threshold  0-255
 */
function floodFillCorners(imageData, width, height, bgColor, threshold) {
  const bgLum = luminance(bgColor.r, bgColor.g, bgColor.b);
  const visited = new Uint8Array(width * height);
  const queue = new Array(width * height);
  let head = 0;
  let tail = 0;

  // Seed the four corners
  const seeds = [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]];
  for (const [sx, sy] of seeds) {
    const si = sy * width + sx;
    if (!visited[si]) {
      visited[si] = 1;
      queue[tail++] = [sx, sy];
    }
  }

  while (head < tail) {
    const [x, y] = queue[head++];
    const idx = (y * width + x) * 4;
    const r = imageData.data[idx];
    const g = imageData.data[idx + 1];
    const b = imageData.data[idx + 2];

    const lumDiff = Math.abs(luminance(r, g, b) - bgLum);

    if (lumDiff < threshold) {
      // Background pixel — make transparent
      imageData.data[idx + 3] = 0;

      // Enqueue 4-directional neighbours
      const neighbours = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
      for (const [nx, ny] of neighbours) {
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const ni = ny * width + nx;
          if (!visited[ni]) {
            visited[ni] = 1;
            queue[tail++] = [nx, ny];
          }
        }
      }
    }
    // else: subject edge — stop propagating in this direction
  }
}

// ---------------------------------------------------------------------------
// pica singleton
// ---------------------------------------------------------------------------

let _picaInstance = null;

/**
 * Lazily initialise and return the pica resizer singleton.
 * @returns {Object} pica instance
 */
function getPica() {
  if (!_picaInstance) {
    _picaInstance = pica({ features: ['js', 'wasm'] });
  }
  return _picaInstance;
}

// ---------------------------------------------------------------------------
// Ring-size reference table
// ---------------------------------------------------------------------------

/**
 * Standard ring sizes.
 * @type {Array<{name: string, ring: number, canvas: number}>}
 */
const RING_SIZES = [
  { name: 'tiny', ring: 172, canvas: 256 },
  { name: 'sm',   ring: 344, canvas: 512 },
  { name: 'med',  ring: 344, canvas: 512 },
  { name: 'lg',   ring: 684, canvas: 1024 },
  { name: 'huge', ring: 684, canvas: 1024 },
  { name: 'grg',  ring: 684, canvas: 1024 },
];

// ---------------------------------------------------------------------------
// 1. loadImage
// ---------------------------------------------------------------------------

/**
 * Load an image from a File object or URL string.
 *
 * @param {File|string} src  File object or URL string
 * @returns {Promise<{imageBitmap: ImageBitmap, width: number, height: number}>}
 */
export async function loadImage(src) {
  try {
    let bitmap;
    if (src instanceof File) {
      bitmap = await createImageBitmap(src);
    } else if (typeof src === 'string') {
      const response = await fetch(src);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
      }
      const blob = await response.blob();
      bitmap = await createImageBitmap(blob);
    } else {
      throw new TypeError('loadImage: src must be a File or URL string');
    }

    return {
      imageBitmap: bitmap,
      width: bitmap.width,
      height: bitmap.height,
    };
  } catch (err) {
    throw new Error(`loadImage failed: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// 2. trimImage
// ---------------------------------------------------------------------------

/**
 * Optionally erase pixels from each edge of an image, keeping the same dimensions.
 * Pixels in the border are set to transparent (alpha=0). The image size does not change.
 * This removes prerendered token rings or unwanted outer content.
 *
 * @param {ImageBitmap} imageBitmap
 * @param {number} trimPx  Pixels to erase from each edge (0 = no change)
 * @returns {Promise<{trimmedBitmap: ImageBitmap, trimmedWidth: number, trimmedHeight: number}>}
 */
export async function trimImage(imageBitmap, trimPx) {
  const srcW = imageBitmap.width;
  const srcH = imageBitmap.height;

  if (trimPx <= 0) {
    return { trimmedBitmap: imageBitmap, trimmedWidth: srcW, trimmedHeight: srcH };
  }

  // Draw onto same-size canvas
  const canvas = createCanvas(srcW, srcH);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imageBitmap, 0, 0);

  // Clear border pixels by drawing a transparent "frame" over the edges
  const imageData = ctx.getImageData(0, 0, srcW, srcH);
  const data = imageData.data;

  const safeTrim = Math.min(trimPx, Math.floor(Math.min(srcW, srcH) / 2));
  for (let y = 0; y < srcH; y++) {
    for (let x = 0; x < srcW; x++) {
      if (x < safeTrim || x >= srcW - safeTrim || y < safeTrim || y >= srcH - safeTrim) {
        const idx = (y * srcW + x) * 4;
        data[idx + 3] = 0; // alpha = 0
      }
    }
  }
  ctx.putImageData(imageData, 0, 0);

  const trimmedBitmap = await canvasToBitmap(canvas);
  return { trimmedBitmap, trimmedWidth: srcW, trimmedHeight: srcH };
}

// ---------------------------------------------------------------------------
// 3. maskImage
// ---------------------------------------------------------------------------

/**
 * Background-removal via corner flood-fill.
 *
 * If the image already contains transparency (alpha < 255 anywhere),
 * it is returned unchanged — no mask is applied.
 *
 * @param {ImageBitmap} trimmedBitmap
 * @param {number} [threshold=128]  Aggressiveness 0-255 (higher = more aggressive)
 * @returns {Promise<{maskedBitmap: ImageBitmap, maskApplied: boolean}>}
 */
export async function maskImage(trimmedBitmap, threshold = 128) {
  const w = trimmedBitmap.width;
  const h = trimmedBitmap.height;

  // Draw to a canvas so we can inspect pixels
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(trimmedBitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, w, h);

  // If image already has alpha, skip masking
  if (hasAlphaChannel(imageData, w, h)) {
    return { maskedBitmap: trimmedBitmap, maskApplied: false };
  }

  // Compute average background colour from corners
  const bgColor = getCornerBackground(imageData, w, h);

  // Clamp threshold to valid range
  const safeThreshold = Math.max(0, Math.min(255, threshold));

  // Flood-fill corners
  floodFillCorners(imageData, w, h, bgColor, safeThreshold);

  // Write modified pixels back
  ctx.putImageData(imageData, 0, 0);

  const maskedBitmap = await canvasToBitmap(canvas);
  return { maskedBitmap, maskApplied: true };
}

// ---------------------------------------------------------------------------
// 4. calculateTargetSize
// ---------------------------------------------------------------------------

/**
 * Determine the output ring diameter and canvas size for a subject.
 *
 * QUICK MODE:  canvas = maxDimension × 1.491, rounded to nearest even.
 *              No standard ring-sizing; simple padded canvas.
 *
 * OPTIMIZED MODE:  Find the smallest standard ring >= subject's max dimension
 *                  (minimal upscale). If subject > 684 px, downscale to 684.
 *
 * @param {number} subjectWidth
 * @param {number} subjectHeight
 * @param {'quick'|'optimized'} mode
 * @returns {{ringDiameter: number, canvasSize: number, targetRing: string, mode: string}}
 */
export function calculateTargetSize(subjectWidth, subjectHeight, mode) {
  const maxDim = Math.max(subjectWidth, subjectHeight);

  if (mode === 'quick') {
    const canvasSize = Math.round(maxDim * 1.491 / 2) * 2; // nearest even
    // In quick mode the ring is just the subject size; the extra space is padding
    return {
      ringDiameter: maxDim,
      canvasSize: Math.max(canvasSize, 64), // floor at a usable minimum
      targetRing: 'quick',
      mode: 'quick',
    };
  }

  // Optimized mode: match to standard ring
  const targetDim = maxDim > 684 ? 684 : maxDim;

  // Find smallest ring >= targetDim
  let best = RING_SIZES[RING_SIZES.length - 1]; // default to largest
  for (const entry of RING_SIZES) {
    if (entry.ring >= targetDim) {
      best = entry;
      break;
    }
  }

  return {
    ringDiameter: best.ring,
    canvasSize: best.canvas,
    targetRing: best.name,
    mode: 'optimized',
  };
}

// ---------------------------------------------------------------------------
// 5. resizeToRing
// ---------------------------------------------------------------------------

/**
 * Resize the masked subject to fit within the target ring diameter using
 * pica's Lanczos3 filter.
 *
 * Assumes a square or near-square subject. Non-square images are scaled
 * proportionally then centred on the ring canvas.
 *
 * @param {ImageBitmap} maskedBitmap
 * @param {number} ringDiameter
 * @returns {Promise<{resizedBitmap: ImageBitmap, scaledWidth: number, scaledHeight: number}>}
 */
export async function resizeToRing(maskedBitmap, ringDiameter) {
  const w = maskedBitmap.width;
  const h = maskedBitmap.height;

  // Draw source bitmap to a canvas
  const srcCanvas = createCanvas(w, h);
  drawBitmapToCanvas(maskedBitmap, srcCanvas);

  const destCanvas = createCanvas(ringDiameter, ringDiameter);
  const p = getPica();

  if (w === h) {
    // Square — direct Lanczos3 resize
    await p.resize(srcCanvas, destCanvas, { filter: 'lanczos3' });
    const resizedBitmap = await canvasToBitmap(destCanvas);
    return { resizedBitmap, scaledWidth: ringDiameter, scaledHeight: ringDiameter };
  }

  // Non-square: scale proportionally, then centre on the ring canvas
  const scale = ringDiameter / Math.max(w, h);
  const scaledW = Math.round(w * scale);
  const scaledH = Math.round(h * scale);

  // Step 1: Lanczos3 resize to proportional dimensions
  const intermediateCanvas = createCanvas(scaledW, scaledH);
  await p.resize(srcCanvas, intermediateCanvas, { filter: 'lanczos3' });

  // Step 2: Centre the intermediate on the ring-diameter square canvas
  const destCtx = destCanvas.getContext('2d');
  const offsetX = Math.floor((ringDiameter - scaledW) / 2);
  const offsetY = Math.floor((ringDiameter - scaledH) / 2);
  destCtx.drawImage(intermediateCanvas, offsetX, offsetY);

  const resizedBitmap = await canvasToBitmap(destCanvas);
  return { resizedBitmap, scaledWidth: scaledW, scaledHeight: scaledH };
}

// ---------------------------------------------------------------------------
// 6. composeOnCanvas
// ---------------------------------------------------------------------------

/**
 * Place the resized subject centred on a final-sized transparent canvas.
 *
 * @param {ImageBitmap} resizedBitmap
 * @param {number} canvasSize  Final canvas dimensions (square)
 * @param {number} ringDiameter  Diameter of the subject ring
 * @returns {Promise<{finalCanvas: HTMLCanvasElement|OffscreenCanvas}>}
 */
export async function composeOnCanvas(resizedBitmap, canvasSize, ringDiameter) {
  const canvas = createCanvas(canvasSize, canvasSize);
  const ctx = canvas.getContext('2d');

  const offset = Math.floor((canvasSize - ringDiameter) / 2);
  ctx.drawImage(resizedBitmap, offset, offset);

  return { finalCanvas: canvas };
}

// ---------------------------------------------------------------------------
// 7. exportImage
// ---------------------------------------------------------------------------

/**
 * Export a canvas as a Blob in the requested format.
 *
 * @param {HTMLCanvasElement|OffscreenCanvas} canvas
 * @param {'image/webp'|'image/png'} [format='image/webp']
 * @param {number} [quality=0.92]  Quality 0-1 for lossy formats (ignored for PNG)
 * @returns {Promise<Blob>}
 */
export async function exportImage(canvas, format = 'image/webp', quality = 0.92) {
  // OffscreenCanvas uses convertToBlob; HTMLCanvasElement uses toBlob
  if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: format, quality: format === 'image/webp' ? quality : undefined });
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('exportImage: toBlob returned null'));
        }
      },
      format,
      quality,
    );
  });
}

// ---------------------------------------------------------------------------
// 8. processToken — main pipeline
// ---------------------------------------------------------------------------

/**
 * Run the full image-processing pipeline on a single token source.
 *
 * @param {File|string} src               Image source (File object or URL)
 * @param {Object} [options]              Processing options
 * @param {number} [options.trimPx=0]     Pixels to trim from each edge
 * @param {boolean} [options.maskEnabled=true]  Enable corner-flood background mask
 * @param {number} [options.maskThreshold=128]  Mask aggressiveness 0-255
 * @param {'quick'|'optimized'} [options.mode='optimized']  Sizing strategy
 * @param {string} [options.ringOverride]  Force a specific ring size name ('tiny'|'sm'|'med'|'lg'|'huge'|'grg'). Overrides auto-sizing.
 * @param {'image/webp'|'image/png'} [options.format='image/webp']  Export format
 * @param {number} [options.quality=0.92]  Export quality (WEBP only)
 *
 * @returns {Promise<{
 *   blob: Blob,
 *   beforeData: {width: number, height: number},
 *   afterData: {width: number, height: number, ringDiameter: number, canvasSize: number, targetRing: string},
 *   stats: {mode: string, trimmed: boolean, masked: boolean, steps: string[]}
 * }>}
 */
export async function processToken(src, options = {}) {
  const {
    trimPx = 0,
    maskEnabled = true,
    maskThreshold = 128,
    mode = 'optimized',
    ringOverride = null,
    format = 'image/webp',
    quality = 0.92,
  } = options;

  const steps = [];
  let trimmed = false;
  let masked = false;

  // --- Step 1: Load ---
  const { imageBitmap, width: origW, height: origH } = await loadImage(src);
  steps.push('load');

  const beforeData = { width: origW, height: origH };

  // --- Step 2: Trim ---
  let workingBitmap = imageBitmap;
  let workingW = origW;
  let workingH = origH;

  if (trimPx > 0) {
    const trimResult = await trimImage(workingBitmap, trimPx);
    workingBitmap = trimResult.trimmedBitmap;
    workingW = trimResult.trimmedWidth;
    workingH = trimResult.trimmedHeight;
    trimmed = true;
  }
  steps.push('trim');

  // --- Step 3: Mask ---
  if (maskEnabled) {
    const maskResult = await maskImage(workingBitmap, maskThreshold);
    workingBitmap = maskResult.maskedBitmap;
    masked = maskResult.maskApplied;
  }
  steps.push('mask');

  // --- Step 4: Calculate target size (or use override) ---
  let sizing;
  if (ringOverride && ringOverride !== 'auto') {
    const ringEntry = RING_SIZES.find(r => r.name === ringOverride);
    if (ringEntry) {
      sizing = {
        ringDiameter: ringEntry.ring,
        canvasSize: ringEntry.canvas,
        targetRing: ringEntry.name,
        mode: 'override',
      };
    } else {
      sizing = calculateTargetSize(workingW, workingH, mode);
    }
  } else {
    sizing = calculateTargetSize(workingW, workingH, mode);
  }
  steps.push('size');

  // --- Step 5: Resize to ring ---
  const { resizedBitmap, scaledWidth, scaledHeight } = await resizeToRing(
    workingBitmap,
    sizing.ringDiameter,
  );
  steps.push('resize');

  // --- Step 6: Compose on final canvas ---
  const { finalCanvas } = await composeOnCanvas(
    resizedBitmap,
    sizing.canvasSize,
    sizing.ringDiameter,
  );
  steps.push('compose');

  // --- Step 7: Export ---
  const blob = await exportImage(finalCanvas, format, quality);
  steps.push('export');

  return {
    blob,
    beforeData,
    afterData: {
      width: scaledWidth,
      height: scaledHeight,
      ringDiameter: sizing.ringDiameter,
      canvasSize: sizing.canvasSize,
      targetRing: sizing.targetRing,
    },
    stats: {
      mode: sizing.mode,
      trimmed,
      masked,
      steps,
    },
  };
}
