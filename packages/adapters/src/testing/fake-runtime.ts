import { Harness, type HarnessId } from "@stateforge-labs/harness-hooks";
import { CLAUDE_DRIVER } from "../claude/driver.ts";
import { CODEX_DRIVER } from "../codex/driver.ts";
import { type Capabilities, Engine } from "../core/capability.ts";
import { type RunFailure, UnavailableReason } from "../core/failure.ts";
import { NO_USAGE } from "../core/kit.ts";
import { fail, ok, type Result } from "../core/result.ts";
import type { CliPlan, HeadlessOptions, Plan, RunEvent, RunOutput, RunRequest } from "../core/run.ts";
import { closedFailure } from "../driver/finish.ts";
import type { HeadlessHandle } from "../driver/handle.ts";
import { measuredValue } from "../core/evidence.ts";
import type { Drivers } from "../driver/port.ts";
import { OPENCODE_DRIVER } from "../opencode/driver.ts";

export interface FakeScripts {
  readonly [id: string]: readonly (RunOutput | RunFailure)[] | undefined;
}

export interface FakeCall {
  readonly id: HarnessId;
  readonly options: Partial<HeadlessOptions<HarnessId>>;
  readonly request: RunRequest;
}

export interface FakeRuntimeOptions {
  readonly scripts: FakeScripts;
  readonly promptLimits?: Partial<Record<HarnessId, number | null>>;
  readonly capabilities?: Partial<Record<HarnessId, Capabilities>>;
}

export interface FakeRuntime {
  headless<I extends HarnessId>(id: I, options?: Partial<HeadlessOptions<I>>): HeadlessHandle<I>;
  close(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
  readonly requests: readonly RunRequest[];
  readonly plans: readonly Plan[];
  readonly calls: readonly FakeCall[];
  promptLimit(id: HarnessId, engine?: Engine): number | null;
  capabilities(id: HarnessId): Capabilities | null;
}

const FAKE = {
  Binary: "fake-runtime-cli",
  KindField: "kind",
  Exhausted: "fake runtime script exhausted",
  BinaryPath: "/fake/bin/fake-runtime-cli",
  Cwd: "/fake-cwd",
  CredentialMode: "api-key",
} as const;

const REAL_DRIVERS: Drivers<HarnessId> = {
  [Harness.Claude]: CLAUDE_DRIVER,
  [Harness.Codex]: CODEX_DRIVER,
  [Harness.OpenCode]: OPENCODE_DRIVER,
};

const ARGV_PROMPT_HARNESSES: readonly string[] = [Harness.Claude];

function realPromptLimit(id: HarnessId, engine: Engine): number | null {
  return engine === Engine.Cli && ARGV_PROMPT_HARNESSES.includes(id) ? measuredValue(REAL_DRIVERS[id].profile.limits.maxArgBytes) : null;
}

function isFailure(item: RunOutput | RunFailure): item is RunFailure {
  return Object.hasOwn(item, FAKE.KindField);
}

function exhausted(id: string): RunFailure {
  return { kind: "unavailable", message: `${id}: ${FAKE.Exhausted}`, reason: UnavailableReason.InternalError };
}

/** A complete RunOutput with neutral defaults; every field in `over` replaces its default. */
export function fakeOutput(over: Partial<RunOutput> = {}): RunOutput {
  const base: Pick<RunOutput, "text" | "usage" | "cost" | "model" | "sessionId" | "engine" | "stability" | "elapsedMs" | "persisted" | "binary" | "cwd" | "confinement"> & { readonly credential: Omit<RunOutput["credential"], "observed" | "verified"> } = {
    text: "",
    usage: NO_USAGE,
    cost: { usd: 0, basis: "list" },
    model: null,
    sessionId: null,
    engine: Engine.Cli,
    stability: "stable",
    elapsedMs: 0,
    persisted: true,
    binary: { path: FAKE.BinaryPath, version: null, source: "installed" },
    cwd: FAKE.Cwd,
    credential: { requested: FAKE.CredentialMode, scrubbed: [], billing: "unverified", acknowledgement: null },
    confinement: [],
  };
  return { ...base, ...over } as RunOutput;
}

async function resultOf(events: AsyncIterable<RunEvent>, id: string): Promise<Result<RunOutput, RunFailure>> {
  let last: Result<RunOutput, RunFailure> | null = null;
  for await (const event of events) {
    if (event.kind === "finished") {
      last = event.result;
    }
  }
  return last ?? fail(exhausted(id));
}

function planFor(id: string): Plan {
  const plan: Pick<CliPlan, "harness" | "engine" | "binary" | "args" | "stdinBytes" | "argvCarries" | "env" | "cwd" | "confinement" | "options" | "notes"> = {
    harness: id,
    engine: Engine.Cli,
    binary: FAKE.Binary,
    args: [],
    stdinBytes: 0,
    argvCarries: [],
    env: { kind: "inherit", inject: [], strip: [], set: [] },
    cwd: { kind: "given", retain: null },
    confinement: [],
    options: {},
    notes: [],
  };
  return plan as CliPlan;
}

export function fakeRuntime(config: FakeRuntimeOptions): FakeRuntime {
  const cursors = new Map<string, number>();
  const requests: RunRequest[] = [];
  const plans: Plan[] = [];
  const calls: FakeCall[] = [];
  let closed = false;

  const nextItem = (id: string): RunOutput | RunFailure => {
    const index = cursors.get(id) ?? 0;
    cursors.set(id, index + 1);
    const script = Object.hasOwn(config.scripts, id) ? config.scripts[id] : undefined;
    return script?.[index] ?? exhausted(id);
  };

  async function* eventsFor(id: string): AsyncGenerator<RunEvent> {
    if (closed) {
      yield { kind: "finished", result: fail(closedFailure()) };
      return;
    }
    const item = nextItem(id);
    if (isFailure(item)) {
      yield { kind: "finished", result: fail(item) };
      return;
    }
    yield { kind: "started", engine: Engine.Cli };
    if (item.text !== "") {
      yield { kind: "text", text: item.text };
    }
    yield { kind: "finished", result: ok(item) };
  }

  function handleFor<I extends HarnessId>(id: I, options: Partial<HeadlessOptions<I>>): HeadlessHandle<I> {
    const record = (request: RunRequest): void => {
      requests.push(request);
      calls.push({ id, options: options as Partial<HeadlessOptions<HarnessId>>, request });
    };
    const stream = (request: RunRequest): AsyncIterable<RunEvent> => {
      record(request);
      return eventsFor(id);
    };
    return {
      id,
      plan(request) {
        record(request);
        if (closed) {
          return fail(closedFailure());
        }
        const plan = planFor(id);
        plans.push(plan);
        return ok(plan);
      },
      run: (request) => resultOf(stream(request), id),
      stream,
    };
  }

  const close = async (): Promise<void> => {
    closed = true;
  };

  return {
    headless: <I extends HarnessId>(id: I, options: Partial<HeadlessOptions<I>> = {}) => handleFor(id, options),
    close,
    [Symbol.asyncDispose]: close,
    requests,
    plans,
    calls,
    promptLimit: (id, engine = Engine.Cli) => {
      const given = config.promptLimits;
      return given !== undefined && Object.hasOwn(given, id) ? (given[id] ?? null) : realPromptLimit(id, engine);
    },
    capabilities: (id) => config.capabilities?.[id] ?? (REAL_DRIVERS[id]?.capabilities ?? null),
  };
}
