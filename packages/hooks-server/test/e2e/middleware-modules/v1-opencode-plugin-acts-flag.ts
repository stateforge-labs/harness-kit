import type { Middleware } from "@homelab/harness-hooks";
const v1FlagContinue: Middleware = async (ctx, next) =>
  ctx.raw.continueMe === true ? { continue: { reason: "V1-CONTINUE-REASON", missing: ["V1-MISSING-1", "V1-MISSING-2"] } } : next();
export default v1FlagContinue;
