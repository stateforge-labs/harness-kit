// Contract v1: calls next() and answers only its own context, dropping everything below. A deny from below must still win.
import type { Middleware } from "@homelab/harness-hooks";
const v1Clears: Middleware = async (_ctx, next) => {
  await next();
  return { context: "V1-CLEARED" };
};
export default v1Clears;
