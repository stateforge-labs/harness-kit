// Pre-tool events only: reports the neutral kind and the native tool name it can read from the payload.
import { mergeReplies, onKinds } from "../../../src/core/pipeline.ts";
export default onKinds(["pre-tool"], async (ctx, next) =>
  mergeReplies(await next(), { context: `harness=${ctx.event.harness} kind=${ctx.event.kind} native=${ctx.event.native} tool=${String(ctx.raw.tool_name ?? ctx.raw.tool)}` }));
