import { mergeReplies, type Middleware } from "@stateforge-labs/harness-hooks";
const layerB: Middleware = async (_ctx, next) => mergeReplies(await next(), { context: "B" });
export default layerB;
