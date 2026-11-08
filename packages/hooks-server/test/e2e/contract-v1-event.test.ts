// Contract v1 neutral event (session and tool), read back through the real server: HOOK_MIDDLEWARE=v1-sees-tool puts the event as JSON
// into the reply fields the matrix gives a layer (deny on pre-tool, continue on stop, context on session-start), and the test parses it.
// The permission.evaluate case is in-process because OpenCode encodes nothing for that event, so only the decoded event shows its tool.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { adapters } from "@homelab/harness-hooks";
import { startServer, type RunningServer } from "./harness.ts";
import { fixture, variant } from "./kit.ts";

let srv: RunningServer;
beforeAll(async () => {
  srv = await startServer({ HOOK_MIDDLEWARE: join(import.meta.dir, "middleware-modules", "v1-sees-tool.ts") });
});
afterAll(() => srv?.stop());

type Body = Record<string, any>;
type Any = Record<string, any>;
async function post(harness: string, body: unknown): Promise<Body> {
  const res = await fetch(`${srv.base}/hook/${harness}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as Body;
}

/** The neutral event as the layer saw it: the JSON the middleware wrote, read back from a reply field. */
interface Seen {
  session: string | null;
  tool: { name: string; callId: string | null } | null;
}
const pick = (text: unknown): Seen => {
  const { session, tool } = JSON.parse(String(text)) as Seen;
  return { session, tool };
};

/** Expected tool from the payload that was sent: tool name and call id keys, null when a key is missing. */
const claudeLikeTool = (p: Any): Seen["tool"] =>
  typeof p.tool_name === "string" && p.tool_name !== "" ? { name: p.tool_name, callId: (p.tool_use_id as string | undefined) ?? null } : null;
const claudeLikeSession = (p: Any): string | null => (p.session_id as string | undefined) ?? null;

/** Claude and Codex PreToolUse: the deny reason is the layer's JSON. */
const preToolSeen = (b: Body) => pick(b.hookSpecificOutput?.permissionDecisionReason);

describe("e2e: contract v1 neutral event (claude)", () => {
  test("PreToolUse: session is session_id and tool is {name: tool_name, callId: tool_use_id}", async () => {
    const p: Any = variant(fixture("claude", "PreToolUse", "bash"));
    expect(preToolSeen(await post("claude", p))).toEqual({
      session: p.session_id,
      tool: { name: p.tool_name, callId: p.tool_use_id },
    });
  });

  test("PreToolUse without tool_use_id: callId is null", async () => {
    const p: Any = variant(fixture("claude", "PreToolUse", "bash"), { tool_use_id: undefined });
    expect(preToolSeen(await post("claude", p))).toEqual({ session: claudeLikeSession(p), tool: { name: p.tool_name, callId: null } });
  });

  test("PreToolUse without session_id: session is null", async () => {
    const p: Any = variant(fixture("claude", "PreToolUse", "bash"), { session_id: undefined });
    expect(preToolSeen(await post("claude", p))).toEqual({ session: null, tool: claudeLikeTool(p) });
  });

  test("PreToolUse without tool_name: tool is null", async () => {
    const p: Any = variant(fixture("claude", "PreToolUse", "bash"), { tool_name: undefined });
    expect(preToolSeen(await post("claude", p))).toEqual({ session: p.session_id, tool: null });
  });

  test("Stop: session is session_id and tool is null (the block reason carries the JSON)", async () => {
    const p: Any = variant(fixture("claude", "Stop"));
    const body = await post("claude", p);
    expect(body.decision).toBe("block");
    expect(pick(body.reason)).toEqual({ session: p.session_id, tool: null });
  });

  test("SessionStart: session is session_id and tool is null (additionalContext carries the JSON)", async () => {
    const p: Any = variant(fixture("claude", "SessionStart"));
    const body = await post("claude", p);
    expect(pick(body.hookSpecificOutput?.additionalContext)).toEqual({ session: p.session_id, tool: null });
  });
});

describe("e2e: contract v1 neutral event (codex)", () => {
  test("PreToolUse: session is session_id and tool is {name: tool_name, callId: tool_use_id}", async () => {
    const p: Any = variant(fixture("codex", "PreToolUse", "bash"));
    expect(preToolSeen(await post("codex", p))).toEqual({
      session: p.session_id,
      tool: { name: p.tool_name, callId: p.tool_use_id },
    });
  });

  test("PreToolUse without tool_use_id: callId is null", async () => {
    const p: Any = variant(fixture("codex", "PreToolUse", "bash"), { tool_use_id: undefined });
    expect(preToolSeen(await post("codex", p))).toEqual({ session: p.session_id, tool: { name: p.tool_name, callId: null } });
  });

  test("PreToolUse without session_id: session is null", async () => {
    const p: Any = variant(fixture("codex", "PreToolUse", "bash"), { session_id: undefined });
    expect(preToolSeen(await post("codex", p))).toEqual({ session: null, tool: claudeLikeTool(p) });
  });

  test("PreToolUse without tool_name: tool is null", async () => {
    const p: Any = variant(fixture("codex", "PreToolUse", "bash"), { tool_name: undefined });
    expect(preToolSeen(await post("codex", p))).toEqual({ session: p.session_id, tool: null });
  });

  test("Stop: session is session_id and tool is null", async () => {
    const p: Any = variant(fixture("codex", "Stop"));
    const body = await post("codex", p);
    expect(body.decision).toBe("block");
    expect(pick(body.reason)).toEqual({ session: p.session_id, tool: null });
  });

  test("SessionStart: session is session_id and tool is null (additionalContext carries the JSON)", async () => {
    const p: Any = variant(fixture("codex", "SessionStart"));
    const body = await post("codex", p);
    expect(pick(body.hookSpecificOutput?.additionalContext)).toEqual({ session: p.session_id, tool: null });
  });
});

describe("e2e: contract v1 neutral event (opencode)", () => {
  // OpenCode's session id is `sessionID` (the plugin also sends `session_id`); the test sets both to one fresh value.
  const freshIds = () => {
    const sid = `t-${crypto.randomUUID()}`;
    return { sid, callId: `c-${crypto.randomUUID()}` };
  };
  const denySeen = (b: Body) => pick(b.deny);

  test("tool.execute.before: session is sessionID and tool is {name: tool, callId: id}", async () => {
    const { sid, callId } = freshIds();
    const p: Any = variant(fixture("opencode", "tool.execute.before", "shell"), { sessionID: sid, id: callId }, sid);
    expect(denySeen(await post("opencode", p))).toEqual({
      session: p.sessionID,
      tool: { name: p.tool, callId: p.id },
    });
  });

  test("tool.execute.before without id: callId is null", async () => {
    const { sid } = freshIds();
    const p: Any = variant(fixture("opencode", "tool.execute.before", "shell"), { sessionID: sid, id: undefined }, sid);
    expect(denySeen(await post("opencode", p))).toEqual({ session: sid, tool: { name: p.tool, callId: null } });
  });

  test("tool.execute.before without sessionID and session_id: session is null", async () => {
    const { sid } = freshIds();
    const p: Any = variant(fixture("opencode", "tool.execute.before", "shell"), { sessionID: undefined, session_id: undefined }, sid);
    expect(denySeen(await post("opencode", p))).toEqual({ session: null, tool: { name: p.tool, callId: p.id } });
  });

  test("tool.execute.before without tool: tool is null", async () => {
    const { sid } = freshIds();
    const p: Any = variant(fixture("opencode", "tool.execute.before", "shell"), { sessionID: sid, tool: undefined }, sid);
    expect(denySeen(await post("opencode", p))).toEqual({ session: sid, tool: null });
  });

  test("session.experimental.idle: session is sessionID and tool is null (the continue text carries the JSON)", async () => {
    const { sid } = freshIds();
    const p: Any = variant(fixture("opencode", "session.experimental.idle"), { sessionID: sid }, sid);
    const body = await post("opencode", p);
    expect(pick(body.continue)).toEqual({ session: p.sessionID as string, tool: null });
  });
});

describe("contract v1 neutral event: opencode permission.evaluate (in-process)", () => {
  // In-process: OpenCode encodes nothing for permission.evaluate in v1, so the answer cannot show the decoded tool.
  // The decode is what maps `action` to tool.name and `source.id` to tool.callId.
  const base = () => fixture("opencode", "permission.evaluate", "shell").payload;

  test("tool name comes from action and callId from source.id", () => {
    const sid = `t-${crypto.randomUUID()}`;
    const callId = `c-${crypto.randomUUID()}`;
    const raw = { ...base(), sessionID: sid, session_id: sid, action: "probe_echo", source: { ...(base().source as object), id: callId } };
    const { event } = adapters.get("opencode")!.decode(raw);
    expect(event?.session).toBe(sid);
    expect(event?.tool).toEqual({ name: "probe_echo", callId });
  });

  test("without action the event names no tool", () => {
    const sid = `t-${crypto.randomUUID()}`;
    const raw = { ...base(), sessionID: sid, session_id: sid, action: undefined };
    const { event } = adapters.get("opencode")!.decode(raw);
    expect(event?.session).toBe(sid);
    expect(event?.tool).toBeUndefined();
  });
});
