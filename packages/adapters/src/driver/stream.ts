import { join } from "node:path";
import { Engine } from "../core/capability.ts";
import type { RunFailure } from "../core/failure.ts";
import { redactor, redactValue } from "../core/redact.ts";
import { fail, ok, type Result } from "../core/result.ts";
import { type HeadlessOptions, type RunEvent, type RunOutput, type RunRequest, SpawnPurpose } from "../core/run.ts";
import { HandleLabel, OUT_FILE_NAME } from "./constants.ts";
import { cleanupDirs, makeRunDirs, type RunDirs } from "./dirs.ts";
import { emit, engineIo, linkSignals, type LinkedSignal, nextRunId, type RuntimeContext } from "./context.ts";
import { guardSync } from "./execute.ts";
import type { EngineRunInput } from "./engine.ts";
import { foldEnd, foldStart, foldStep } from "./fold.ts";
import { redactFailure } from "./finish.ts";
import type { HarnessDriver } from "./port.ts";
import { buildOutput } from "./output.ts";
import { type Setup, setupRun } from "./setup.ts";
import { startRun } from "./start.ts";

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
  emit(ctx, { kind: "engine-selected", harness: plan.harness, engine: Engine.Cli });
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
  const located = await startRun(ctx, current, linked.signal);
  if (!located.ok) {
    return fail(located.failure);
  }
  const dirs = await makeRunDirs(ctx, current);
  if (!dirs.ok) {
    return fail(dirs.failure);
  }
  held.dirs = dirs.value;
  const scratch = dirs.value.scratch;
  const outFile = scratch === null ? "" : join(scratch, OUT_FILE_NAME);
  const built = guardSync(HandleLabel.Stream, () => prepared.build({ outFile, isolationDir: dirs.value.isolation }, nextRunId(ctx)));
  if (!built.ok) {
    return fail(built.failure);
  }
  const redact = redactor(built.value.child.secrets);
  held.redact = redact;
  const invocation = built.value.invocation;
  emit(ctx, { kind: "spawn", harness: driver.id, engine: Engine.Cli, purpose: SpawnPurpose.Run, argc: invocation.args.length });
  yield { kind: "started", engine: Engine.Cli };
  const spawnedAt = ctx.clock.now();
  const input: EngineRunInput = {
    program: located.value.path,
    invocation,
    env: built.value.child.env,
    cwd: prepared.resolved.cwd,
    signal: linked.signal,
    timeoutMs: prepared.controls.timeoutMs ?? undefined,
    limits: prepared.controls.limits,
    redact,
    requestedModel: prepared.resolved.model,
    outFile: scratch === null ? null : outFile,
  };
  const run = driver.run.cli.start(input, engineIo(ctx));
  let fold = foldStart();
  for await (const event of run.events) {
    fold = foldStep(fold, event);
    if (event.kind === "text") {
      yield { kind: "text", text: redact(event.text) };
    } else if (event.kind === "unrecognised") {
      yield { kind: "unrecognised", payload: redactValue(event.payload, redact) };
    }
  }
  const done = await run.done;
  emit(ctx, {
    kind: "exit",
    harness: driver.id,
    purpose: SpawnPurpose.Run,
    code: done.ok ? done.value.exit.code : null,
    signal: done.ok ? done.value.exit.signal : null,
    durationMs: ctx.clock.now() - spawnedAt,
    outcome: done.ok ? "ok" : done.failure.kind,
  });
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
  const output = buildOutput({ setup: current, parsed: parsed.value, started: located.value, dirs: dirs.value, child: built.value.child, redact, elapsedMs: ctx.clock.now() - startedAt });
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
