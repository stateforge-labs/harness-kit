import type { EngineIo, EngineRunInput } from "../driver/engine.ts";
import { supervise } from "../driver/supervise.ts";

function withoutSecrets(input: EngineRunInput): Record<string, string> {
  return Object.fromEntries(Object.entries(input.env).filter(([, value]) => input.redact(value) === value));
}

export async function runOnce(input: EngineRunInput, io: EngineIo, args: readonly string[], timeoutMs: number): Promise<string | null> {
  const supervised = supervise({
    runner: io.runner,
    spec: { program: input.program, args, env: withoutSecrets(input), cwd: input.cwd, stdin: null },
    signal: undefined,
    timeoutMs,
    limits: input.limits,
    clock: io.clock,
    redact: input.redact,
  });
  for (;;) {
    const step = await supervised.next();
    if (step.done === true) {
      return step.value.ok ? step.value.value.stdout : null;
    }
  }
}
