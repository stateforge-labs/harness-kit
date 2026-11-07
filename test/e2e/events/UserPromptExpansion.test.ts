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

const common = (sessionId: string) => ({
  session_id: sessionId,
  transcript_path: "/home/user/.claude/projects/x/transcript.jsonl",
  cwd: "/home/user/project",
  hook_event_name: "UserPromptExpansion",
});

const required = {
  expansion_type: "slash_command",
  command_name: "example-skill",
  command_args: "arg1 arg2",
  command_source: "plugin",
  prompt: "/example-skill arg1 arg2",
};

const logLineFor = (sessionId: string) =>
  eventually(async () => {
    const text = await Bun.file(srv.logFile).text().catch(() => "");
    return text.split("\n").find((l) => l.includes(`"session_id":"${sessionId}"`));
  });

describe("e2e: UserPromptExpansion", () => {
  test("a realistic payload is answered with an empty passive response", async () => {
    const res = await post({ ...common("upe1"), ...required });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  test("the log line is known, has no missing keys, records the expansion meta, and no payload text", async () => {
    await post({
      ...common("upe2"),
      ...required,
      command_args: "UPE-SECRET-ARGS",
      prompt: "/example-skill UPE-SECRET-PROMPT",
    });
    const line = await logLineFor("upe2");
    const entry = JSON.parse(line!);
    expect(entry.event).toBe("UserPromptExpansion");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.expansion_type).toBe("slash_command");
    expect(entry.command_name).toBe("example-skill");
    expect(entry.command_source).toBe("plugin");
    expect(line).not.toContain("UPE-SECRET-PROMPT");
    expect(line).not.toContain("UPE-SECRET-ARGS");
  });

  test("a payload missing a required key is still answered 200 and logged with it in missing", async () => {
    const { command_args: _omit, ...withoutArgs } = required;
    const res = await post({ ...common("upe3"), ...withoutArgs });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const entry = JSON.parse((await logLineFor("upe3"))!);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual(["command_args"]);
  });

  test("never blocks or adds context, even for a command that looks like it should be stopped", async () => {
    const res = await post({
      ...common("upe4"),
      ...required,
      command_name: "deploy",
      command_source: "plugin",
      prompt: "/deploy production",
    });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({});
    expect(body.decision).toBeUndefined();
    expect(body.hookSpecificOutput).toBeUndefined();
  });
});
