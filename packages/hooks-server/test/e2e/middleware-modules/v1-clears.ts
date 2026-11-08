import type { Middleware } from "@homelab/harness-hooks";
const v1Clears: Middleware = async (_ctx, next) => {
  await next();
  return { context: "V1-CLEARED" };
};
export default v1Clears;
