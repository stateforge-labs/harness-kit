import type { HarnessId } from "@stateforge-labs/harness-hooks";
import { Engine } from "../core/capability.ts";
import { type RunFailure, UnavailableReason } from "../core/failure.ts";
import { fail, ok, type Result } from "../core/result.ts";
import { Isolation, type HeadlessOptions, type Plan, type RunEvent, type RunOutput, type RunRequest } from "../core/run.ts";
import { closedFailure } from "../driver/finish.ts";
import type { HeadlessHandle } from "../driver/handle.ts";

export interface FakeScripts {
  readonly [id: string]: readonly (RunOutput | RunFailure)[] | undefined;
}

export interface FakeRuntime {
  headless<I extends HarnessId>(id: I, options?: Partial<HeadlessOptions<I>>): HeadlessHandle<I>;
  close(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
  readonly requests: readonly RunRequest[];
  readonly plans: readonly Plan[];
}

const FAKE = {
  Binary: "fake-runtime-cli",
  KindField: "kind",
  Exhausted: "fake runtime script exhausted",
} as const;

function isFailure(item: RunOutput | RunFailure): item is RunFailure {
  return Object.hasOwn(item, FAKE.KindField);
}

function exhausted(id: string): RunFailure {
  return { kind: "unavailable", message: `${id}: ${FAKE.Exhausted}`, reason: UnavailableReason.ScriptExhausted };
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
  return {
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
    layers: {},
    isolation: { kind: Isolation.None },
    notes: [],
  };
}

export function fakeRuntime(options: { readonly scripts: FakeScripts }): FakeRuntime {
  const cursors = new Map<string, number>();
  const requests: RunRequest[] = [];
  const plans: Plan[] = [];
  let closed = false;

  const nextItem = (id: string): RunOutput | RunFailure => {
    const index = cursors.get(id) ?? 0;
    cursors.set(id, index + 1);
    const script = Object.hasOwn(options.scripts, id) ? options.scripts[id] : undefined;
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

  function handleFor<I extends HarnessId>(id: I): HeadlessHandle<I> {
    const stream = (request: RunRequest): AsyncIterable<RunEvent> => {
      requests.push(request);
      return eventsFor(id);
    };
    return {
      id,
      plan(request) {
        requests.push(request);
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
    headless: <I extends HarnessId>(id: I) => handleFor(id),
    close,
    [Symbol.asyncDispose]: close,
    requests,
    plans,
  };
}
