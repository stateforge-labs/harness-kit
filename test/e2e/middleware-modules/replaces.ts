import type { Middleware } from "@homelab/harness-hooks";
// Does not call next(): the layers below (the built-in policy included) never run for this event.
const replaces: Middleware = () => ({ context: "REPLACED" });
export default replaces;
