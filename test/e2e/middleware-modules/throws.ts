import type { Middleware } from "../../../src/core/pipeline.ts";
const throws: Middleware = () => {
  throw new Error("boom from a middleware");
};
export default throws;
