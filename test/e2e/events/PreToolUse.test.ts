import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { eventually, startServer, type RunningServer } from "../harness.ts";

let srv: RunningServer;

beforeAll(async () => {
  srv = await startServer();
});
afterAll(() => srv.stop());

const post = (body: unknown) =>
  fetch(`${srv.base}/hook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const logLineFor = (sessionId: string) =>
  eventually(async () => {
    const f = Bun.file(srv.logFile);
    const text = (await f.exists()) ? await f.text() : "";
    return text.split("\n").find((l) => l.includes(`"session_id":"${sessionId}"`));
  });

const common = (sessionId: string) => ({
  session_id: sessionId,
  transcript_path: "/home/user/.claude/projects/x/transcript.jsonl",
  cwd: "/home/user/project",
  hook_event_name: "PreToolUse",
  permission_mode: "default",
});

const ADVICE_NO_FORMAT =
  "Advisory: this Agent brief sets no return format or word limit, so ask for a short structured result.";
const ADVICE_MODEL =
  "Advisory: this Agent call sets a non-Haiku model, so confirm that the cost is intended.";

const agentCall = (sessionId: string, input: Record<string, unknown>) => ({
  ...common(sessionId),
  tool_name: "Agent",
  tool_input: { description: "Find API endpoints", subagent_type: "Explore", ...input },
  tool_use_id: `toolu_${sessionId}`,
});

describe("e2e: PreToolUse", () => {
  test("a realistic Agent call with no return format gets exactly the no-format advisory", async () => {
    const res = await post(
      agentCall("pre1", { prompt: "PRETOOL-SECRET-PROMPT: find all endpoints in the repo" }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({
      hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: ADVICE_NO_FORMAT },
    });
  });

  test("the log line is known, has no missing keys, records meta, and no payload text", async () => {
    await post({
      ...agentCall("pre2", {
        prompt: "PRETOOL-SECRET-PROMPT: find all endpoints",
        model: "sonnet",
      }),
    });
    const line = await logLineFor("pre2");
    const entry = JSON.parse(line!);
    expect(entry.event).toBe("PreToolUse");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.tool_name).toBe("Agent");
    expect(entry.permission_mode).toBe("default");
    expect(entry.subagent_type).toBe("Explore");
    expect(entry.model).toBe("sonnet");
    expect(entry.advised).toBe(true);
    expect(line).not.toContain("PRETOOL-SECRET-PROMPT");
    expect(line).not.toContain("Find API endpoints");
  });

  test("a payload missing tool_use_id is still answered 200 and logged with it in missing", async () => {
    const { tool_use_id: _omit, ...rest } = agentCall("pre3", { prompt: "Return a short list." });
    const res = await post(rest);
    expect(res.status).toBe(200);
    const entry = JSON.parse((await logLineFor("pre3"))!);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual(["tool_use_id"]);
  });

  test("an Agent brief with a return format and no model override gets {}", async () => {
    const res = await post(agentCall("pre4", { prompt: "Find endpoints. Return a list under 100 words." }));
    expect(await res.json()).toEqual({});
  });

  test("an Agent brief with a return format but a non-Haiku model gets the model advisory", async () => {
    const res = await post(
      agentCall("pre5", { prompt: "Find endpoints. Return a list.", model: "opus" }),
    );
    const body = (await res.json()) as any;
    expect(body.hookSpecificOutput.additionalContext).toBe(ADVICE_MODEL);
  });

  test("an Agent brief with a return format and model haiku gets {}", async () => {
    const res = await post(
      agentCall("pre6", { prompt: "Find endpoints. Return a list.", model: "haiku" }),
    );
    expect(await res.json()).toEqual({});
  });

  test("a payload captured from real claude is answered {} and logged known with no missing keys", async () => {
    const captured = Bun.file(
      join(
        import.meta.dir,
        "../../../docs/research/studies/2026-11-07-claude-code-hook-surface/evidence/captures/PreToolUse-1/events.jsonl",
      ),
    );
    const first = JSON.parse((await captured.text()).split("\n")[0]!) as {
      ts: string;
      payload: Record<string, unknown>;
    };
    const res = await post(first.payload);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const entry = JSON.parse((await logLineFor(first.payload.session_id as string))!);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.tool_name).toBe("Bash");
  });

  test("non-Agent tools get {} and never a permission or block field", async () => {
    const res = await post({
      ...common("pre7"),
      tool_name: "Bash",
      tool_input: { command: "PRETOOL-SECRET-CMD ls" },
      tool_use_id: "toolu_pre7",
    });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({});
    expect(body.permissionDecision).toBeUndefined();
    expect(body.decision).toBeUndefined();
    expect(body.continue).toBeUndefined();
  });
});
