import { mergeReplies, type Middleware } from "../../../src/core/pipeline.ts";
const layerA: Middleware = async (_ctx, next) => mergeReplies(await next(), { context: "A" });
export default layerA;
