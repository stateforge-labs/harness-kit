import type { Middleware } from "@stateforge-labs/harness-hooks";
const twice: Middleware = async (_ctx, next) => {
  await next();
  return next();
};
export default twice;
