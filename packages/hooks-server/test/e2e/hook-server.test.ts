import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eventually, startServer, type RunningServer } from "./harness.ts";
import { EnvVar } from "@homelab/harness-hooks";

const TOKEN = "t0k3n";
let srv: RunningServer;

beforeAll(async () => {
  srv = await startServer({ [EnvVar.HookToken]: TOKEN });
});
afterAll(() => srv.stop());

const post = (body: unknown, token: string | null = TOKEN) =>
  fetch(`${srv.base}/hook`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const readLog = async () => {
  const f = Bun.file(srv.logFile);
  return (await f.exists()) ? await f.text() : "";
};

describe("e2e: POST /hook", () => {
  test("SessionStart returns the delegation rules", async () => {
    const res = await post({ hook_event_name: "SessionStart", session_id: "s1" });
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(json.hookSpecificOutput.additionalContext).toStartWith("Delegation rules");
  });

  test("SubagentStart returns the subagent rules", async () => {
    const json = (await (await post({ hook_event_name: "SubagentStart", agent_type: "general-purpose" })).json()) as any;
    expect(json.hookSpecificOutput.additionalContext).toStartWith("Subagent rules");
  });

  test("events without a handler get an empty success object", async () => {
    expect(await (await post({ hook_event_name: "PreToolUse", tool_name: "Bash" })).json()).toEqual({});
  });

  test("an event named like an Object prototype key is not a handler", async () => {
    expect(await (await post({ hook_event_name: "constructor" })).json()).toEqual({});
  });

  test("rejects a missing or wrong token", async () => {
    expect((await post({}, null)).status).toBe(401);
    expect((await post({}, "nope")).status).toBe(401);
  });

  test("rejects bodies that are not a JSON object", async () => {
    expect((await post("{not json")).status).toBe(400);
    expect((await post([1, 2])).status).toBe(400);
  });

  test("the log keeps metadata and never the prompt text", async () => {
    await post({ hook_event_name: "SessionStart", session_id: "s2", prompt: "TOP-SECRET-PROMPT" });
    const log = await eventually(async () => {
      const t = await readLog();
      return t.includes('"session_id":"s2"') ? t : undefined;
    });
    expect(log).not.toContain("TOP-SECRET-PROMPT");
  });
});

describe("e2e: other routes", () => {
  test("healthz is open, unknown paths 404, GET /hook is 405", async () => {
    expect(await (await fetch(`${srv.base}/healthz`)).text()).toBe("ok");
    expect((await fetch(`${srv.base}/nope`)).status).toBe(404);
    expect((await fetch(`${srv.base}/hook`)).status).toBe(405);
  });
});

describe("e2e: configuration", () => {
  test(`${EnvVar.HookLogPayload}=1 keeps the full payload in the log`, async () => {
    const full = await startServer({ [EnvVar.HookToken]: TOKEN, [EnvVar.HookLogPayload]: "1" });
    try {
      await fetch(`${full.base}/hook`, {
        method: "POST",
        headers: { authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({ hook_event_name: "UserPromptSubmit", session_id: "s3", prompt: "VISIBLE-PROMPT" }),
      });
      const log = await eventually(async () => {
        const f = Bun.file(full.logFile);
        const t = (await f.exists()) ? await f.text() : "";
        return t.includes("s3") ? t : undefined;
      });
      expect(log).toContain("VISIBLE-PROMPT");
    } finally {
      await full.stop();
    }
  });

  test("an empty token runs without auth (dev only): no Authorization header is needed, a JSON content type is", async () => {
    const open = await startServer({ [EnvVar.HookToken]: "" });
    try {
      const res = await fetch(`${open.base}/hook`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hook_event_name: "SessionStart" }),
      });
      expect(res.status).toBe(200);
    } finally {
      await open.stop();
    }
  });
});
