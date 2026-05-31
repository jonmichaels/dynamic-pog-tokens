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

        // Select images button
        const selectBtn = html.querySelector("#dpog-select-images");
        if (selectBtn) {
            selectBtn.addEventListener("click", async (ev) => {
                ev.preventDefault();
                // FilePicker integration — Phase 2+
                ui.notifications.info("Select pog-style token images to process.");
            });
        }

        // Process button
        const processBtn = html.querySelector("#dpog-process-btn");
        if (processBtn) {
            processBtn.addEventListener("click", async (ev) => {
                ev.preventDefault();
                await PogTokensApp.#onSubmit(ev, html, {});
            });
        }

        // Mask checkbox — toggle threshold slider visibility
        const maskCheck = html.querySelector("#dpog-mask");
        if (maskCheck) {
            const thresholdRow = html.querySelector(".dpog-threshold-row");
            maskCheck.addEventListener("change", () => {
                if (thresholdRow) {
                    thresholdRow.classList.toggle("dpog-hidden", !maskCheck.checked);
                }
            });
        }
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
