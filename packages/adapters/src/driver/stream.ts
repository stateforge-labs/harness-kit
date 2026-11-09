import type { RunFailure } from "../core/failure.ts";
import { redactor, redactValue } from "../core/redact.ts";
import { fail, ok, type Result } from "../core/result.ts";
import { type HeadlessOptions, type RunEvent, type RunOutput, type RunRequest, SpawnPurpose } from "../core/run.ts";
import { cleanupDirs, makeRunDirs, type RunDirs } from "./dirs.ts";
import { emit, engineIo, linkSignals, type LinkedSignal, nextRunId, type RuntimeContext } from "./context.ts";
import type { EngineRunInput } from "./engine.ts";
import { foldEnd, foldStart, foldStep } from "./fold.ts";
import { redactFailure } from "./finish.ts";
import { makeHost } from "./host.ts";
import type { HarnessDriver } from "./port.ts";
import { buildOutput } from "./output.ts";
import { type Setup, setupRun } from "./setup.ts";

export interface RunHeld {
  dirs: RunDirs | null;
  redact: (text: string) => string;
  linked: LinkedSignal | null;
}

type Body = AsyncGenerator<RunEvent, Result<RunOutput, RunFailure>, undefined>;

function identity(text: string): string {
  return text;
}

function announce<I extends string>(ctx: RuntimeContext, setup: Setup<I>): void {
  const plan = setup.prepared.plan;
  emit(ctx, { kind: "engine-selected", harness: plan.harness, engine: plan.engine });
  emit(ctx, { kind: "credential-plan", harness: plan.harness, mode: setup.prepared.credentialPlan.mode, injected: plan.env.inject, stripped: plan.env.strip });
}

async function* body<I extends string>(
  ctx: RuntimeContext,
  driver: HarnessDriver<I>,
  options: HeadlessOptions<I>,
  request: RunRequest,
  held: RunHeld,
  startedAt: number,
): Body {
  const setup = setupRun(ctx, driver, options, request);
  if (!setup.ok) {
    return fail(setup.failure);
  }
  const current = setup.value;
  const prepared = current.prepared;
  announce(ctx, current);
  const linked = linkSignals(prepared.controls.signal ?? undefined, ctx.state.shutdown.signal);
  held.linked = linked;
  const dirs = await makeRunDirs(ctx, current);
  if (!dirs.ok) {
    return fail(dirs.failure);
  }
  held.dirs = dirs.value;
  const child = prepared.childEnv(dirs.value.isolation);
  const redact = redactor(child.secrets);
  held.redact = redact;
  const input: EngineRunInput<I> = {
    options: prepared.resolved,
    credential: options.credential,
    instructions: request.instructions,
    input: request.input,
    runId: nextRunId(ctx),
    profile: driver.profile,
    env: child.env,
    injected: child.injected,
    cwd: dirs.value.cwd ?? prepared.resolved.cwd,
    signal: linked.signal,
    timeoutMs: prepared.controls.timeoutMs ?? undefined,
    limits: prepared.controls.limits,
    redact,
    requestedModel: prepared.resolved.model,
    host: makeHost(ctx, current, child, dirs.value),
  };
  const run = prepared.engine.start(input, engineIo(ctx));
  let fold = foldStart();
  let spawnedAt = ctx.clock.now();
  for await (const event of run.events) {
    fold = foldStep(fold, event);
    if (event.kind === "started") {
      spawnedAt = ctx.clock.now();
      yield { kind: "started", engine: prepared.plan.engine };
    } else if (event.kind === "text") {
      yield { kind: "text", text: redact(event.text) };
    } else if (event.kind === "unrecognised") {
      yield { kind: "unrecognised", payload: redactValue(event.payload, redact) };
    }
  }
  const done = await run.done;
  if (fold.spawned) {
    emit(ctx, {
      kind: "exit",
      harness: driver.id,
      purpose: SpawnPurpose.Run,
      code: done.ok ? done.value.exit.code : null,
      signal: done.ok ? done.value.exit.signal : null,
      durationMs: ctx.clock.now() - spawnedAt,
      outcome: done.ok ? "ok" : done.failure.kind,
    });
  }
  if (!done.ok) {
    return fail(redactFailure(done.failure, redact));
  }
  const parsed = foldEnd(fold, done.value, prepared.resolved.model);
  if (!parsed.ok) {
    return fail(redactFailure(parsed.failure, redact));
  }
  if (!fold.streamed && parsed.value.text !== "") {
    yield { kind: "text", text: redact(parsed.value.text) };
  }
  const output = buildOutput({ setup: current, parsed: parsed.value, binary: done.value.binary ?? null, dirs: dirs.value, child, redact, elapsedMs: ctx.clock.now() - startedAt });
  return ok(output);
}

export async function* streamRun<I extends string>(ctx: RuntimeContext, driver: HarnessDriver<I>, options: HeadlessOptions<I>, request: RunRequest): AsyncGenerator<RunEvent> {
  const held: RunHeld = { dirs: null, redact: identity, linked: null };
  const startedAt = ctx.clock.now();
  let result: Result<RunOutput, RunFailure>;
  try {
    result = yield* body(ctx, driver, options, request, held, startedAt);
  } finally {
    held.linked?.dispose();
    if (held.dirs !== null) {
      await cleanupDirs(ctx, driver.id, held.dirs);
    }
  }
  yield { kind: "finished", result: result.ok ? result : fail(redactFailure(result.failure, held.redact)) };
}
