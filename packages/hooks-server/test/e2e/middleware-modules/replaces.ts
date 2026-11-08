import type { Middleware } from "@stateforge-labs/harness-hooks";
const replaces: Middleware = () => ({ context: "REPLACED" });
export default replaces;
