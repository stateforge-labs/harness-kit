import type { Middleware } from "@homelab/harness-hooks";
const twice: Middleware = async (_ctx, next) => {
  await next();
  return next();
};
export default twice;
