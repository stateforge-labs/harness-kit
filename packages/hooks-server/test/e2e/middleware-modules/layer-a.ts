import { mergeReplies, type Middleware } from "@stateforge-labs/harness-hooks";
const layerA: Middleware = async (_ctx, next) => mergeReplies(await next(), { context: "A" });
export default layerA;
