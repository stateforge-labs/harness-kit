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
  hook_event_name: "InstructionsLoaded",
});

describe("e2e: InstructionsLoaded", () => {
  test("a realistic payload is answered 200 with an empty passive response", async () => {
    const res = await post({
      ...common("il1"),
      file_path: "/home/user/project/CLAUDE.md",
      memory_type: "Project",
      load_reason: "session_start",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  test("the log line records known, no missing keys and the meta fields, never payload text", async () => {
    await post({
      ...common("il2"),
      file_path: "/home/user/project/src/CLAUDE.md",
      memory_type: "Project",
      load_reason: "nested_traversal",
      trigger_file_path: "/home/user/project/src/INSTRUCTIONS-SECRET-PATH.ts",
      message: "INSTR-SECRET-TEXT",
    });
    const line = await logLineFor("il2");
    const entry = JSON.parse(line!);
    expect(entry.event).toBe("InstructionsLoaded");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.load_reason).toBe("nested_traversal");
    expect(entry.memory_type).toBe("Project");
    expect(line).not.toContain("INSTR-SECRET-TEXT");
    expect(line).not.toContain("INSTRUCTIONS-SECRET-PATH");
  });

  test("a payload missing a required key is still answered 200 and logged with that key in missing", async () => {
    const res = await post({ ...common("il3"), memory_type: "User", load_reason: "session_start" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const entry = JSON.parse((await logLineFor("il3"))!);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual(["file_path"]);
  });

  test("never blocks, changes permissions or injects context, even for a lazy load", async () => {
    const res = await post({
      ...common("il4"),
      file_path: "/home/user/project/src/CLAUDE.md",
      memory_type: "Project",
      load_reason: "path_glob_match",
      globs: ["src/**/*.ts"],
    });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({});
    expect(body.decision).toBeUndefined();
    expect(body.continue).toBeUndefined();
    expect(body.hookSpecificOutput).toBeUndefined();
  });
});
