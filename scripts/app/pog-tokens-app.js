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
    };

    /** @type {string|null} Current source file path */
    _sourcePath = null;

    /** @type {number|null} Debounce timer ID */
    _debounceTimer = null;

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
        ui.notifications.info("Processing tokens...");
    }

    /** @override */
    async _prepareContext(options) {
        return {
            modulePath: MODULE_PATH,
        };
    }

    /** @override */
    _onRender(context, options) {
        super._onRender(context, options);
        this.#bindEvents();
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
            },
        }).browse();
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

        try {
            // Show source image in the Before panel
            if (beforeImg) {
                beforeImg.src = filePath;
            }

            // Run processing pipeline
            const result = await processToken(filePath, this._settings);

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

            // Display size info
            if (afterName) {
                afterName.textContent = `${result.afterData.width}\u00d7${result.afterData.height} (${result.afterData.targetRing})`;
            }
        } catch (err) {
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
