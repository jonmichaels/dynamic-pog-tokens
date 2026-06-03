/**
 * PogTokensApp — Main ApplicationV2 window for Dynamic Pog Tokens.
 *
 * Provides a batch processing interface for pog-style tokens:
 *   - Before/After side-by-side image preview
 *   - Quality/trim/mask/ring controls
 *   - WEBP/PNG export
 *
 * Uses HandlebarsApplicationMixin for template rendering.
 */

import { processToken, loadImage } from './pog-processor.js';

/** @type {string} Base path for module assets */
const MODULE_PATH = "modules/dynamic-pog-tokens";

/** Foundry v13 — FilePicker is namespaced */
const FilePicker = foundry.applications.apps.FilePicker.implementation;

/**
 * @extends {ApplicationV2}
 * @mixes {HandlebarsApplicationMixin}
 */
class PogTokensApp extends foundry.applications.api.HandlebarsApplicationMixin(
    foundry.applications.api.ApplicationV2
) {
    /** @override */
    static DEFAULT_OPTIONS = {
        id: "dynamic-pog-tokens",
        tag: "form",
        window: {
            title: "DynPog.Title",
            icon: "fa-solid fa-circle-notch",
        },
        position: {
            width: 640,
            height: 700,
        },
        form: {
            handler: PogTokensApp.#onSubmit,
            submitOnChange: false,
            closeOnSubmit: false,
        },
    };

    // Preview settings state
    _settings = {
        trimPx: 0,
        maskEnabled: false,
        maskThreshold: 128,
        mode: 'optimized',
        format: 'image/webp',
        quality: 0.92,
        ringOverride: 'auto',
    };

    /** @type {string|null} Current source folder path */
    _sourceDir = null;

    /** @type {string[]|null} Explicit source image list; null means process the whole source folder */
    _sourceFiles = null;

    /** @type {string|null} Current preview image path */
    _previewPath = null;

    /** @type {string|null} Current destination folder path */
    _destPath = null;

    /** @type {boolean} Whether batch processing is in progress */
    _isProcessing = false;

    /** @type {number|null} Debounce timer ID */
    _debounceTimer = null;

    /** @type {Object|null} Last processToken result (for ring export) */
    _lastResult = null;

    /** @type {string|null} Last source basename (for ring export filename) */
    _lastSourceBasename = null;

    /** @type {Promise<{bitmap: ImageBitmap, frames: Object}>|null} Cached ring spritesheet */
    _ringCache = null;

    /** @override */
    static PARTS = {
        content: {
            id: "content",
            template: `${MODULE_PATH}/templates/dynamic-pog-tokens.hbs`,
            classes: ["dpog-content"],
        },
    };

    /**
     * Static form submission handler.
     * @param {Event|SubmitEvent} event
     * @param {HTMLFormElement} form
     * @param {Object} formData
     */
    static async #onSubmit(event, form, formData) {
        // Processing logic — Phase 2+
        ui.notifications.info(game.i18n.localize("DynPog.ProcessingTokens"));
    }

    /** @override */
    async _prepareContext(options) {
        return {
            modulePath: MODULE_PATH,
        };
    }

    /** @override */
    _onFirstRender(context, options) {
        super._onFirstRender(context, options);
        this._restoreSettings();
    }

    /** @override */
    _onRender(context, options) {
        super._onRender(context, options);
        this.#bindEvents();
    }

    /**
     * Save current settings to Foundry game settings before closing.
     * @override
     */
    async close(options = {}) {
        this._saveSettings();
        return super.close(options);
    }

    /**
     * Restore settings from Foundry game settings and apply to UI.
     */
    _restoreSettings() {
        try {
            const saved = game.settings.get('dynamic-pog-tokens', 'lastSettings');
            if (saved && saved !== '{}') {
                const parsed = JSON.parse(saved);
                this._settings = { ...this._settings, ...parsed };
            }
        } catch (e) {
            console.warn('[DynPog] Failed to restore settings:', e);
        } finally {
            this._applySettingsToUI();
        }
    }

    /**
     * Save current settings to Foundry game settings.
     */
    _saveSettings() {
        try {
            game.settings.set('dynamic-pog-tokens', 'lastSettings', JSON.stringify(this._settings));
        } catch (e) {
            console.warn('[DynPog] Failed to save settings:', e);
        }
    }

    /**
     * Apply this._settings values to the form controls in the DOM.
     */
    _applySettingsToUI() {
        const html = this.element;
        if (!html) return;

        // Trim
        const trimInput = html.querySelector("#dpog-trim");
        if (trimInput) trimInput.value = this._settings.trimPx;

        // Mask checkbox
        const maskCheck = html.querySelector("#dpog-mask");
        if (maskCheck) {
            maskCheck.checked = this._settings.maskEnabled;
            const thresholdRow = html.querySelector(".dpog-threshold-row");
            if (thresholdRow) {
                thresholdRow.classList.toggle("dpog-hidden", !this._settings.maskEnabled);
            }
        }

        // Threshold
        const thresholdSlider = html.querySelector("#dpog-threshold");
        if (thresholdSlider) thresholdSlider.value = this._settings.maskThreshold;
        const valueSpan = html.querySelector("#dpog-threshold-value");
        if (valueSpan) valueSpan.textContent = this._settings.maskThreshold;

        // Quality mode
        const modeValue = this._settings.mode === 'quick' ? 'quick' : 'optimized';
        const modeRadio = html.querySelector(`input[name='quality'][value='${modeValue}']`);
        if (modeRadio) modeRadio.checked = true;

        // Export format
        const fmtValue = this._settings.format === 'image/png' ? 'png' : 'webp';
        const fmtRadio = html.querySelector(`input[name='exportFormat'][value='${fmtValue}']`);
        if (fmtRadio) fmtRadio.checked = true;

        // Ring override
        const ringSelect = html.querySelector("#dpog-ring-select");
        if (ringSelect) ringSelect.value = this._settings.ringOverride || 'auto';
    }

    /**
     * Bind change/click events on the rendered DOM.
     */
    #bindEvents() {
        const html = this.element;

        // Source browse button — opens FilePicker
        const sourceBtn = html.querySelector("#dpog-select-images");
        if (sourceBtn) {
            sourceBtn.addEventListener("click", (ev) => {
                ev.preventDefault();
                this._onBrowseSource();
            });
        }

        // Preview Single button — re-process current source
        const previewBtn = html.querySelector("#dpog-process-btn");
        if (previewBtn) {
            previewBtn.addEventListener("click", async (ev) => {
                ev.preventDefault();
                if (this._previewPath) {
                    await this._loadAndPreview(this._previewPath);
                }
            });
        }

        // Mask checkbox — toggle threshold slider + trigger re-process
        const maskCheck = html.querySelector("#dpog-mask");
        if (maskCheck) {
            const thresholdRow = html.querySelector(".dpog-threshold-row");
            maskCheck.addEventListener("change", () => {
                if (thresholdRow) {
                    thresholdRow.classList.toggle("dpog-hidden", !maskCheck.checked);
                }
                this._onSettingsChange();
            });
        }

        // Trim input — debounced re-process
        const trimInput = html.querySelector("#dpog-trim");
        if (trimInput) {
            trimInput.addEventListener("input", () => this._debouncedSettingsChange());
        }

        // Threshold slider — debounced re-process + update display value
        const thresholdSlider = html.querySelector("#dpog-threshold");
        if (thresholdSlider) {
            thresholdSlider.addEventListener("input", () => {
                this._debouncedSettingsChange();
                const valueSpan = html.querySelector("#dpog-threshold-value");
                if (valueSpan) {
                    valueSpan.textContent = thresholdSlider.value;
                }
            });
        }

        // Quality radio buttons — immediate re-process
        const qualityRadios = html.querySelectorAll("input[name='quality']");
        qualityRadios.forEach((radio) => {
            radio.addEventListener("change", () => this._onSettingsChange());
        });

        // Export format radio buttons — immediate re-process
        const formatRadios = html.querySelectorAll("input[name='exportFormat']");
        formatRadios.forEach((radio) => {
            radio.addEventListener("change", () => this._onSettingsChange());
        });

        // Ring size select — immediate re-process
        const ringSelect = html.querySelector("#dpog-ring-select");
        if (ringSelect) {
            ringSelect.addEventListener("change", () => this._onSettingsChange());
        }

        // Destination folder browse button
        const destBtn = html.querySelector("#dpog-browse-dest");
        if (destBtn) {
            destBtn.addEventListener("click", (ev) => {
                ev.preventDefault();
                this._onBrowseDest();
            });
        }

        // Export With Ring button
        const exportRingBtn = html.querySelector("#dpog-export-ring");
        if (exportRingBtn) {
            exportRingBtn.addEventListener("click", async (ev) => {
                ev.preventDefault();
                await this._exportWithRing();
            });
        }

        // Process All button
        const processAllBtn = html.querySelector("#dpog-process-all");
        if (processAllBtn) {
            processAllBtn.addEventListener("click", async (ev) => {
                ev.preventDefault();
                await this._processAll();
            });
        }
    }

    /**
     * Open Foundry's FilePicker to browse for a source image or source folder.
     * The native image picker shows image files; a module-added action selects the current folder.
     */
    async _onBrowseSource() {
        const picker = new FilePicker({
            type: 'image',
            current: this._previewPath || this._sourceDir || '',
            callback: async (selectedPath) => {
                await this._setSourceFromImage(selectedPath);
            },
        });

        const addFolderButton = (app) => {
            if (app === picker) this.#addUseCurrentFolderButton(picker);
        };
        Hooks.on("renderFilePicker", addFolderButton);

        const closePicker = picker.close.bind(picker);
        picker.close = async (...args) => {
            Hooks.off("renderFilePicker", addFolderButton);
            return closePicker(...args);
        };

        await picker.browse();
        this.#addUseCurrentFolderButton(picker);
        setTimeout(() => this.#addUseCurrentFolderButton(picker), 50);
    }

    /**
     * Add a "Use Current Folder" button to Foundry's image picker so one dialog can select either a file or a folder.
     * @param {FilePicker} picker
     */
    #addUseCurrentFolderButton(picker) {
        const root = picker.element;
        if (!root || root.querySelector(".dpog-use-current-folder")) return;

        const selectButton = root.querySelector("button[type='submit']");
        const container = selectButton?.parentElement || root.querySelector("footer") || root.querySelector(".window-content");
        if (!container) return;

        const folderButton = document.createElement("button");
        folderButton.type = "button";
        folderButton.classList.add("dpog-use-current-folder");
        folderButton.innerHTML = `<i class="fa-solid fa-folder-check"></i> ${game.i18n.localize("DynPog.UseCurrentFolder")}`;
        folderButton.addEventListener("click", async (ev) => {
            ev.preventDefault();
            const folderPath = picker.source?.target || picker.target || picker.result?.target || '';
            await this._setSourceFromFolder(folderPath);
            picker.close();
        });

        if (selectButton) selectButton.before(folderButton);
        else container.appendChild(folderButton);
    }

    /**
     * Select a single image as the source.
     * @param {string} filePath
     */
    async _setSourceFromImage(filePath) {
        if (!this.#isImagePath(filePath)) {
            ui.notifications.warn(game.i18n.localize("DynPog.NoImage"));
            return;
        }

        this._previewPath = filePath;
        this._sourceDir = this.#getFolderPath(filePath);
        this._sourceFiles = [filePath];

        const srcDisplay = this.element.querySelector("#dpog-source-path");
        if (srcDisplay) srcDisplay.textContent = game.i18n.format("DynPog.SourceImage", { path: filePath });

        await this._loadAndPreview(filePath);
        this._checkProcessAllEnabled();
    }

    /**
     * Select a folder as the source and preview its first image.
     * @param {string} folderPath
     */
    async _setSourceFromFolder(folderPath) {
        this._sourceDir = this.#normalizeFolderPath(folderPath);
        this._sourceFiles = null;

        const srcDisplay = this.element.querySelector("#dpog-source-path");
        if (srcDisplay) srcDisplay.textContent = game.i18n.format("DynPog.SourceFolder", { path: this._sourceDir });

        try {
            const imageFiles = await this.#getImageFilesFromFolder(this._sourceDir);
            if (imageFiles.length > 0) {
                this._previewPath = imageFiles[0];
                await this._loadAndPreview(imageFiles[0]);
            } else {
                this._previewPath = null;
                ui.notifications.warn(game.i18n.localize("DynPog.NoImages"));
            }
        } catch (e) {
            console.warn('[DynPog] Could not browse folder for preview:', e);
        }

        this._checkProcessAllEnabled();
    }

    /**
     * Browse a folder and return only supported image files.
     * @param {string} folderPath
     * @returns {Promise<string[]>}
     */
    async #getImageFilesFromFolder(folderPath) {
        const browseResult = await FilePicker.browse("data", folderPath);
        return browseResult.files.filter(f => this.#isImagePath(f));
    }

    /**
     * @param {string} filePath
     * @returns {boolean}
     */
    #isImagePath(filePath) {
        const lower = filePath.toLowerCase();
        return ['.png', '.webp', '.jpg', '.jpeg'].some(ext => lower.endsWith(ext));
    }

    /**
     * @param {string} filePath
     * @returns {string}
     */
    #getFolderPath(filePath) {
        const idx = filePath.lastIndexOf('/');
        if (idx < 0) return '';
        return this.#normalizeFolderPath(filePath.slice(0, idx));
    }

    /**
     * @param {string} folderPath
     * @returns {string}
     */
    #normalizeFolderPath(folderPath) {
        if (!folderPath) return '';
        const normalized = folderPath.replace(/^\//, '');
        return normalized.endsWith('/') ? normalized : `${normalized}/`;
    }

    /**
     * Open Foundry's FilePicker to browse for a destination folder.
     */
    _onBrowseDest() {
        const fp = new FilePicker({
            type: 'folder',
            callback: (folderPath) => {
                this._destPath = folderPath.endsWith('/') ? folderPath : folderPath + '/';
                const destDisplay = this.element.querySelector("#dpog-dest-path");
                if (destDisplay) {
                    destDisplay.textContent = this._destPath;
                }
                this._checkProcessAllEnabled();
            },
        });
        fp.browse();
    }

    /**
     * Enable the Process All button only if both source and destination are selected.
     */
    _checkProcessAllEnabled() {
        const btn = this.element.querySelector("#dpog-process-all");
        if (btn) {
            btn.disabled = !(this._sourceDir && this._destPath && !this._isProcessing);
        }
    }

    /**
     * Batch-process all images in the source directory, save to destination.
     */
    async _processAll() {
        if (this._isProcessing || !this._sourceDir || !this._destPath) {
            return;
        }

        this._isProcessing = true;
        this._checkProcessAllEnabled();

        const html = this.element;
        const progressSection = html.querySelector("#dpog-progress-section");
        const progressFill = html.querySelector("#dpog-progress-fill");
        const progressText = html.querySelector("#dpog-progress-text");
        const progressStatus = html.querySelector("#dpog-progress-status");

        try {
            // Read settings before processing starts
            this._onSettingsChange();

            // Get prefix from input
            const prefixInput = html.querySelector("#dpog-prefix");
            const prefix = prefixInput ? (prefixInput.value || "dynamic_ring_") : "dynamic_ring_";

            // Determine file extension from format setting
            const ext = this._settings.format === 'image/png' ? '.png' : '.webp';

            // Show progress section
            if (progressSection) {
                progressSection.classList.remove("dpog-hidden");
            }
            if (progressFill) {
                progressFill.style.width = "0%";
            }
            if (progressText) {
                progressText.textContent = "0%";
            }
            if (progressStatus) {
                progressStatus.textContent = game.i18n.localize("DynPog.Scanning");
            }

            // Scan selected source image or selected source directory for image files
            const imageFiles = this._sourceFiles ? this._sourceFiles : await this.#getImageFilesFromFolder(this._sourceDir);

            const total = imageFiles.length;
            if (total === 0) {
                if (progressStatus) {
                    progressStatus.textContent = game.i18n.localize("DynPog.NoImages");
                }
                return;
            }

            let processed = 0;
            let errors = [];

            for (const fileUrl of imageFiles) {
                try {
                    // Update progress
                    const percent = Math.round((processed / total) * 100);
                    const basename = fileUrl.split('/').pop() || fileUrl;

                    if (progressFill) {
                        progressFill.style.width = `${percent}%`;
                    }
                    if (progressText) {
                        progressText.textContent = `${percent}%`;
                    }
                    if (progressStatus) {
                        progressStatus.textContent = game.i18n.format("DynPog.ProcessingFile", {
                            name: basename,
                            current: processed,
                            total: total,
                        });
                    }

                    // Process the token
                    const result = await processToken(fileUrl, this._settings);

                    // Build output filename: prefix + original basename (strip original ext, add new)
                    const nameWithoutExt = basename.replace(/\.[^.]+$/, '');
                    const outputName = prefix + nameWithoutExt + ext;

                    // Create File object for upload
                    const file = new File([result.blob], outputName, { type: this._settings.format });

                    // Upload to destination folder.
                    // Foundry v13 signature: FilePicker.upload(source, path, file, body, options)
                    await FilePicker.upload("data", this._destPath, file, {});

                    processed++;
                } catch (err) {
                    const basename = fileUrl.split('/').pop() || fileUrl;
                    errors.push(`${basename}: ${err.message}`);
                    console.error(`[DynPog] Error processing ${basename}:`, err);
                    processed++;
                }
            }

            // Completion
            if (progressFill) {
                progressFill.style.width = "100%";
            }
            if (progressText) {
                progressText.textContent = "100%";
            }
            const doneCount = processed - errors.length;
            if (errors.length > 0) {
                if (progressStatus) {
                    progressStatus.textContent = game.i18n.format("DynPog.DoneWithErrors", {
                        count: doneCount,
                        errors: errors.length,
                    });
                }
                ui.notifications.warn(`${game.i18n.format("DynPog.DoneWithErrors", { count: doneCount, errors: errors.length })} — ${errors.length} files had errors. Check console.`);
            } else {
                if (progressStatus) {
                    progressStatus.textContent = game.i18n.format("DynPog.Done", { count: doneCount });
                }
                ui.notifications.info(game.i18n.format("DynPog.Done", { count: doneCount }));
            }
        } catch (err) {
            console.error("[DynPog] Batch processing failed:", err);
            if (progressStatus) {
                progressStatus.textContent = game.i18n.format("DynPog.BatchError", { message: err.message });
            }
            ui.notifications.error(game.i18n.format("DynPog.BatchError", { message: err.message }));
        } finally {
            this._isProcessing = false;
            this._checkProcessAllEnabled();
        }
    }

    /**
     * Draw a checkerboard pattern on the canvas to indicate transparency.
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} w  Canvas width
     * @param {number} h  Canvas height
     */
    _drawCheckerboard(ctx, w, h, offsetX = 0, offsetY = 0) {
        const sz = Math.max(8, Math.floor(Math.min(w, h) / 32));
        for (let y = 0; y < h; y += sz) {
            for (let x = 0; x < w; x += sz) {
                ctx.fillStyle = ((x / sz + y / sz) % 2 === 0) ? "#ffffff" : "#cccccc";
                ctx.fillRect(offsetX + x, offsetY + y, Math.min(sz, w - x), Math.min(sz, h - y));
            }
        }
    }

    /**
     * Load and cache the Dynamic Ring spritesheet from Foundry.
     * @returns {Promise<{bitmap: ImageBitmap, frames: Object}>}
     */
    async _ensureRingCache() {
        if (this._ringCache) return this._ringCache;

        this._ringCache = (async () => {
            const ringConfigId = game.settings.get("core", "dynamicTokenRing") || "coreSteel";
            const config = CONFIG.Token.ring.getConfig(ringConfigId);
            console.log("[DynPog] Ring config:", { ringConfigId, hasConfig: !!config, spritesheet: config?.spritesheet });
            if (!config?.spritesheet) throw new Error("No spritesheet configured");

            const jsonPath = "/" + config.spritesheet;
            const imgPath = jsonPath.replace(/\.json$/, ".webp");
            console.log("[DynPog] Loading ring spritesheet:", { jsonPath, imgPath });

            const [imgResp, jsonResp] = await Promise.all([
                fetch(imgPath),
                fetch(jsonPath)
            ]);
            console.log("[DynPog] Ring fetch results:", { imgOk: imgResp.ok, imgStatus: imgResp.status, jsonOk: jsonResp.ok, jsonStatus: jsonResp.status });
            if (!imgResp.ok) throw new Error(`Failed to load ring image: ${imgResp.status}`);
            if (!jsonResp.ok) throw new Error(`Failed to load ring data: ${jsonResp.status}`);

            const bitmap = await createImageBitmap(await imgResp.blob());
            const frames = (await jsonResp.json()).frames;
            console.log("[DynPog] Ring cached successfully, frame count:", Object.keys(frames).length);
            return { bitmap, frames };
        })();

        return this._ringCache;
    }

    /**
     * Load the source image, run the processing pipeline, and display results.
     * @param {string} filePath - URL or path to the source image
     */
    async _loadAndPreview(filePath) {
        const html = this.element;
        const beforeImg = html.querySelector("#dpog-before-img");
        const beforeName = html.querySelector("#dpog-before-name");
        const afterImg = html.querySelector("#dpog-after-img");
        const afterName = html.querySelector("#dpog-after-name");
        const exportRingBtn = html.querySelector("#dpog-export-ring");

        try {
            // Run processing pipeline
            const result = await processToken(filePath, this._settings);
            this._lastResult = result;
            this._lastSourceBasename = filePath.split('/').pop() || filePath;

            // --- Before panel: source scaled so non-transparent content matches the processed token size ---
            if (beforeImg) {
                if (beforeImg._objectUrl) URL.revokeObjectURL(beforeImg._objectUrl);

                const srcImg = await new Promise((resolve, reject) => {
                    const i = new Image();
                    i.onload = () => resolve(i);
                    i.onerror = reject;
                    i.src = filePath;
                });

                const contentBounds = result.stats.contentBounds || {
                    x: 0,
                    y: 0,
                    width: srcImg.naturalWidth,
                    height: srcImg.naturalHeight,
                };
                const scale = Math.max(result.afterData.width, result.afterData.height) / Math.max(contentBounds.width, contentBounds.height);
                const iw = Math.round(srcImg.naturalWidth * scale);
                const ih = Math.round(srcImg.naturalHeight * scale);
                const cw = result.afterData.canvasSize;
                const ch = result.afterData.canvasSize;
                const dx = Math.round((cw - iw) / 2);
                const dy = Math.round((ch - ih) / 2);

                const canvas = document.createElement("canvas");
                canvas.width = cw;
                canvas.height = ch;
                const ctx = canvas.getContext("2d");

                // 1. Checkerboard only inside the source image rectangle.
                // Areas outside the source canvas remain transparent/dark; they are not part of the image.
                this._drawCheckerboard(ctx, iw, ih, dx, dy);

                // 2. Draw source image so its non-transparent content matches the After token size.
                ctx.drawImage(srcImg, dx, dy, iw, ih);

                // 3. Light gray box around the source image canvas boundary.
                ctx.strokeStyle = "#888888";
                ctx.lineWidth = 1;
                ctx.strokeRect(dx + 0.5, dy + 0.5, iw - 1, ih - 1);

                const blob = await new Promise((resolve, reject) => {
                    canvas.toBlob(b => b ? resolve(b) : reject(new Error("toBlob null")), "image/png");
                });
                const url = URL.createObjectURL(blob);
                beforeImg._objectUrl = url;
                beforeImg.src = url;
            }
            if (beforeName) {
                beforeName.textContent = `${result.beforeData.width}\u00d7${result.beforeData.height}`;
            }

            // --- After panel: checkerboard → token → ring ---
            if (afterImg) {
                if (afterImg._objectUrl) URL.revokeObjectURL(afterImg._objectUrl);

                const cs = result.afterData.canvasSize;
                const canvas = document.createElement("canvas");
                canvas.width = cs;
                canvas.height = cs;
                const ctx = canvas.getContext("2d");

                // 1. Checkerboard
                this._drawCheckerboard(ctx, cs, cs);

                // 2. Token
                const tokenImg = await new Promise((resolve, reject) => {
                    const i = new Image();
                    i.onload = () => resolve(i);
                    i.onerror = reject;
                    i.src = URL.createObjectURL(result.blob);
                });
                ctx.drawImage(tokenImg, 0, 0);

                // 3. Ring (non-blocking — draw token first, then add ring)
                const ringPromise = this._ensureRingCache().then(cache => {
                    const sizes = [2048, 1024, 512, 256];
                    let fn = null;
                    for (const s of sizes) {
                        if (cs >= s) {
                            const map = { 2048: "token-ring-gargantuan", 1024: "token-ring-large-huge", 512: "token-ring-med", 256: "token-ring-tiny" };
                            fn = map[s];
                            break;
                        }
                    }
                    console.log("[DynPog] Ring frame lookup:", { canvasSize: cs, frameName: fn, hasFrame: !!(fn && cache.frames[fn]) });
                    if (!fn || !cache.frames[fn]) return null;
                    const f = cache.frames[fn].frame;
                    console.log("[DynPog] Ring frame rect:", f);
                    // Draw frame onto canvas sized to match the output canvas
                    const rc = document.createElement("canvas");
                    rc.width = cs;
                    rc.height = cs;
                    const rctx = rc.getContext("2d");
                    // The ring frame is extracted from the spritesheet, then scaled to fit cs
                    const scaleX = cs / f.w;
                    const scaleY = cs / f.h;
                    const scale = Math.min(scaleX, scaleY);
                    const dw = f.w * scale;
                    const dh = f.h * scale;
                    const dx = (cs - dw) / 2;
                    const dy = (cs - dh) / 2;
                    rctx.drawImage(cache.bitmap, f.x, f.y, f.w, f.h, dx, dy, dw, dh);
                    // Return as Image via blob URL (more reliable than createImageBitmap)
                    return new Promise((resolve, reject) => {
                        rc.toBlob(b => {
                            if (!b) { reject(new Error("toBlob null")); return; }
                            const img = new Image();
                            img.onload = () => resolve(img);
                            img.onerror = reject;
                            img.src = URL.createObjectURL(b);
                        }, "image/png");
                    });
                }).catch(e => { console.warn("[DynPog] Ring promise failed:", e); return null; });

                // Show token + checkerboard immediately
                const blob1 = await new Promise((resolve, reject) => {
                    canvas.toBlob(b => b ? resolve(b) : reject(new Error("toBlob null")), "image/png");
                });
                const url1 = URL.createObjectURL(blob1);
                afterImg._objectUrl = url1;
                afterImg.src = url1;

                // Then draw ring if available
                const ringFrame = await ringPromise;
                if (ringFrame) {
                    ctx.drawImage(ringFrame, 0, 0);
                    const blob2 = await new Promise((resolve, reject) => {
                        canvas.toBlob(b => b ? resolve(b) : reject(new Error("toBlob null")), "image/png");
                    });
                    URL.revokeObjectURL(url1);
                    const url2 = URL.createObjectURL(blob2);
                    afterImg._objectUrl = url2;
                    afterImg.src = url2;
                }
            }
            if (afterName) {
                const ad = result.afterData;
                const mode = result.stats.mode;
                afterName.textContent = `${ad.canvasSize}\u00d7${ad.canvasSize} (${ad.width}\u00d7${ad.height} ${mode})`;
            }

            // Enable export ring button
            if (exportRingBtn) {
                exportRingBtn.disabled = false;
            }

        } catch (err) {
            if (exportRingBtn) exportRingBtn.disabled = true;
            if (afterName) afterName.textContent = `Error: ${err.message}`;
            if (afterImg) afterImg.src = '';
            console.error("[DynPog] Preview error:", err);
        }
    }

    /**
     * Export the current preview with the ring drawn as a solid circle overlay.
     */
    async _exportWithRing() {
        if (!this._lastResult || !this._destPath) {
            ui.notifications.warn(game.i18n.localize("DynPog.NoImage"));
            return;
        }

        try {
            // Re-process to get the final canvas with ring drawn
            // We re-run processToken to get access to the final canvas
            const result = await processToken(this._previewPath, this._settings);

            // We need the finalCanvas. Since processToken returns a blob,
            // we need to draw the ring on a separate copy.
            // Load the original source image
            const { imageBitmap } = await loadImage(this._previewPath);

            // Figure out the after dimensions
            const afterData = result.afterData;
            const canvasSize = afterData.canvasSize;
            const ringDiameter = afterData.ringDiameter;

            // Create a canvas, draw the processed result, then overlay the ring
            const canvas = document.createElement('canvas');
            canvas.width = canvasSize;
            canvas.height = canvasSize;
            const ctx = canvas.getContext('2d');

            // Draw the processed blob onto the canvas
            const blobUrl = URL.createObjectURL(result.blob);
            const img = new Image();
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = blobUrl;
            });
            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(blobUrl);

            // Draw the ring as a solid circle
            const centerX = canvasSize / 2;
            const centerY = canvasSize / 2;
            const radius = ringDiameter / 2;

            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.lineWidth = Math.max(2, Math.round(ringDiameter * 0.01));
            ctx.stroke();

            // Export
            const blob = await new Promise((resolve, reject) => {
                canvas.toBlob(
                    (b) => {
                        if (b) resolve(b);
                        else reject(new Error('Canvas toBlob returned null'));
                    },
                    this._settings.format,
                    this._settings.quality,
                );
            });

            // Build filename
            const nameWithoutExt = (this._lastSourceBasename || 'token').replace(/\.[^.]+$/, '');
            const ext = this._settings.format === 'image/png' ? '.png' : '.webp';
            const outputName = 'ring_preview_' + nameWithoutExt + ext;

            // Upload. Foundry v13 signature: FilePicker.upload(source, path, file, body, options)
            const file = new File([blob], outputName, { type: this._settings.format });
            await FilePicker.upload("data", this._destPath, file, {});

            ui.notifications.info(`Ring preview exported: ${outputName}`);
        } catch (err) {
            console.error('[DynPog] Export with ring failed:', err);
            ui.notifications.error(`Export with ring failed: ${err.message}`);
        }
    }

    /**
     * Read current form values, update settings, and re-process.
     */
    _onSettingsChange() {
        const html = this.element;

        this._settings.trimPx = parseInt(html.querySelector("#dpog-trim")?.value) || 0;
        this._settings.maskEnabled = html.querySelector("#dpog-mask")?.checked || false;
        this._settings.mode = html.querySelector("input[name='quality'][value='optimized']")?.checked
            ? 'optimized'
            : 'quick';
        this._settings.maskThreshold = parseInt(html.querySelector("#dpog-threshold")?.value) || 128;
        this._settings.format = html.querySelector("input[name='exportFormat'][value='webp']")?.checked
            ? 'image/webp'
            : 'image/png';
        this._settings.ringOverride = html.querySelector("#dpog-ring-select")?.value || 'auto';

        // Re-process if a preview image is already loaded
        if (this._previewPath) {
            this._loadAndPreview(this._previewPath);
        }
    }

    /**
     * Debounced wrapper for _onSettingsChange (used for sliders/inputs).
     */
    _debouncedSettingsChange() {
        if (this._debounceTimer) {
            clearTimeout(this._debounceTimer);
        }
        this._debounceTimer = setTimeout(() => {
            this._onSettingsChange();
        }, 150);
    }
}

/**
 * Initialize the Dynamic Pog Tokens module.
 * Registers hooks and adds UI controls.
 */
export function initDynamicPogTokens() {
    // Register game settings for persistence
    game.settings.register('dynamic-pog-tokens', 'lastSettings', {
        scope: 'world',
        config: false,
        default: '{}',
        type: String,
    });

    // Register a scene control button to open the app
    Hooks.on("getSceneControlButtons", (controls) => {
        const tokenControls = controls.find(c => c.name === "token");
        if (tokenControls) {
            tokenControls.tools.push({
                name: "dynamicPogTokens",
                title: "DynPog.Title",
                icon: "fa-solid fa-circle-notch",
                visible: game.user.isGM,
                onClick: () => {
                    new PogTokensApp().render(true);
                },
            });
        }
    });

    // Add a button to the Actor Directory sidebar footer
    Hooks.on("renderActorDirectory", (app, html, data) => {
        const element = html[0] || html;
        const footer = element.querySelector(".directory-footer");
        if (!footer) return;

        // Prevent duplicates on re-render
        if (footer.querySelector(".dpog-dir-btn")) return;

        const button = document.createElement("button");
        button.type = "button";
        button.classList.add("dpog-dir-btn");
        button.innerHTML = `<i class="fa-solid fa-circle-notch"></i> ${game.i18n.localize("DynPog.ButtonLabel")}`;
        button.addEventListener("click", () => {
            new PogTokensApp().render(true);
        });
        footer.appendChild(button);
    });
}

export { PogTokensApp };
