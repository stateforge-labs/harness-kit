import { describe, expect, test } from "bun:test";
import { secret } from "../../src/core/secret.ts";
import { KILL_GRACE_MS } from "../../src/driver/constants.ts";
import { fakeClock } from "../support/fakes.ts";
import { SENTINEL, routedRig } from "../runtime/support.ts";

const CRED = { mode: "api-key", key: secret(SENTINEL) } as never;

describe("per-call time limit", () => {
  test("a request timeoutMs wins over the headless timeoutMs", async () => {
    const clock = fakeClock(0);
    const { runtime } = routedRig({ stdout: "", hold: true }, { clock });
    const pending = runtime.headless("claude", { credential: CRED, timeoutMs: 10000 } as never).run({ instructions: "x", input: "y", timeoutMs: 50 } as never);
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
    clock.advance(50);
    clock.advance(KILL_GRACE_MS);
    const result = await pending;
    expect(!result.ok && result.failure.kind).toBe("timeout");
    expect(!result.ok && result.failure.kind === "timeout" && result.failure.timeoutMs).toBe(50);
  });
});
