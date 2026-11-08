import type { Middleware } from "@stateforge-labs/harness-hooks";
const hangs: Middleware = () => new Promise(() => {});
export default hangs;
