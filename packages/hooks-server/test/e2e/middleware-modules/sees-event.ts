import { mergeReplies, onKinds } from "@homelab/harness-hooks";
export default onKinds(["pre-tool"], async (ctx, next) =>
  mergeReplies(await next(), { context: `harness=${ctx.event.harness} kind=${ctx.event.kind} native=${ctx.event.native} tool=${String(ctx.raw.tool_name ?? ctx.raw.tool)}` }));
