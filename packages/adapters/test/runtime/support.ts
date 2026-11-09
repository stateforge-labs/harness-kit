import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { ProcessRunner, ProcessSpec } from "../../src/driver/ports.ts";
import { createRuntime, type Runtime } from "../../src/runtime/index.ts";
import type { RuntimeConfig } from "../../src/driver/ports.ts";
import { secret } from "../../src/core/secret.ts";
import type { EnvSource } from "../../src/env.ts";
import { fakeClock, fakeFs, fakeProcessRunner, type FakeFs, type FakeProcessRunner, type FakeProcessScript } from "../support/fakes.ts";
import { adaptersFixtures } from "../support/fixtures.ts";

export const SENTINEL = "sk-SENTINEL-7f3a9c";
export const BIN = "/bin";
export const RUN_CWD = "/work";
export const HOMES: readonly string[] = ["/h/a", "/root", "/home/x y"];
export const HARNESS_IDS = ["claude", "codex", "opencode"] as const;

export function fixture(harness: string, name: string): string {
  return readFileSync(join(adaptersFixtures, harness, "headless", name), "utf8");
}

export function binFs(names: readonly string[] = HARNESS_IDS, files: Readonly<Record<string, string>> = {}): FakeFs {
  return fakeFs({ executables: names.map((name) => `${BIN}/${name}`), files });
}

export const SCRATCH_OUT = "/tmp/stateforge-adapters-scratch-1/last-message.txt";
export const CODEX_MESSAGE = "hello from codex";
export const OPENCODE_STREAM = [
  { type: "step_start", sessionID: "ses_1", part: {} },
  { type: "text", sessionID: "ses_1", part: { text: "hello from opencode", cost: 0.001 } },
  { type: "step_finish", sessionID: "ses_1", part: { cost: 0.001 } },
]
  .map((row) => JSON.stringify(row))
  .join("\n");

export function sourceOf(extra: Record<string, string> = {}): EnvSource {
  return { PATH: BIN, HOME: "/h/u", ...extra };
}

export interface Rig {
  readonly runtime: Runtime;
  readonly procs: FakeProcessRunner;
  readonly fs: FakeFs;
}

export function rig(scripts: readonly FakeProcessScript[], config: Partial<Omit<RuntimeConfig, "drivers">> = {}, fs: FakeFs = binFs()): Rig {
  const procs = fakeProcessRunner(scripts);
  const runtime = createRuntime({
    source: sourceOf(),
    spawn: procs.runner,
    fs,
    clock: fakeClock(0),
    platform: "linux",
    cwd: () => RUN_CWD,
    ...config,
  });
  return { runtime, procs, fs };
}

export function apiKey(value: string = SENTINEL) {
  return { mode: "api-key", key: secret(value) };
}

export function envOf(spec: { readonly env: Readonly<Record<string, string>> }): Readonly<Record<string, string>> {
  return spec.env;
}

export function mentions(value: unknown, needle: string): boolean {
  return JSON.stringify(value, (_key, item: unknown) => (typeof item === "bigint" ? item.toString() : item)).includes(needle);
}

const VERSIONS: Readonly<Record<string, string>> = {
  claude: "2.1.319 (Claude Code)",
  codex: "codex-cli 0.167.0",
  opencode: "opencode v2.2.6",
};

export interface Routed {
  readonly runtime: Runtime;
  readonly specs: ProcessSpec[];
  readonly fs: FakeFs;
}

export interface RoutedExtra {
  readonly files?: Readonly<Record<string, string>>;
  readonly help?: string;
  readonly fs?: FakeFs;
}

export function routedRig(run: FakeProcessScript, config: Partial<Omit<RuntimeConfig, "drivers">> = {}, extra: RoutedExtra = {}): Routed {
  const specs: ProcessSpec[] = [];
  const fs = extra.fs ?? binFs(HARNESS_IDS, extra.files ?? {});
  const runner: ProcessRunner = async (spec) => {
    specs.push(spec);
    const name = basename(spec.program);
    const script = spec.args.includes("--version")
      ? { stdout: VERSIONS[name] ?? "" }
      : spec.args.includes("--help")
        ? { stdout: extra.help ?? fixture(name, "help.txt") }
        : run;
    return fakeProcessRunner([script]).runner(spec);
  };
  const runtime = createRuntime({
    source: sourceOf(),
    spawn: runner,
    fs,
    clock: fakeClock(0),
    platform: "linux",
    cwd: () => RUN_CWD,
    ...config,
  });
  return { runtime, specs, fs };
}
