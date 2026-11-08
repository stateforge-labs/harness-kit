import type { Middleware } from "@stateforge-labs/harness-hooks";
const v1SeesTool: Middleware = async (ctx) => ({
  context: JSON.stringify({ kind: ctx.event.kind, session: ctx.event.session, tool: ctx.event.tool ?? null }),
  continue: { reason: JSON.stringify({ kind: ctx.event.kind, session: ctx.event.session, tool: ctx.event.tool ?? null }) },
  deny: ctx.event.kind === "pre-tool" ? { reason: JSON.stringify({ kind: ctx.event.kind, session: ctx.event.session, tool: ctx.event.tool ?? null }) } : undefined,
});
export default v1SeesTool;
