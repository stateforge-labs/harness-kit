import { type RunFailure } from "../core/failure.ts";
import { fail, ok, type Result } from "../core/result.ts";
import type { RuntimeContext } from "./context.ts";
import { abortedFailure, binaryMissing } from "./finish.ts";
import { locateBinary } from "./binary.ts";
import { preflight } from "./preflight.ts";
import type { Setup } from "./setup.ts";

export interface Started {
  readonly path: string;
  readonly version: string | null;
}

export async function startRun<I extends string>(ctx: RuntimeContext, setup: Setup<I>, signal: AbortSignal): Promise<Result<Started, RunFailure>> {
  if (signal.aborted) {
    return fail(abortedFailure());
  }
  const path = await locateBinary(setup.driver.profile.binary, setup.env, ctx.fs);
  if (path === null) {
    return fail(binaryMissing());
  }
  const checked = await preflight(ctx, setup, path);
  if (!checked.ok) {
    return checked;
  }
  return ok({ path, version: checked.value.version });
}
