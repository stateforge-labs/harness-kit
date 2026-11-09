import { settle } from "./execute.ts";
import type { RuntimeContext } from "./context.ts";
import { credentialEvidence } from "./finish.ts";
import type { Setup } from "./setup.ts";
import type { RunDirs } from "./dirs.ts";
import type { Started } from "./start.ts";
import type { ParsedRun } from "./port.ts";
import { Engine } from "../core/capability.ts";
import type { RunOutput } from "../core/run.ts";
import type { ChildEnv } from "./env-plan.ts";

export async function readOutFile(ctx: RuntimeContext, path: string, maxBytes: number): Promise<string | null> {
  const read = await settle(() => ctx.fs.readText(path, maxBytes));
  return read.ok ? read.value : null;
}

export interface OutputInput<I extends string> {
  readonly setup: Setup<I>;
  readonly parsed: ParsedRun;
  readonly started: Started;
  readonly dirs: RunDirs;
  readonly child: ChildEnv;
  readonly redact: (text: string) => string;
  readonly elapsedMs: number;
}

export function buildOutput<I extends string>(input: OutputInput<I>): RunOutput {
  const { setup, parsed, started, dirs, child, redact } = input;
  const resolved = setup.prepared.resolved;
  return {
    text: redact(parsed.text),
    usage: parsed.usage,
    cost: parsed.cost,
    model: parsed.model,
    sessionId: parsed.sessionId,
    engine: Engine.Cli,
    stability: "stable",
    elapsedMs: input.elapsedMs,
    hermetic: resolved.hermetic,
    persisted: resolved.persist,
    isolationDir: dirs.retain === "keep" ? dirs.isolation : null,
    binary: { path: started.path, version: started.version, source: "installed" },
    cwd: resolved.cwd,
    credential: credentialEvidence(setup.prepared.credentialPlan, child.scrubbed),
  };
}
