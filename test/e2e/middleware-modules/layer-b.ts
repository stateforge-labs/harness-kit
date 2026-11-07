import { mergeReplies, type Middleware } from "@homelab/harness-hooks";
const layerB: Middleware = async (_ctx, next) => mergeReplies(await next(), { context: "B" });
export default layerB;
