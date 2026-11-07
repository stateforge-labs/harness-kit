import { mergeReplies, type Middleware } from "../../../src/core/pipeline.ts";
const layerB: Middleware = async (_ctx, next) => mergeReplies(await next(), { context: "B" });
export default layerB;
