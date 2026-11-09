import { Engine } from "../core/capability.ts";
import { CredentialMode } from "../core/credential-plan.ts";
import { CostBasis } from "../core/engine-constants.ts";
import type { Cost, RunOutput } from "../core/run.ts";
import type { RunDirs } from "./dirs.ts";
import type { BinaryFacts } from "./engine.ts";
import type { ChildEnv } from "./env-plan.ts";
import { credentialEvidence } from "./finish.ts";
import type { ParsedRun } from "./port.ts";
import type { Setup } from "./setup.ts";
import { settle } from "./execute.ts";
import type { RuntimeContext } from "./context.ts";

export async function readOutFile(ctx: RuntimeContext, path: string, maxBytes: number): Promise<string | null> {
  const read = await settle(() => ctx.fs.readText(path, maxBytes));
  return read.ok ? read.value : null;
}

export interface OutputInput<I extends string> {
  readonly setup: Setup<I>;
  readonly parsed: ParsedRun;
  readonly binary: BinaryFacts | null;
  readonly dirs: RunDirs;
  readonly child: ChildEnv;
  readonly redact: (text: string) => string;
  readonly elapsedMs: number;
}

export function costOf(cost: Cost, mode: string): Cost {
  return cost.basis === CostBasis.List && mode === CredentialMode.ApiKey ? { usd: cost.usd, basis: CostBasis.Billed } : cost;
}

export function buildOutput<I extends string>(input: OutputInput<I>): RunOutput {
  const { setup, parsed, binary, dirs, child, redact } = input;
  const prepared = setup.prepared;
  const resolved = prepared.resolved;
  return {
    text: redact(parsed.text),
    usage: parsed.usage,
    cost: costOf(parsed.cost, prepared.credentialPlan.mode),
    model: parsed.model,
    sessionId: parsed.sessionId,
    engine: prepared.plan.engine,
    stability: "stable",
    elapsedMs: input.elapsedMs,
    hermetic: resolved.hermetic,
    persisted: resolved.persist,
    isolationDir: dirs.retain === "keep" ? dirs.isolation : null,
    binary: { path: binary?.path ?? setup.driver.profile.binary, version: binary?.version ?? null, source: "installed" },
    cwd: dirs.cwd ?? resolved.cwd,
    credential: credentialEvidence(prepared.credentialPlan, child.scrubbed),
    confinement: prepared.confinement,
  };
}
