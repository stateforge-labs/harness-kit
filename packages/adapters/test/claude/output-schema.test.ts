import { describe, expect, test } from "bun:test";
import { secret } from "../../src/core/secret.ts";
import { routedRig, SENTINEL } from "../runtime/support.ts";

const API_KEY = { mode: "api-key", key: secret(SENTINEL) } as never;
const REQUEST = { instructions: "x", input: "y" };
const SCHEMA = { type: "object" } as const;
const SUCCESS = '{"type":"result","subtype":"success","stop_reason":"tool_use","structured_output":{"ops":[]}}';
const RETRIES = '{"type":"result","subtype":"error_max_structured_output_retries","is_error":true,"stop_reason":"tool_use","num_turns":2,"permission_denials":[]}';

describe("claude outputSchema", () => {
  test("schema adds json-schema", () => {
    const { runtime } = routedRig({ stdout: "" });
    const planned = runtime.headless("claude", { credential: API_KEY } as never).plan({ ...REQUEST, outputSchema: SCHEMA });
    const args = planned.ok && planned.value.engine === "cli" ? planned.value.args : [];
    expect(args[args.indexOf("--json-schema") + 1]).toBe('{"type":"object"}');
  });

  test("structured_output reaches output", async () => {
    const { runtime } = routedRig({ stdout: SUCCESS });
    const result = await runtime.headless("claude", { credential: API_KEY } as never).run({ ...REQUEST, outputSchema: SCHEMA });
    expect(result.ok && result.value.output).toEqual({ ops: [] });
  });

  test("retries exhausted becomes unparsable", async () => {
    const { runtime } = routedRig({ stdout: RETRIES });
    const result = await runtime.headless("claude", { credential: API_KEY } as never).run({ ...REQUEST, outputSchema: SCHEMA });
    expect(!result.ok && result.failure).toMatchObject({ kind: "unparsable" });
  });

  test("no schema, argv as today", () => {
    const { runtime } = routedRig({ stdout: "" });
    const planned = runtime.headless("claude", { credential: API_KEY } as never).plan(REQUEST);
    expect(planned.ok && planned.value.engine === "cli" && planned.value.args).not.toContain("--json-schema");
  });
});
