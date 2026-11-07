import { describe, expect, test } from "bun:test";
import { eventually } from "./harness.ts";
import { hookServer } from "./kit.ts";

const hook = hookServer("claude");

describe("e2e: the metadata log keeps only strings in the common fields", () => {
  test("an object or array where session_id, tool_name or agent_type belong is not written to the log", async () => {
    const marker = `objtest-${crypto.randomUUID()}`;
    const res = await hook.post({
      hook_event_name: "PreToolUse",
      agent_id: marker,
      session_id: { note: "SECRET-OBJECT-TEXT" },
      tool_name: ["SECRET-ARRAY-TEXT"],
      agent_type: { deep: { er: "SECRET-NESTED-TEXT" } },
    });
    expect(res.status).toBe(200);
    const line = await eventually(async () => (await hook.logText()).split("\n").find((l) => l.includes(marker)));
    expect(line).not.toContain("SECRET");
    expect(JSON.parse(line!)).toMatchObject({ agent_id: marker, known: true });
  });
});
