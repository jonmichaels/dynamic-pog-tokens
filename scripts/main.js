import { initDynamicPogTokens } from "./app/pog-tokens-app.js";
import "../scss/module.scss";

Hooks.once("init", async () => {
    await initDynamicPogTokens();
});
