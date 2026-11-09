import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fixturesDir } from "./fixtures-dir.ts";
import { Pipeline, adapters, handle, policyLayer, type Deny, type HarnessAdapter, type Middleware } from "../src/index.ts";

const adapter = (id: string): HarnessAdapter => {
  const a = adapters.get(id);
  if (!a) throw new Error(`no adapter ${id}`);
  return a;
};

const codexPre = (): Record<string, unknown> => JSON.parse(readFileSync(join(fixturesDir, "codex", "PreToolUse", "01-bash.json"), "utf8"));

const broken = (): HarnessAdapter => ({
  ...adapter("codex"),
  decode: () => {
    throw new Error("decode broke");
  },
});

const D: Deny = { reason: "LOG-DENY-REASON", hint: "LOG-DENY-HINT" };
const passthrough: Middleware = (_ctx, next) => next();

afterEach(() => {
  mock.restore();
});

describe("handle() with an onError option", () => {
  test("a decode that throws reports once, naming the adapter, and a deny-fault layer still answers the deny", async () => {
    const errors: string[] = [];
    const p = new Pipeline({ onFault: () => {} }).use(passthrough, { onFault: { deny: D } });
    const { body } = await handle(broken(), codexPre(), p, {
      onError: (message) => {
        errors.push(message);
      },
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("codex");
    expect(body).toEqual({
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "LOG-DENY-REASON\nLOG-DENY-HINT" },
    });
  });

  test("an encode that throws reports through onError with the adapter id", async () => {
    const errors: string[] = [];
    const bad: HarnessAdapter = {
      ...adapter("codex"),
      encode: () => {
        throw new Error("encode broke");
      },
    };
    await handle(bad, codexPre(), new Pipeline({ onFault: () => {} }).use(policyLayer), {
      onError: (message) => {
        errors.push(message);
      },
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("codex");
  });
});

describe("library logging is silent by default", () => {
  test("handle() with no options writes nothing to console.error when the decode throws", async () => {
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});
    const p = new Pipeline().use(passthrough, { onFault: { deny: D } });
    await handle(broken(), codexPre(), p);
    expect(errorSpy).toHaveBeenCalledTimes(0);
  });

  test("a Pipeline with no onFault writes nothing to console.error when a layer throws", async () => {
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});
    const thrower = () => {
      throw new Error("layer broke");
    };
    const p = new Pipeline({ timeoutMs: 1000 }).use(thrower);
    await p.run({ event: { kind: "pre-tool" } as never, rules: adapter("codex").rules, raw: {} });
    expect(errorSpy).toHaveBeenCalledTimes(0);
  });
});
