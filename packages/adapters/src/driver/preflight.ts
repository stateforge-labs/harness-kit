import { Engine } from "../core/capability.ts";
import { measuredValue } from "../core/evidence.ts";
import type { RunFailure } from "../core/failure.ts";
import { fail, ok, type Result } from "../core/result.ts";
import { probeEnv } from "./env-plan.ts";
import type { RuntimeContext } from "./context.ts";
import { helpUnavailable, versionRejected } from "./finish.ts";
import { helpOf, type ProbeScope, versionOf } from "./probe.ts";
import type { Setup } from "./setup.ts";

export interface Preflight {
  readonly version: string | null;
}

function scopeOf<I extends string>(ctx: RuntimeContext, setup: Setup<I>): ProbeScope {
  const nested = measuredValue(setup.driver.profile.nestedEnv) ?? [];
  return {
    harness: setup.driver.id,
    engine: Engine.Cli,
    env: probeEnv(ctx.source, setup.prepared.credentialPlan.strip, nested),
    cwd: setup.prepared.resolved.cwd,
  };
}

export async function preflight<I extends string>(ctx: RuntimeContext, setup: Setup<I>, path: string): Promise<Result<Preflight, RunFailure>> {
  const scope = scopeOf(ctx, setup);
  const versionArgs = measuredValue(setup.driver.profile.cli.versionArgs);
  const version = versionArgs === null ? null : await versionOf(ctx, scope, path, versionArgs);
  const accepted = setup.prepared.controls.acceptVersions;
  if (accepted !== null && (version === null || !accepted.includes(version))) {
    return fail(versionRejected());
  }
  const helpArgs = setup.prepared.engine.helpArgs;
  if (helpArgs !== null) {
    const help = await helpOf(ctx, scope, path, helpArgs);
    if (help === null) {
      return fail(helpUnavailable());
    }
    const checked = setup.prepared.engine.checkHelp(help);
    if (!checked.ok) {
      return fail(checked.failure);
    }
  }
  return ok({ version });
}
