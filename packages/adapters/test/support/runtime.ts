import type { RuntimeContext } from "../../src/driver/context.ts";
import { newState } from "../../src/driver/context.ts";
import type { ProcessRunner } from "../../src/driver/ports.ts";
import type { EnvSource } from "../../src/env.ts";
import { fakeClock, fakeFs, type FakeFs } from "./fakes.ts";
import { BASE } from "./prepare.ts";
import { fail } from "../../src/core/result.ts";

export const RUN_CWD = "/work";
export const BIN_DIR = "/bin";
export const BIN_PATH = `${BIN_DIR}/fake-cli`;
export const SCRATCH_ROOT = "/tmp";
export const SCRATCH_FIRST = `${SCRATCH_ROOT}/stateforge-adapters-scratch-1`;

export function baseSource(extra: EnvSource = {}): EnvSource {
  return { ...BASE, PATH: BIN_DIR, ...extra };
}

export function fsWithBinary(extra: { files?: Record<string, string> } = {}): FakeFs {
  return fakeFs({ executables: [BIN_PATH], files: extra.files });
}

export function unusedRunner(): ProcessRunner {
  return async () => fail({ code: "spawn-failed", message: "no spawn expected" });
}

export interface RuntimeParts {
  readonly ctx: RuntimeContext;
  readonly fs: FakeFs;
}

export function runtimeCtx(overrides: Partial<RuntimeContext> & { fsOverride?: FakeFs } = {}): RuntimeParts {
  const fs = overrides.fsOverride ?? fsWithBinary();
  const ctx: RuntimeContext = {
    source: baseSource(),
    envTransform: undefined,
    runner: unusedRunner(),
    fs,
    clock: fakeClock(0),
    platform: "linux",
    cwd: () => RUN_CWD,
    onEvent: undefined,
    state: newState(),
    ...overrides,
  };
  return { ctx, fs };
}
