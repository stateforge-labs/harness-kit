// What is special about PermissionDenied: the classifier reason is logged, and an Agent denial is never retried. The shared checks are in ../contract.test.ts.
import { describe, expect, test } from "bun:test";
import { fixture, hookServer, variant } from "./kit.ts";

const TOKEN = "t0k3n";
const SECRET_CMD = "rm -rf SECRET-PATH-ZZ9";
const hook = hookServer({ HOOK_TOKEN: TOKEN });
const post = (body: unknown) => hook.post(body, { token: TOKEN });

describe("e2e: PermissionDenied", () => {
  test("the log records tool_name, reason and permission_mode, but never tool_input", async () => {
    const body = variant(fixture("PermissionDenied"), {
      tool_input: { command: SECRET_CMD, description: "clean" },
      reason: "[Irreversible Local Destruction]",
    });
    await post(body);
    const { entry, text } = await hook.logFor(body.session_id);
    expect(entry.tool_name).toBe("Bash");
    expect(entry.reason).toBe("[Irreversible Local Destruction]");
    expect(entry.permission_mode).toBe("auto");
    expect(text).not.toContain("SECRET-PATH-ZZ9");
  });

  test("the handler stays passive: no retry, even for an Agent call with a classifier denial", async () => {
    const res = await post(
      variant(fixture("PermissionDenied"), {
        tool_name: "Agent",
        tool_input: { prompt: "Find all API endpoints", model: "sonnet" },
        reason: "Auto mode could not evaluate this action and is blocking it for safety",
      }),
    );
    expect(await res.json()).toEqual({});
  });

  test("the captured fixture logs tool_name Bash and reason [Data Exfiltration]", async () => {
    const body = fixture("PermissionDenied").payload;
    await post(body);
    const { entry } = await hook.logFor(String(body.session_id));
    expect(entry.tool_name).toBe("Bash");
    expect(entry.reason).toBe("[Data Exfiltration]");
  });
});
