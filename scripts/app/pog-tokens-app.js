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
            height: 520,
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

    /** @type {string|null} Current source file path */
    _sourcePath = null;

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
                this._applySettingsToUI();
            }
        } catch (e) {
            console.warn('[DynPog] Failed to restore settings:', e);
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
                if (this._sourcePath) {
                    await this._loadAndPreview(this._sourcePath);
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
     * Open Foundry's FilePicker to browse for a source image.
     */
    _onBrowseSource() {
        new FilePicker({
            type: 'image',
            callback: (filePath) => {
                this._sourcePath = filePath;
                this._loadAndPreview(filePath);
                this._checkProcessAllEnabled();
            },
        }).browse();
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
            btn.disabled = !(this._sourcePath && this._destPath && !this._isProcessing);
        }
    }

    /**
     * Batch-process all images in the source directory, save to destination.
     */
    async _processAll() {
        if (this._isProcessing || !this._sourcePath || !this._destPath) {
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

            // Scan source directory for image files
            const browseResult = await FilePicker.browse(this._sourcePath);
            const imageExtensions = ['.png', '.webp', '.jpg', '.jpeg'];
            const imageFiles = browseResult.files.filter(f => {
                const lower = f.toLowerCase();
                return imageExtensions.some(ext => lower.endsWith(ext));
            });

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

                    // Upload to destination folder
                    await FilePicker.upload(this._destPath, null, file, {});

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
     * Load the source image, run the processing pipeline, and display results.
     * @param {string} filePath - URL or path to the source image
     */
    async _loadAndPreview(filePath) {
        const html = this.element;
        const beforeImg = html.querySelector("#dpog-before-img");
        const afterImg = html.querySelector("#dpog-after-img");
        const afterName = html.querySelector("#dpog-after-name");
        const ringOverlay = html.querySelector("#dpog-ring-overlay");
        const exportRingBtn = html.querySelector("#dpog-export-ring");

        try {
            // Show source image in the Before panel
            if (beforeImg) {
                beforeImg.src = filePath;
            }

            // Run processing pipeline
            const result = await processToken(filePath, this._settings);

            // Store result for ring export
            this._lastResult = result;
            const basename = filePath.split('/').pop() || filePath;
            this._lastSourceBasename = basename;

            // Show processed result in the After panel via object URL
            if (afterImg) {
                // Revoke previous object URL to avoid memory leaks
                if (afterImg._objectUrl) {
                    URL.revokeObjectURL(afterImg._objectUrl);
                }
                const url = URL.createObjectURL(result.blob);
                afterImg._objectUrl = url;
                afterImg.src = url;
            }

            // Update ring overlay
            if (ringOverlay) {
                const ratio = result.afterData.ringDiameter / result.afterData.canvasSize;
                const pct = Math.round(ratio * 100);
                ringOverlay.style.width = `${pct}%`;
                ringOverlay.style.height = `${pct}%`;
                ringOverlay.classList.add("dpog-ring-visible");
            }

            // Enable export ring button
            if (exportRingBtn) {
                exportRingBtn.disabled = false;
            }

            // Display size info
            if (afterName) {
                const ringLabel = result.afterData.targetRing;
                const modeLabel = result.stats.mode === 'override' ? ' [override]' : '';
                afterName.textContent = `${result.afterData.width}\u00d7${result.afterData.height} (${ringLabel}${modeLabel})`;
            }
        } catch (err) {
            // Hide ring overlay on error
            if (ringOverlay) {
                ringOverlay.classList.remove("dpog-ring-visible");
            }
            // Disable export ring button
            if (exportRingBtn) {
                exportRingBtn.disabled = true;
            }
            // Display error in the After panel
            if (afterName) {
                afterName.textContent = `Error: ${err.message}`;
            }
            if (afterImg) {
                afterImg.src = '';
            }
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
            const result = await processToken(this._sourcePath, this._settings);

            // We need the finalCanvas. Since processToken returns a blob,
            // we need to draw the ring on a separate copy.
            // Load the original source image
            const { imageBitmap } = await loadImage(this._sourcePath);

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

            // Upload
            const file = new File([blob], outputName, { type: this._settings.format });
            await FilePicker.upload(this._destPath, null, file, {});

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

        // Re-process if a source is already loaded
        if (this._sourcePath) {
            this._loadAndPreview(this._sourcePath);
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
        }, 300);
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
}

export { PogTokensApp };
