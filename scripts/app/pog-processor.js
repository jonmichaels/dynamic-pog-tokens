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

/**
 * Remove the annular edge band left by circular pog borders after the square
 * crop. The trim control means "move the circular edge inward by N pixels",
 * not only "crop N pixels from the square bounds".
 *
 * @param {HTMLCanvasElement|OffscreenCanvas} canvas  Cropped token canvas
 */
function applyCircularEdgeTrim(canvas, trimPx = 0) {
  const width = canvas.width;
  const height = canvas.height;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, width, height);

  const centerX = (width - 1) / 2;
  const centerY = (height - 1) / 2;
  const radius = Math.max(0, (Math.min(width, height) / 2) - trimPx);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const distanceFromCenter = Math.hypot(x - centerX, y - centerY);
      if (distanceFromCenter > radius) {
        const idx = (y * width + x) * 4;
        imageData.data[idx + 3] = 0;
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Detect the smallest rectangle containing non-transparent image pixels.
 * Transparent canvas padding should not affect trim, resize, or sizing math.
 *
 * @param {ImageBitmap} imageBitmap
 * @returns {{x:number,y:number,width:number,height:number,cropped:boolean}}
 */
function detectContentBounds(imageBitmap) {
  const width = imageBitmap.width;
  const height = imageBitmap.height;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imageBitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, width, height);

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      if (imageData.data[idx + 3] > 0) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return { x: 0, y: 0, width, height, cropped: false };
  }

  const contentWidth = maxX - minX + 1;
  const contentHeight = maxY - minY + 1;
  return {
    x: minX,
    y: minY,
    width: contentWidth,
    height: contentHeight,
    cropped: minX > 0 || minY > 0 || contentWidth < width || contentHeight < height,
  };
}

/**
 * Remove fully transparent canvas padding before any user-selected processing.
 *
 * @param {ImageBitmap} imageBitmap
 * @returns {Promise<{croppedBitmap: ImageBitmap, croppedWidth: number, croppedHeight: number, contentBounds: Object}>}
 */
async function cropTransparentPadding(imageBitmap) {
  const contentBounds = detectContentBounds(imageBitmap);
  if (!contentBounds.cropped) {
    return {
      croppedBitmap: imageBitmap,
      croppedWidth: imageBitmap.width,
      croppedHeight: imageBitmap.height,
      contentBounds,
    };
  }

  const canvas = createCanvas(contentBounds.width, contentBounds.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(
    imageBitmap,
    contentBounds.x,
    contentBounds.y,
    contentBounds.width,
    contentBounds.height,
    0,
    0,
    contentBounds.width,
    contentBounds.height,
  );

  return {
    croppedBitmap: await canvasToBitmap(canvas),
    croppedWidth: contentBounds.width,
    croppedHeight: contentBounds.height,
    contentBounds,
  };
}

/**
 * Best-effort square crop for rectangular sources.
 * Uses the smaller dimension as the output square and removes equal pixels from
 * both sides of the larger dimension.
 *
 * @param {ImageBitmap} imageBitmap
 * @returns {Promise<{squareBitmap: ImageBitmap, squareWidth: number, squareHeight: number, squareCrop: Object}>}
 */
async function centerCropToSquare(imageBitmap) {
  const size = Math.min(imageBitmap.width, imageBitmap.height);
  const sx = Math.floor((imageBitmap.width - size) / 2);
  const sy = Math.floor((imageBitmap.height - size) / 2);
  const squareCrop = {
    x: sx,
    y: sy,
    width: size,
    height: size,
    cropped: imageBitmap.width !== imageBitmap.height,
  };

  if (!squareCrop.cropped) {
    return {
      squareBitmap: imageBitmap,
      squareWidth: imageBitmap.width,
      squareHeight: imageBitmap.height,
      squareCrop,
    };
  }

  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imageBitmap, sx, sy, size, size, 0, 0, size, size);

  return {
    squareBitmap: await canvasToBitmap(canvas),
    squareWidth: size,
    squareHeight: size,
    squareCrop,
  };
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
 * Subject diameters preserve the module's existing Large ratio: 684@1024.
 * @type {Array<{name: string, ring: number, canvas: number}>}
 */
const RING_SIZES = [
  { name: 'tiny', ring: 172, canvas: 256 },
  { name: 'sm',   ring: 344, canvas: 512 },
  { name: 'med',  ring: 344, canvas: 512 },
  { name: 'lg',   ring: 684, canvas: 1024 },
  { name: 'huge', ring: 1026, canvas: 1536 },
  { name: 'grg',  ring: 1368, canvas: 2048 },
];

const LARGE_SIZE_NAMES = new Set(['tiny', 'sm', 'med', 'lg']);
const MAX_LARGE_TIER_UPSCALE_RATIO = 1.10;

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
 * Optionally crop pixels from each edge of an image.
 * Cropping reduces the image dimensions so the ring sizing algorithm
 * positions the Dynamic Ring correctly relative to the subject.
 *
 * @param {ImageBitmap} imageBitmap
 * @param {number} trimPx  Pixels to trim from each edge (0 = no trim)
 * @returns {Promise<{trimmedBitmap: ImageBitmap, trimmedWidth: number, trimmedHeight: number}>}
 */
export async function trimImage(imageBitmap, trimPx) {
  if (trimPx <= 0) {
    return { trimmedBitmap: imageBitmap, trimmedWidth: imageBitmap.width, trimmedHeight: imageBitmap.height, appliedTrimPx: 0 };
  }

  const srcW = imageBitmap.width;
  const srcH = imageBitmap.height;

  const safeTrim = Math.min(trimPx, Math.floor((srcW - 2) / 2), Math.floor((srcH - 2) / 2));
  if (safeTrim <= 0) {
    return { trimmedBitmap: imageBitmap, trimmedWidth: srcW, trimmedHeight: srcH, appliedTrimPx: 0 };
  }

  const newW = srcW - 2 * safeTrim;
  const newH = srcH - 2 * safeTrim;

  const canvas = createCanvas(newW, newH);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imageBitmap, safeTrim, safeTrim, newW, newH, 0, 0, newW, newH);

  const trimmedBitmap = await canvasToBitmap(canvas);
  return { trimmedBitmap, trimmedWidth: newW, trimmedHeight: newH, appliedTrimPx: safeTrim };
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
 * OPTIMIZED MODE:  Existing Tiny through Large behavior remains smallest
 *                  standard ring >= subject. Huge/Gargantuan allow only
 *                  modest uprez; if the larger tier would blur the image,
 *                  use the previous ring and downrez instead. Maximum output
 *                  is Gargantuan: 1368 subject on 2048 canvas.
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

  // Optimized mode: match to standard ring. Keep existing Tiny-Large uprez
  // behavior, but avoid blurry over-uprez for Huge/Gargantuan tiers.
  let best = RING_SIZES[0];
  for (const entry of RING_SIZES) {
    if (maxDim <= entry.ring) {
      if (LARGE_SIZE_NAMES.has(entry.name)) {
        best = entry;
      } else {
        const upscaleRatio = entry.ring / maxDim;
        best = upscaleRatio <= MAX_LARGE_TIER_UPSCALE_RATIO
          ? entry
          : best;
      }
      break;
    }
    best = entry;
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
  let appliedTrimPx = 0;
  let masked = false;

  // --- Step 1: Load ---
  const { imageBitmap, width: origW, height: origH } = await loadImage(src);
  steps.push('load');

  const beforeData = { width: origW, height: origH };

  // --- Step 2: Remove transparent canvas padding ---
  let workingBitmap = imageBitmap;
  let workingW = origW;
  let workingH = origH;
  let contentBounds = { x: 0, y: 0, width: origW, height: origH, cropped: false };
  let squareCrop = { x: 0, y: 0, width: origW, height: origH, cropped: false };

  const cropResult = await cropTransparentPadding(workingBitmap);
  workingBitmap = cropResult.croppedBitmap;
  workingW = cropResult.croppedWidth;
  workingH = cropResult.croppedHeight;
  contentBounds = cropResult.contentBounds;
  steps.push('content-bounds');

  // --- Step 2b: Best-effort centered square crop for rectangular sources ---
  const squareResult = await centerCropToSquare(workingBitmap);
  workingBitmap = squareResult.squareBitmap;
  workingW = squareResult.squareWidth;
  workingH = squareResult.squareHeight;
  squareCrop = squareResult.squareCrop;
  steps.push('square-crop');

  // --- Step 3: Trim ---
  if (trimPx > 0) {
    const trimResult = await trimImage(workingBitmap, trimPx);
    workingBitmap = trimResult.trimmedBitmap;
    workingW = trimResult.trimmedWidth;
    workingH = trimResult.trimmedHeight;
    appliedTrimPx = trimResult.appliedTrimPx;
    trimmed = appliedTrimPx > 0;
  }
  steps.push('trim');

  // --- Step 4: Mask ---
  if (maskEnabled) {
    const maskResult = await maskImage(workingBitmap, maskThreshold);
    workingBitmap = maskResult.maskedBitmap;
    masked = maskResult.maskApplied;
  }
  steps.push('mask');

  // --- Step 4b: Circular edge trim ---
  // Apply after background masking so trim-created transparency does not cause
  // maskImage to skip flood-fill background removal.
  if (trimPx > 0) {
    const circularTrimCanvas = createCanvas(workingW, workingH);
    const circularTrimCtx = circularTrimCanvas.getContext('2d');
    circularTrimCtx.drawImage(workingBitmap, 0, 0);
    applyCircularEdgeTrim(circularTrimCanvas, appliedTrimPx);
    workingBitmap = await canvasToBitmap(circularTrimCanvas);
  }
  steps.push('circular-trim');

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

  const previewTrimPx = appliedTrimPx > 0
    ? Math.round(appliedTrimPx * (sizing.ringDiameter / Math.max(workingW, workingH)))
    : 0;

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
      contentBounds,
      squareCrop,
      appliedTrimPx,
      previewTrimPx,
      steps,
    },
  };
}
