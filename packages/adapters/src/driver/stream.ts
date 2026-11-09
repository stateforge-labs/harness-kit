import { join } from "node:path";
import { Engine } from "../core/capability.ts";
import type { RunFailure } from "../core/failure.ts";
import { redactor, redactValue } from "../core/redact.ts";
import { fail, ok, type Result } from "../core/result.ts";
import { type HeadlessOptions, type RunEvent, type RunOutput, type RunRequest, SpawnPurpose } from "../core/run.ts";
import { HandleLabel, OUT_FILE_NAME } from "./constants.ts";
import { cleanupDirs, makeRunDirs, type RunDirs } from "./dirs.ts";
import { emit, linkSignals, type LinkedSignal, type RuntimeContext } from "./context.ts";
import { guardSync } from "./execute.ts";
import { redactFailure } from "./finish.ts";
import type { HarnessDriver, RawRun } from "./port.ts";
import { buildOutput, readOutFile } from "./output.ts";
import { pumpRun, type Progress } from "./pump.ts";
import { type Setup, setupRun } from "./setup.ts";
import { startRun } from "./start.ts";
import type { SuperviseInput } from "./supervise.ts";

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
  const built = guardSync(HandleLabel.Stream, () => prepared.build({ outFile, isolationDir: dirs.value.isolation }));
  if (!built.ok) {
    return fail(built.failure);
  }
  const redact = redactor(built.value.child.secrets);
  held.redact = redact;
  const invocation = built.value.invocation;
  emit(ctx, { kind: "spawn", harness: driver.id, engine: Engine.Cli, purpose: SpawnPurpose.Run, argc: invocation.args.length });
  yield { kind: "started", engine: Engine.Cli };
  const spawnedAt = ctx.clock.now();
  const input: SuperviseInput = {
    runner: ctx.runner,
    spec: { program: located.value.path, args: invocation.args, env: built.value.child.env, cwd: prepared.resolved.cwd, stdin: invocation.stdin },
    signal: linked.signal,
    timeoutMs: prepared.controls.timeoutMs ?? undefined,
    limits: prepared.controls.limits,
    clock: ctx.clock,
    redact,
  };
  const progress: Progress = { streamed: false };
  const done = yield* pumpRun(input, driver.run.cli, progress);
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
  const outFileText = scratch === null ? null : await readOutFile(ctx, outFile, prepared.controls.limits.maxStdoutBytes);
  const raw: RawRun = { stdout: done.value.stdout, stderrTail: done.value.stderrTail, exit: done.value.exit, outFileText, requestedModel: prepared.resolved.model };
  const parsed = guardSync(HandleLabel.Stream, () => driver.run.cli.interpret(raw));
  if (!parsed.ok) {
    return fail(redactFailure(parsed.failure, redact));
  }
  for (const payload of parsed.value.unrecognised) {
    yield { kind: "unrecognised", payload: redactValue(payload, redact) };
  }
  if (!progress.streamed && parsed.value.text !== "") {
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
