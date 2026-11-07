import type { Middleware } from "../../../src/core/pipeline.ts";
const twice: Middleware = async (_ctx, next) => {
  await next();
  return next();
};
export default twice;
