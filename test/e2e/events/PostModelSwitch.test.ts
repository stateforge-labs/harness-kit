import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eventually, startServer, type RunningServer } from "../harness.ts";

let srv: RunningServer;

// A real headless claude run (`/model opus`) captured by scripts/capture.sh. Path is relative to this file: test/e2e/events.
const capturePath = resolve(
  import.meta.dir,
  "../../..",
  "docs/research/studies/2026-11-07-claude-code-hook-surface/evidence/captures/PostModelSwitch-5/events.jsonl",
);

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

const common = (sessionId: string) => ({
  session_id: sessionId,
  transcript_path: "/home/user/.claude/projects/x/transcript.jsonl",
  cwd: "/home/user/project",
  hook_event_name: "PostModelSwitch",
});

const required = {
  from_model: "claude-sonnet-5",
  to_model: "claude-opus-5",
  requested_model: "claude-opus-5",
  source: "command",
  context_tokens: 0,
  prompt_cache_warm: false,
  cache_ttl: "1h",
  estimated_cache_write_usd: 0,
  pricing: "catalog",
};

const logLineFor = (sessionId: string) =>
  eventually(async () => {
    const text = await Bun.file(srv.logFile).text().catch(() => "");
    return text.split("\n").find((l) => l.includes(`"session_id":"${sessionId}"`));
  });

describe("e2e: PostModelSwitch", () => {
  test("a realistic payload is answered with an empty passive response", async () => {
    const res = await post({ ...common("pms1"), ...required });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  test("the log line records known, no missing keys and the model meta, never payload text", async () => {
    await post({ ...common("pms2"), ...required, requested_model: null, source: "auto", pricing: "PMS-SECRET-PRICING" });
    const line = await logLineFor("pms2");
    const entry = JSON.parse(line!);
    expect(entry.event).toBe("PostModelSwitch");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.source).toBe("auto");
    expect(entry.from_model).toBe("claude-sonnet-5");
    expect(entry.to_model).toBe("claude-opus-5");
    expect(entry.requested_model).toBeNull();
    expect(JSON.stringify(entry)).not.toContain("PMS-SECRET-PRICING");
  });

  test("a payload missing a required key is still answered 200 and logged with it in missing", async () => {
    const { source: _omit, ...withoutSource } = required;
    const res = await post({ ...common("pms3"), ...withoutSource });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const entry = JSON.parse((await logLineFor("pms3"))!);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual(["source"]);
  });

  test("stays passive for every source: no context injected, no blocking", async () => {
    for (const source of ["command", "picker", "sdk", "auto", "resume"]) {
      const res = await post({ ...common(`pms-${source}`), ...required, source });
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toEqual({});
      expect(body.hookSpecificOutput).toBeUndefined();
      expect(body.continue).toBeUndefined();
    }
  });

  test("replays the first captured payload from a real claude /model opus run", async () => {
    const firstLine = (await Bun.file(capturePath).text()).split("\n").find((l) => l.trim() !== "");
    const { payload } = JSON.parse(firstLine!) as { ts: string; payload: Record<string, unknown> };
    expect(payload.hook_event_name).toBe("PostModelSwitch");

    const res = await post(payload);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});

    const entry = JSON.parse((await logLineFor(payload.session_id as string))!);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.source).toBe("command");
    expect(entry.to_model).toBe("claude-opus-5-5");
  });
});
