import { type Capabilities, CapabilityName, cell, supported, type Support } from "../../../src/core/capability.ts";
import type { RunFailure } from "../../../src/core/failure.ts";
import type { AgentEnd, AgentEngineImpl, AgentEngineRun, AgentRunInput } from "../../../src/agent/engine.ts";
import type { AgentEvent, AgentOptions, AgentOutput, AgentStart } from "../../../src/agent/types.ts";
import { fail, ok, type Result } from "../../../src/core/result.ts";
import { secret } from "../../../src/core/secret.ts";
import { TOOLS_OFF } from "../../../src/core/policy.ts";
import { createRuntime, type Runtime } from "../../../src/runtime/index.ts";
import type { RuntimeConfig } from "../../../src/driver/ports.ts";
import { fakeClock, fakeFs } from "../../support/fakes.ts";
import { FAKE_CAPABILITIES, fakeDriver } from "../../support/fake-driver.ts";
import type { HarnessDriver } from "../../../src/driver/port.ts";

export const KEY = "sk-AGENT-SENTINEL-1f4c";
export const BEARER = "bearer-SENTINEL-9b2e";
export const BASE_URL = "http://127.0.0.1:9";
export const DIRS = { cwd: "/w/cwd", home: "/w/home", configDir: "/w/cfg", tmpDir: "/w/tmp" };
export const ID = "fake";

export const options: AgentOptions = {
  credential: { mode: "api-key", key: secret(KEY), baseUrl: BASE_URL },
  dirs: DIRS,
  tools: TOOLS_OFF,
  env: { kind: "closed", set: { PATH: "/bin" } },
};

export const startOf = (extra: Partial<AgentStart> = {}): AgentStart => ({ instructions: "be brief", prompt: "hello", maxTurns: 3, ...extra });

export const usage = (turn: number): AgentEvent => ({ kind: "usage", turn, model: "m", input: 10, cacheWrite: 2, cacheRead: 3, output: 4 });

export const endOf = (extra: Partial<AgentOutput> = {}): AgentEnd => ({
  output: { text: "done", output: null, sessionId: null, checkpoint: null, turns: 1, usage: [], model: null, ...extra },
  stderrTail: "",
});

export type Script = {
  readonly events?: readonly AgentEvent[];
  readonly result?: Result<AgentEnd, RunFailure>;
  readonly hang?: boolean;
  readonly throwAfter?: boolean;
  readonly describe?: Result<never, RunFailure>;
};

export interface ScriptedEngine extends AgentEngineImpl<typeof ID> {
  readonly starts: AgentRunInput[];
  readonly cancels: number[];
}

export function scriptedEngine(scripts: readonly Script[]): ScriptedEngine {
  const starts: AgentRunInput[] = [];
  const cancels: number[] = [];
  let describeFailure: Result<never, RunFailure> | undefined;
  for (const script of scripts) {
    describeFailure ??= script.describe;
  }
  return {
    harness: ID,
    starts,
    cancels,
    describe(input) {
      if (describeFailure !== undefined) {
        return describeFailure;
      }
      return ok({
        engine: "sdk",
        entry: "fake",
        harness: ID,
        options: {},
        env: { kind: "closed", inject: [], strip: [], set: Object.keys(input.env) },
        cwd: { kind: "given", retain: null },
        confinement: input.confinement,
        notes: [],
      });
    },
    start(input) {
      const index = starts.length;
      starts.push(input);
      const script = scripts[Math.min(index, scripts.length - 1)] ?? {};
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let cancelled = false;
      async function* events(): AsyncGenerator<AgentEvent> {
        for (const event of script.events ?? []) {
          yield event;
        }
        if (script.throwAfter === true) {
          throw new Error("engine events broke");
        }
        if (script.hang === true) {
          await gate;
        }
      }
      const done = (async (): Promise<Result<AgentEnd, RunFailure>> => {
        if (script.hang === true) {
          await gate;
        }
        if (cancelled) {
          return fail({ kind: "cancelled", message: "engine cancelled" });
        }
        return script.result ?? ok(endOf());
      })();
      const run: AgentEngineRun = {
        events: events(),
        cancel() {
          cancelled = true;
          cancels.push(index);
          release();
        },
        done,
      };
      return run;
    },
  };
}

export function sdkCapabilities(overrides: Partial<Record<CapabilityName, Support>> = {}): Capabilities {
  const out: Record<string, ReturnType<typeof cell>> = {};
  for (const [name, entry] of Object.entries(FAKE_CAPABILITIES)) {
    const override = overrides[name as CapabilityName];
    out[name] = cell(entry.cli, override ?? supported);
  }
  return out as unknown as Capabilities;
}

export function agentDriver(caps: Capabilities = sdkCapabilities()): HarnessDriver<typeof ID> {
  return { ...fakeDriver(), capabilities: caps };
}

export interface Rig {
  readonly runtime: Runtime<typeof ID>;
  readonly engine: ScriptedEngine;
  readonly clock: ReturnType<typeof fakeClock>;
}

export function rig(scripts: readonly Script[], extra: Partial<RuntimeConfig<typeof ID>> & { readonly caps?: Capabilities; readonly dirs?: readonly string[] } = {}): Rig {
  const engine = scriptedEngine(scripts);
  const clock = fakeClock(0);
  const { caps, dirs, ...config } = extra;
  const runtime = createRuntime<typeof ID>({
    drivers: { [ID]: agentDriver(caps) },
    agentEngines: { [ID]: engine },
    fs: fakeFs({ dirs: dirs ?? Object.values(DIRS) }),
    clock,
    ...config,
  });
  return { runtime, engine, clock };
}

export async function collect(events: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const seen: AgentEvent[] = [];
  for await (const event of events) {
    seen.push(event);
  }
  return seen;
}

export function finishedOf(events: readonly AgentEvent[]): Result<AgentOutput, RunFailure> {
  const last = events[events.length - 1];
  if (last === undefined || last.kind !== "finished") {
    throw new Error("the last event is not finished");
  }
  return last.result;
}

export function failureOf(result: Result<AgentOutput, RunFailure>): RunFailure {
  if (result.ok) {
    throw new Error("expected a failure");
  }
  return result.failure;
}

export function agentOf(r: Rig, opts: AgentOptions = options) {
  const made = r.runtime.agent(ID, opts);
  if (!made.ok) {
    throw new Error(`agent refused: ${made.failure.kind}`);
  }
  return made.value;
}
