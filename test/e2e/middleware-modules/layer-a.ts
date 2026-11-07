import { mergeReplies, type Middleware } from "@homelab/harness-hooks";
const layerA: Middleware = async (_ctx, next) => mergeReplies(await next(), { context: "A" });
export default layerA;
