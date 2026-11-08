import type { Middleware } from "@stateforge-labs/harness-hooks";
const v1Clears: Middleware = async (_ctx, next) => {
  await next();
  return { context: "V1-CLEARED" };
};
export default v1Clears;
