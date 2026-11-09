import { type Engine } from "../core/capability.ts";
import { SpawnPurpose } from "../core/run.ts";
import { parseVersion } from "../core/version.ts";
import { type ProbeResult, probeOutput, type VersionIo } from "./binary.ts";
import { emit, type RuntimeContext } from "./context.ts";
import { HELP_OUTPUT_BYTES, ProbeOutcome, VERSION_OUTPUT_BYTES, VERSION_PROBE_MS } from "./constants.ts";
import { settle } from "./execute.ts";

export interface ProbeScope {
  readonly harness: string;
  readonly engine: Engine;
  readonly env: Readonly<Record<string, string>>;
  readonly cwd: string;
}

const UNAVAILABLE: ProbeResult = { outcome: ProbeOutcome.Unavailable, text: "", exit: null };

async function runProbe(
  ctx: RuntimeContext,
  scope: ProbeScope,
  path: string,
  args: readonly string[],
  purpose: SpawnPurpose,
  maxBytes: number,
): Promise<ProbeResult> {
  const startedAt = ctx.clock.now();
  emit(ctx, { kind: "spawn", harness: scope.harness, engine: scope.engine, purpose, argc: args.length });
  const io: VersionIo = { spawn: ctx.runner, env: scope.env, cwd: scope.cwd, clock: ctx.clock, timeoutMs: VERSION_PROBE_MS };
  const settled = await settle(() => probeOutput(path, args, io, maxBytes));
  const probe = settled.ok ? settled.value : UNAVAILABLE;
  emit(ctx, {
    kind: "exit",
    harness: scope.harness,
    purpose,
    code: probe.exit?.code ?? null,
    signal: probe.exit?.signal ?? null,
    durationMs: ctx.clock.now() - startedAt,
    outcome: probe.outcome,
  });
  return probe;
}

function cached(
  store: Map<string, Promise<string | null>>,
  path: string,
  work: () => Promise<string | null>,
): Promise<string | null> {
  const hit = store.get(path);
  if (hit !== undefined) {
    return hit;
  }
  const pending = work();
  store.set(path, pending);
  return pending;
}

export function versionOf(ctx: RuntimeContext, scope: ProbeScope, path: string, args: readonly string[]): Promise<string | null> {
  return cached(ctx.state.versions, path, async () => {
    const probe = await runProbe(ctx, scope, path, args, SpawnPurpose.Version, VERSION_OUTPUT_BYTES);
    return probe.outcome === ProbeOutcome.Ok ? parseVersion(probe.text) : null;
  });
}

export function helpOf(ctx: RuntimeContext, scope: ProbeScope, path: string, args: readonly string[]): Promise<string | null> {
  return cached(ctx.state.helps, path, async () => {
    const probe = await runProbe(ctx, scope, path, args, SpawnPurpose.Help, HELP_OUTPUT_BYTES);
    return probe.outcome === ProbeOutcome.Ok ? probe.text : null;
  });
}
