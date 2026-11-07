import type { Middleware } from "@homelab/harness-hooks";
const throws: Middleware = () => {
  throw new Error("boom from a middleware");
};
export default throws;
