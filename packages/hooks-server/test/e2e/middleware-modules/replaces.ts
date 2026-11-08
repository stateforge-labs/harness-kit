import type { Middleware } from "@homelab/harness-hooks";
const replaces: Middleware = () => ({ context: "REPLACED" });
export default replaces;
