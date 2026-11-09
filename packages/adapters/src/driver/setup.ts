import type { RunFailure } from "../core/failure.ts";
import type { HeadlessOptions, RunRequest } from "../core/run.ts";
import { fail, ok, type Result } from "../core/result.ts";
import type { EnvSource } from "../env.ts";
import type { RuntimeContext } from "./context.ts";
import { captureThrow } from "./execute.ts";
import { envFailure } from "./finish.ts";
import { prepare, type Prepared } from "./options.ts";
import type { HarnessDriver } from "./port.ts";

export type RunEnv = Readonly<Record<string, string>>;

export interface Setup<I extends string> {
  readonly driver: HarnessDriver<I>;
  readonly env: RunEnv;
  readonly prepared: Prepared<I>;
}

function envOf(value: unknown): Result<RunEnv, RunFailure> {
  if (typeof value !== "object" || value === null) {
    return fail(envFailure());
  }
  const out: Record<string, string> = {};
  for (const [name, item] of Object.entries(value)) {
    if (item === undefined) {
      continue;
    }
    if (typeof item !== "string") {
      return fail(envFailure());
    }
    out[name] = item;
  }
  return ok(out);
}

export function runEnv(ctx: RuntimeContext): Result<RunEnv, RunFailure> {
  const copy: EnvSource = { ...ctx.source };
  const transform = ctx.envTransform;
  if (transform === undefined) {
    return envOf(copy);
  }
  const captured = captureThrow(() => transform(copy));
  if (!captured.ok) {
    return fail(envFailure());
  }
  return envOf(captured.value);
}

export function setupRun<I extends string>(
  ctx: RuntimeContext,
  driver: HarnessDriver<I>,
  options: HeadlessOptions<I>,
  request: RunRequest,
): Result<Setup<I>, RunFailure> {
  const env = runEnv(ctx);
  if (!env.ok) {
    return fail(env.failure);
  }
  const prepared = prepare({ driver, options, request, base: env.value, cwd: ctx.cwd() });
  if (!prepared.ok) {
    return fail(prepared.failure);
  }
  return ok({ driver, env: env.value, prepared: prepared.value });
}
