import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { eventually, startServer, type RunningServer } from "../harness.ts";

let srv: RunningServer;

beforeAll(async () => {
  srv = await startServer();
});
afterAll(() => srv.stop());

const CAPTURES = join(import.meta.dir, "../../../docs/research/studies/2026-11-07-claude-code-hook-surface/evidence/captures");

/** First payload of a real capture: the exact JSON Claude Code POSTed to the capture server. */
async function capturedPayload(name: string): Promise<Record<string, unknown>> {
  const firstLine = (await Bun.file(join(CAPTURES, name, "events.jsonl")).text()).split("\n")[0]!;
  return (JSON.parse(firstLine) as { payload: Record<string, unknown> }).payload;
}

const post = (body: unknown) =>
  fetch(`${srv.base}/hook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const logLineFor = (sessionId: string) =>
  eventually(async () => {
    const text = await Bun.file(srv.logFile).text().catch(() => "");
    return text.split("\n").find((l) => l.includes(`"session_id":"${sessionId}"`));
  });

describe("e2e: UserPromptExpansion (real captured payloads)", () => {
  test("UserPromptExpansion-2 (projectSettings, empty command_args) is answered with an empty passive response", async () => {
    const payload = await capturedPayload("UserPromptExpansion-2");
    expect(payload.command_source).toBe("projectSettings");
    const res = await post(payload);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  test("UserPromptExpansion-2 is logged as known with no missing keys and the expansion meta", async () => {
    const payload = await capturedPayload("UserPromptExpansion-2");
    const entry = JSON.parse((await logLineFor(String(payload.session_id)))!);
    expect(entry.event).toBe("UserPromptExpansion");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.expansion_type).toBe("slash_command");
    expect(entry.command_name).toBe("greet");
    expect(entry.command_source).toBe("projectSettings");
  });

  test("UserPromptExpansion-7 (command_source plugin, args 'hello there') is answered 200 with {} and logged as plugin", async () => {
    const payload = await capturedPayload("UserPromptExpansion-7");
    expect(payload.command_source).toBe("plugin");
    const res = await post(payload);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const entry = JSON.parse((await logLineFor(String(payload.session_id)))!);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.command_name).toBe("upe-probe:cmd");
    expect(entry.command_source).toBe("plugin");
  });

  test("the log line never carries prompt or command_args text", async () => {
    const payload = await capturedPayload("UserPromptExpansion-7");
    const line = await logLineFor(String(payload.session_id));
    expect(line).not.toContain("hello there");
    expect(line).not.toContain("/upe-probe:cmd hello there");
  });

  test("a real payload with command_args removed is still answered 200 and logged with it in missing", async () => {
    const { command_args: _omit, ...withoutArgs } = await capturedPayload("UserPromptExpansion-2");
    const sessionId = `${withoutArgs.session_id}-noargs`;
    const res = await post({ ...withoutArgs, session_id: sessionId });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const entry = JSON.parse((await logLineFor(sessionId))!);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual(["command_args"]);
  });

  test("UserPromptExpansion-8 (hook replied with nested hookSpecificOutput.additionalContext) is still answered with {} by this passive handler", async () => {
    const payload = await capturedPayload("UserPromptExpansion-8");
    const res = await post(payload);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({});
    expect(body.decision).toBeUndefined();
    expect(body.hookSpecificOutput).toBeUndefined();
  });
});
