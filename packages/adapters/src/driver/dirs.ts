import { type RunFailure } from "../core/failure.ts";
import { fail, ok, type Result } from "../core/result.ts";
import { Isolation } from "../core/run.ts";
import { DirKind, ISOLATION_PREFIX, PLACEHOLDER_OUT_FILE, SCRATCH_PREFIX } from "./constants.ts";
import { emit, type RuntimeContext } from "./context.ts";
import { settle } from "./execute.ts";
import { scratchFailure } from "./finish.ts";
import { createDir } from "./isolation.ts";
import type { Setup } from "./setup.ts";

export interface RunDirs {
  readonly scratch: string | null;
  readonly isolation: string | null;
  readonly retain: DirKind | null;
}

export async function makeDir(ctx: RuntimeContext, env: Readonly<Record<string, string>>, prefix: string, kind: DirKind): Promise<string | null> {
  const made = await settle(() => createDir(ctx.fs, env, prefix));
  const path = made.ok ? made.value : null;
  if (path !== null) {
    ctx.state.liveDirs.set(path, kind);
  }
  return path;
}

export async function dropDir(ctx: RuntimeContext, path: string): Promise<boolean> {
  ctx.state.liveDirs.delete(path);
  const removed = await settle(() => ctx.fs.removeTree(path));
  return removed.ok && removed.value;
}

export async function cleanupDirs(ctx: RuntimeContext, harness: string, dirs: RunDirs): Promise<void> {
  if (dirs.scratch !== null) {
    await dropDir(ctx, dirs.scratch);
  }
  if (dirs.isolation !== null && dirs.retain === DirKind.Delete) {
    await dropDir(ctx, dirs.isolation);
    emit(ctx, { kind: "isolation-removed", harness, retain: DirKind.Delete });
  }
}

export async function makeRunDirs<I extends string>(ctx: RuntimeContext, setup: Setup<I>): Promise<Result<RunDirs, RunFailure>> {
  const plan = setup.prepared.plan;
  const dirs: { scratch: string | null; isolation: string | null; retain: DirKind | null } = {
    scratch: null,
    isolation: null,
    retain: null,
  };
  const isolation = plan.isolation;
  if (isolation.kind === Isolation.PrivateHome) {
    const retain = isolation.retain === DirKind.Keep ? DirKind.Keep : DirKind.Delete;
    const path = await makeDir(ctx, setup.env, ISOLATION_PREFIX, retain);
    if (path === null) {
      return fail(scratchFailure());
    }
    dirs.isolation = path;
    dirs.retain = retain;
    emit(ctx, { kind: "isolation-created", harness: plan.harness, retain });
  }
  if (plan.args.includes(PLACEHOLDER_OUT_FILE)) {
    const path = await makeDir(ctx, setup.env, SCRATCH_PREFIX, DirKind.Scratch);
    if (path === null) {
      await cleanupDirs(ctx, plan.harness, dirs);
      return fail(scratchFailure());
    }
    dirs.scratch = path;
  }
  return ok(dirs);
}
