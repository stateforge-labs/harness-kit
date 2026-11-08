import type { Middleware } from "@stateforge-labs/harness-hooks";
const throws: Middleware = () => {
  throw new Error("boom from a middleware");
};
export default throws;
