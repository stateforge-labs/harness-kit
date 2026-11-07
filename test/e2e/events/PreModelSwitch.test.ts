import { afterAll, beforeAll, describe, expect, test } from "bun:test";
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

const readLog = async () => {
  const f = Bun.file(srv.logFile);
  return (await f.exists()) ? await f.text() : "";
};

const logLineFor = (sessionId: string) =>
  eventually(async () => (await readLog()).split("\n").find((l) => l.includes(`"session_id":"${sessionId}"`)));

const common = (sessionId: string) => ({
  session_id: sessionId,
  transcript_path: "/home/user/.claude/projects/x/transcript.jsonl",
  cwd: "/home/user/project",
  hook_event_name: "PreModelSwitch",
});

const required = {
  from_model: "claude-sonnet-5",
  to_model: "claude-opus-5",
  requested_model: "opus",
  source: "command",
  context_tokens: 182340,
  prompt_cache_warm: true,
  cache_ttl: "5m",
  estimated_cache_write_usd: 1.1396,
  pricing: "catalog",
};

describe("e2e: PreModelSwitch", () => {
  test("a realistic payload is answered with an empty passive response", async () => {
    const res = await post({ ...common("pms1"), ...required });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  test("the log line records known, no missing keys and the meta fields, never payload text", async () => {
    await post({ ...common("pms2"), ...required, prompt: "PMS-SECRET-PROMPT", tool_input: { command: "PMS-SECRET-CMD" } });
    const line = await logLineFor("pms2");
    const entry = JSON.parse(line!);
    expect(entry.event).toBe("PreModelSwitch");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.source).toBe("command");
    expect(entry.from_model).toBe("claude-sonnet-5");
    expect(entry.to_model).toBe("claude-opus-5");
    expect(entry.requested_model).toBe("opus");
    expect(entry.prompt_cache_warm).toBe(true);
    expect(entry.pricing).toBe("catalog");
    expect(line).not.toContain("PMS-SECRET-PROMPT");
    expect(line).not.toContain("PMS-SECRET-CMD");
  });

  test("a payload missing a required key is still answered 200 and logged with that key in missing", async () => {
    const { pricing: _omit, ...withoutPricing } = required;
    const res = await post({ ...common("pms3"), ...withoutPricing });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const entry = JSON.parse((await logLineFor("pms3"))!);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual(["pricing"]);
  });

  test("never blocks, denies, asks or adds context, even for an expensive switch", async () => {
    const res = await post({
      ...common("pms4"),
      ...required,
      requested_model: null,
      source: "sdk",
      context_tokens: 900000,
      estimated_cache_write_usd: 18.5,
    });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({});
    expect(body.decision).toBeUndefined();
    expect(body.hookSpecificOutput).toBeUndefined();
  });
});
