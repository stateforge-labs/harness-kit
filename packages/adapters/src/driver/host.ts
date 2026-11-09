import { measuredValue } from "../core/evidence.ts";
import { fail, ok, type Result } from "../core/result.ts";
import { EnvKind } from "../core/policy.ts";
import type { RunFailure } from "../core/failure.ts";
import { locateBinary } from "./binary.ts";
import { emit, type RuntimeContext } from "./context.ts";
import { type RunDirs, makeScratch } from "./dirs.ts";
import type { EngineHost } from "./engine.ts";
import { type ChildEnv, probeEnv } from "./env-plan.ts";
import { versionRejected } from "./finish.ts";
import { helpOf, type ProbeScope, versionOf } from "./probe.ts";
import type { Setup } from "./setup.ts";

function scopeOf<I extends string>(ctx: RuntimeContext, setup: Setup<I>, child: ChildEnv, cwd: string): ProbeScope {
  const prepared = setup.prepared;
  const closed = prepared.plan.env.kind === EnvKind.Closed;
  const env = closed
    ? Object.fromEntries(Object.entries(child.env).filter(([, value]) => !child.secrets.includes(value)))
    : probeEnv(ctx.source, prepared.credentialPlan.strip, prepared.nestedEnv);
  return { harness: setup.driver.id, engine: prepared.plan.engine, env, cwd };
}

export function makeHost<I extends string>(ctx: RuntimeContext, setup: Setup<I>, child: ChildEnv, dirs: RunDirs): EngineHost {
  const scope = scopeOf(ctx, setup, child, dirs.cwd ?? setup.prepared.resolved.cwd);
  return {
    emit: (event) => emit(ctx, event),
    locate: (program) => locateBinary(program, child.env, ctx.fs),
    async version(path): Promise<Result<string | null, RunFailure>> {
      const versionArgs = measuredValue(setup.driver.profile.cli.versionArgs);
      const version = versionArgs === null ? null : await versionOf(ctx, scope, path, versionArgs);
      const accepted = setup.prepared.controls.acceptVersions;
      if (accepted !== null && (version === null || !accepted.includes(version))) {
        return fail(versionRejected());
      }
      return ok(version);
    },
    help: (path, args) => helpOf(ctx, scope, path, args),
    scratch: () => makeScratch(ctx, setup.env, dirs),
  };
}
