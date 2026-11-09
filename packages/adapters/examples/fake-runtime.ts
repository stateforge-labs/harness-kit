import { Harness } from "../src/runtime/index.ts";
import { fakeRuntime } from "../src/testing/fake-runtime.ts";

export async function replayedTimeout() {
  await using fake = fakeRuntime({
    scripts: { [Harness.Claude]: [{ kind: "timeout", message: "fake timeout", timeoutMs: 1000 }] },
  });
  const claude = fake.headless(Harness.Claude, {
    credential: { mode: "login-store", acknowledgePolicy: true },
  });
  return claude.run({ instructions: "Answer in one short sentence.", input: "ping" });
}
