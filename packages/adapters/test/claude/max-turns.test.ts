import { describe, expect, test } from "bun:test";
import { secret } from "../../src/core/secret.ts";
import { routedRig, SENTINEL } from "../runtime/support.ts";

const API_KEY = { mode: "api-key", key: secret(SENTINEL) } as never;
const REQUEST = { instructions: "x", input: "y" };
const ROW = '{"type":"result","subtype":"error_max_turns","is_error":true,"stop_reason":"tool_use","num_turns":2,"permission_denials":[]}';
const OTHER_ROW = ROW.replace("error_max_turns", "error_during_execution");

describe("claude maxTurns", () => {
  test("max turns adds the flag", () => {
    const { runtime } = routedRig({ stdout: "" });
    const planned = runtime.headless("claude", { credential: API_KEY } as never).plan({ ...REQUEST, maxTurns: 1 });
    const args = planned.ok && planned.value.engine === "cli" ? planned.value.args : [];
    expect(args[args.indexOf("--max-turns") + 1]).toBe("1");
  });

  test("no max turns, argv as today", () => {
    const { runtime } = routedRig({ stdout: "" });
    const planned = runtime.headless("claude", { credential: API_KEY } as never).plan(REQUEST);
    expect(planned.ok && planned.value.engine === "cli" && planned.value.args).not.toContain("--max-turns");
  });

  test("error_max_turns with exit 1 becomes max-turns", async () => {
    const { runtime } = routedRig({ stdout: ROW, code: 1 });
    const result = await runtime.headless("claude", { credential: API_KEY } as never).run({ ...REQUEST, maxTurns: 1 });
    expect(!result.ok && result.failure).toMatchObject({ kind: "max-turns", turns: 2 });
  });

  test("other is_error with exit 1 stays exit", async () => {
    const { runtime } = routedRig({ stdout: OTHER_ROW, code: 1 });
    const result = await runtime.headless("claude", { credential: API_KEY } as never).run({ ...REQUEST, maxTurns: 1 });
    expect(!result.ok && result.failure).toMatchObject({ kind: "exit", code: 1 });
  });
});
