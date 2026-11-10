import { Harness } from "@stateforge-labs/harness-hooks";
import type { AgentEngineImpl, AgentEngineRun, AgentEnd, AgentRunInput } from "../../agent/engine.ts";
import { AgentTree } from "../../agent/constants.ts";
import type { AgentEvent, HookTarget } from "../../agent/types.ts";
import { Engine } from "../../core/capability.ts";
import type { Clock } from "../../core/io.ts";
import { UnavailableReason, type RunFailure } from "../../core/failure.ts";
import { FAILURE_TAIL_BYTES } from "../../core/engine-constants.ts";
import { tailBytes } from "../../core/limits.ts";
import { fail, ok, type Result } from "../../core/result.ts";
import type { SdkPlan } from "../../core/run.ts";
import { EnvVar } from "../../env.ts";
import { createSdkDecoder, errorText } from "./sdk-events.ts";
import { buildQueryOptions, sessionStoreAdapter, type ClaudeHookOption, type ClaudeQueryOptions, type HookObserver } from "./sdk-options.ts";
import { defaultTreeDeps, processTree, type ProcessTree } from "./sdk-process.ts";
import { CLAUDE_SDK_VERSION, SdkHooks, SdkMatch, SdkMcp, SdkMessage, SdkPlanFacts, SdkProcess } from "./sdk-constants.ts";

export { CLAUDE_SDK_VERSION };
export type { ClaudeHookOption, ClaudeQueryOptions, HookObserver } from "./sdk-options.ts";

/** The message stream of one query. Messages are decoded structurally. */
export interface ClaudeQueryStream extends AsyncIterable<unknown> {
  close?(): void;
}

/** The query function of the vendor SDK, as this engine uses it. */
export type ClaudeQueryFn = (params: { readonly prompt: string; readonly options: ClaudeQueryOptions }) => ClaudeQueryStream;

/** Builds the SDK hook callbacks for one run from the consumer's hook target. */
export type ClaudeHooksFactory = (target: HookTarget, observer: HookObserver) => ClaudeHookOption;

/** Injection points for tests and wiring. With no `query` the vendor SDK is loaded on the first start. */
export interface ClaudeSdkSeam {
  readonly query?: ClaudeQueryFn;
  readonly hooks?: ClaudeHooksFactory;
  readonly tree?: () => ProcessTree;
}

interface Channel<T> {
  push(value: T): void;
  close(): void;
  readonly iterable: AsyncIterable<T>;
}

function createChannel<T>(): Channel<T> {
  const queue: T[] = [];
  let waiting: ((step: IteratorResult<T>) => void) | null = null;
  let closed = false;
  const finished: IteratorResult<T> = { done: true, value: undefined };
  return {
    push(value) {
      if (closed) {
        return;
      }
      if (waiting !== null) {
        const resolve = waiting;
        waiting = null;
        resolve({ done: false, value });
        return;
      }
      queue.push(value);
    },
    close() {
      closed = true;
      if (waiting !== null) {
        const resolve = waiting;
        waiting = null;
        resolve(finished);
      }
    },
    iterable: {
      [Symbol.asyncIterator]() {
        return {
          next(): Promise<IteratorResult<T>> {
            const head = queue.shift();
            if (head !== undefined) {
              return Promise.resolve({ done: false, value: head });
            }
            if (closed) {
              return Promise.resolve(finished);
            }
            return new Promise((resolve) => {
              waiting = resolve;
            });
          },
          return(): Promise<IteratorResult<T>> {
            closed = true;
            queue.length = 0;
            return Promise.resolve(finished);
          },
        };
      },
    },
  };
}

function internal(): RunFailure {
  return { kind: "unavailable", message: SdkMessage.InternalFailure, reason: UnavailableReason.InternalError };
}

function guarded<T>(work: () => Promise<Result<T, RunFailure>>): Promise<Result<T, RunFailure>> {
  return Promise.resolve()
    .then(work)
    .then(
      (value) => value,
      () => fail(internal()),
    );
}

function cancelled(): RunFailure {
  return { kind: "cancelled", message: SdkMessage.Cancelled };
}

function unavailable(message: string): RunFailure {
  return { kind: "unavailable", message, reason: UnavailableReason.SpawnFailed };
}

function loadQuery(): Promise<Result<ClaudeQueryFn, RunFailure>> {
  return Promise.resolve()
    .then(() => import("@anthropic-ai/claude-agent-sdk"))
    .then(
      (loaded): Result<ClaudeQueryFn, RunFailure> => {
        const query: unknown = Reflect.get(loaded, "query");
        return typeof query === "function" ? ok(query as ClaudeQueryFn) : fail(unavailable(SdkMessage.SdkLoadFailed));
      },
      () => fail(unavailable(SdkMessage.SdkLoadFailed)),
    );
}

type Step = { readonly threw: false; readonly step: IteratorResult<unknown> } | { readonly threw: true; readonly error: unknown };

function nextStep(iterator: AsyncIterator<unknown>): Promise<Step> {
  return Promise.resolve()
    .then(() => iterator.next())
    .then(
      (step): Step => ({ threw: false, step }),
      (error: unknown): Step => ({ threw: true, error }),
    );
}

function openStream(query: ClaudeQueryFn, prompt: string, options: ClaudeQueryOptions): Promise<Result<ClaudeQueryStream, RunFailure>> {
  return Promise.resolve()
    .then(() => query({ prompt, options }))
    .then(
      (stream) => ok(stream),
      () => fail(unavailable(SdkMessage.QueryFailed)),
    );
}

function closeStream(stream: ClaudeQueryStream): Promise<void> {
  return Promise.resolve()
    .then(() => stream.close?.())
    .then(undefined, () => undefined);
}

interface Grace {
  readonly expired: Promise<typeof SdkProcess.Expired>;
  stop(): void;
}

function graceAfterAbort(signal: AbortSignal, clock: Clock, ms: number): Grace {
  let stopTimer: () => void = () => undefined;
  let stopListening: () => void = () => undefined;
  const expired = new Promise<typeof SdkProcess.Expired>((resolve) => {
    const arm = (): void => {
      stopListening();
      stopTimer = clock.after(ms, () => resolve(SdkProcess.Expired));
    };
    if (signal.aborted) {
      arm();
      return;
    }
    signal.addEventListener("abort", arm, { once: true });
    stopListening = () => signal.removeEventListener("abort", arm);
  });
  return {
    expired,
    stop() {
      stopListening();
      stopTimer();
    },
  };
}

function bounded(work: Promise<void>, clock: Clock, ms: number): Promise<void> {
  let stopTimer: () => void = () => undefined;
  const limit = new Promise<void>((resolve) => {
    stopTimer = clock.after(ms, resolve);
  });
  return Promise.race([work, limit]).then(() => stopTimer());
}

function resolveHooks(seam: ClaudeSdkSeam, target: HookTarget | undefined, observer: HookObserver): Result<ClaudeHookOption | null, RunFailure> {
  if (target === undefined) {
    return ok(null);
  }
  if (seam.hooks === undefined) {
    return fail({ kind: "unsupported", message: SdkMessage.HooksUnavailable, capability: SdkHooks.Capability, engine: Engine.Sdk, why: SdkHooks.Why });
  }
  return ok(seam.hooks(target, observer));
}

function thrownFailure(input: AgentRunInput, message: string, stderrTail: string, assistantSeen: boolean): RunFailure {
  const resume = input.start.resume;
  if (resume !== undefined && !assistantSeen && SdkMatch.NoSession.test(message)) {
    return { kind: "session-not-found", message: SdkMessage.SessionNotFound, sessionId: resume.sessionId };
  }
  const detail = [message, stderrTail].filter((part) => part !== "").join("\n");
  return { kind: "exit", message: SdkMessage.StreamFailed, code: null, signal: null, stderrTail: input.redact(tailBytes(detail, FAILURE_TAIL_BYTES)) };
}

interface Progress {
  tree: AgentTree;
}

async function execute(seam: ClaudeSdkSeam, input: AgentRunInput, abort: AbortController, channel: Channel<AgentEvent>, progress: Progress): Promise<Result<AgentEnd, RunFailure>> {
  channel.push({ kind: "started", engine: Engine.Sdk });
  if (abort.signal.aborted) {
    return fail(cancelled());
  }
  const tree = seam.query === undefined ? processTree(defaultTreeDeps(input.clock)) : (seam.tree?.() ?? null);
  let storeReason: string | null = null;
  const store = input.start.store === undefined ? null : sessionStoreAdapter(input.start.store, (reason) => {
    storeReason ??= reason;
  });
  const observer: HookObserver = {
    refused: (r) => channel.push({ kind: "refused", id: r.id, tool: r.tool, source: "hook", reason: r.reason, text: r.text }),
    context: () => undefined,
  };
  const hooks = resolveHooks(seam, input.start.hooks, observer);
  if (!hooks.ok) {
    return fail(hooks.failure);
  }
  const built = buildQueryOptions(input, { abortController: abort, hooks: hooks.value, store, spawn: tree?.spawn ?? null });
  if (!built.ok) {
    return fail(built.failure);
  }
  const query = seam.query === undefined ? await loadQuery() : ok(seam.query);
  if (!query.ok) {
    return fail(query.failure);
  }
  const opened = await openStream(query.value, input.start.prompt, built.value);
  if (!opened.ok) {
    return fail(opened.failure);
  }
  const stream = opened.value;
  const decoder = createSdkDecoder({ redact: input.redact, resumeSessionId: input.start.resume?.sessionId ?? null });
  const iterator = stream[Symbol.asyncIterator]();
  let error: { readonly value: unknown } | null = null;
  const grace = graceAfterAbort(abort.signal, input.clock, SdkProcess.KillAfterMs);
  for (;;) {
    const step = await Promise.race([nextStep(iterator), grace.expired]);
    if (step === SdkProcess.Expired) {
      await tree?.kill();
      break;
    }
    if (step.threw) {
      error = { value: step.error };
      break;
    }
    if (step.step.done === true) {
      break;
    }
    if (abort.signal.aborted) {
      continue;
    }
    for (const event of decoder.feed(step.step.value)) {
      channel.push(event);
    }
    if (decoder.storeError() !== null) {
      abort.abort();
    }
  }
  for (const event of decoder.flush()) {
    channel.push(event);
  }
  grace.stop();
  await bounded(closeStream(stream), input.clock, SdkProcess.GiveUpMs);
  progress.tree = (await tree?.reap()) ?? AgentTree.Gone;
  const stderrTail = tree?.stderrTail() ?? "";
  const mirrored = storeReason ?? decoder.storeError();
  if (mirrored !== null) {
    return fail({ kind: "store-failed", message: SdkMessage.StoreFailed, reason: input.redact(tailBytes(mirrored, FAILURE_TAIL_BYTES)) });
  }
  const final = decoder.final();
  if (final !== null) {
    if (!final.ok) {
      return fail(final.failure);
    }
    if (input.start.outputSchema !== undefined && final.output === null) {
      return fail({ kind: "no-output", message: SdkMessage.NoStructured });
    }
    return ok({ output: decoder.output(final.text, final.output, final.turns), stderrTail });
  }
  if (abort.signal.aborted) {
    return fail(cancelled());
  }
  if (error !== null) {
    return fail(thrownFailure(input, errorText(error.value, input.redact), stderrTail, decoder.assistantSeen()));
  }
  return fail({ kind: "no-output", message: SdkMessage.NoResult });
}

function plan(input: AgentRunInput, seam: ClaudeSdkSeam): Result<SdkPlan, RunFailure> {
  const built = buildQueryOptions(input, { abortController: new AbortController(), hooks: input.start.hooks === undefined ? null : {}, store: input.start.store === undefined ? null : sessionStoreAdapter(input.start.store, () => undefined), spawn: seam.query === undefined ? processTree(defaultTreeDeps(input.clock)).spawn : null });
  if (!built.ok) {
    return fail(built.failure);
  }
  const optionNames = Object.keys(built.value);
  const envNames = Object.keys(built.value.env);
  const injected = envNames.filter((name) => name === EnvVar.AnthropicApiKey || name === EnvVar.AnthropicBaseUrl || name.startsWith(SdkMcp.EnvPrefix));
  return ok({
    harness: Harness.Claude,
    engine: Engine.Sdk,
    entry: SdkPlanFacts.Entry,
    options: Object.fromEntries(optionNames.map((name) => [name, true])),
    env: { kind: "closed", inject: injected, strip: [], set: envNames },
    cwd: { kind: "given", retain: null },
    confinement: input.confinement,
    notes: [SdkPlanFacts.Note],
  });
}

/** The Claude engine for agent runs on the vendor Agent SDK; without a seam query the SDK is loaded by dynamic import at the first start. */
export function claudeSdkEngine(seam: ClaudeSdkSeam = {}): AgentEngineImpl<"claude"> {
  return {
    harness: Harness.Claude,
    describe: (input) => plan(input, seam),
    start(input): AgentEngineRun {
      const channel = createChannel<AgentEvent>();
      const abort = new AbortController();
      const link = (): void => abort.abort();
      if (input.signal.aborted) {
        abort.abort();
      } else {
        input.signal.addEventListener("abort", link, { once: true });
      }
      const progress: Progress = { tree: AgentTree.Gone };
      const done = guarded(() => execute(seam, input, abort, channel, progress)).then((result) => {
        input.signal.removeEventListener("abort", link);
        channel.close();
        return result;
      });
      return { events: channel.iterable, cancel: link, done, tree: () => progress.tree };
    },
  };
}
