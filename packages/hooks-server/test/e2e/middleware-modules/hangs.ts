import type { Middleware } from "@homelab/harness-hooks";
const hangs: Middleware = () => new Promise(() => {});
export default hangs;
