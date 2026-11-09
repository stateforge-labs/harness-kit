import { Harness } from "@stateforge-labs/harness-hooks";
import { Engine } from "../core/capability.ts";
import { presentNames, type CredentialPlan } from "../core/credential-plan.ts";
import { EngineMessage, EnvField, NO_HOME_VAR, PLACEHOLDER_OUT_FILE, PlanNote } from "./constants.ts";
import { type ChildEnv, buildChildEnv } from "./env-plan.ts";
import type { EnvSource } from "../env.ts";
import { fail, ok, type Result } from "../core/result.ts";
import type { RunFailure } from "../core/failure.ts";
import { argvBytes, envBytes } from "../core/limits.ts";
import { measuredValue } from "../core/evidence.ts";
import { type HeadlessOptions, type IsolationSpec, type Limits, Isolation, Hermetic, type Plan, type RunRequest } from "../core/run.ts";
import { CredentialMode } from "../core/credential-plan.ts";
import { budgetOf, gatesFor } from "./kit.ts";
import { mergeOptions } from "./options-merge.ts";
import type { CliEngine, HarnessDriver, Invocation, ResolvedOptions } from "./port.ts";

export interface BuildPaths {
  readonly outFile: string;
  readonly isolationDir: string | null;
}

export interface BuiltRun {
  readonly invocation: Invocation;
  readonly child: ChildEnv;
}

export interface RunControls {
  readonly timeoutMs: number | null;
  readonly signal: AbortSignal | null;
  readonly limits: Limits;
  readonly acceptVersions: readonly string[] | null;
}

export interface Prepared<I extends string> {
  readonly plan: Plan;
  readonly resolved: ResolvedOptions;
  readonly credentialPlan: CredentialPlan;
  readonly engine: CliEngine<I>;
  readonly request: RunRequest;
  readonly controls: RunControls;
  build(paths: BuildPaths): Result<BuiltRun, RunFailure>;
}

export interface PrepareDeps<I extends string> {
  readonly driver: HarnessDriver<I>;
  readonly options: HeadlessOptions<I>;
  readonly request: RunRequest;
  readonly base: EnvSource;
  readonly cwd: string;
}

function byteLength(text: string | null): number {
  return text === null ? 0 : new TextEncoder().encode(text).byteLength;
}

function userSettingsOpen(harness: string, mode: string, hermetic: string): boolean {
  return harness === Harness.Claude && hermetic !== Hermetic.Full && (mode === CredentialMode.ApiKey || mode === CredentialMode.Cloud);
}

function planNotes(harness: string, mode: string, hermetic: string, argvCarries: readonly string[], isolation: IsolationSpec, injected: readonly string[]): string[] {
  const notes: string[] = [];
  if (argvCarries.length > 0) {
    notes.push(PlanNote.ArgvExposure);
  }
  if (userSettingsOpen(harness, mode, hermetic)) {
    notes.push(PlanNote.ClaudeSettingsMayOverride, PlanNote.ClaudeApiKeyHelperUnmeasured);
  }
  if (harness === Harness.OpenCode && injected.length > 0) {
    notes.push(PlanNote.OpencodeInjectionUnmeasured);
  }
  notes.push(PlanNote.EnvBytesNotCounted);
  if (isolation.kind === Isolation.PrivateHome) {
    notes.push(PlanNote.IsolationHeadlessUnmeasured);
  }
  return notes;
}

export function prepare<I extends string>(deps: PrepareDeps<I>): Result<Prepared<I>, RunFailure> {
  const merged = mergeOptions(deps.options, deps.request, deps.cwd);
  if (!merged.ok) {
    return fail(merged.failure);
  }
  const m = merged.value;
  const credential = deps.options.credential;
  const credentialPlan = deps.driver.credentials.plan({ credential, isolation: m.isolation, env: deps.base });
  if (!credentialPlan.ok) {
    return fail(credentialPlan.failure);
  }
  const resolved: ResolvedOptions = {
    model: m.model,
    effort: m.effort,
    hermetic: m.hermetic,
    persist: m.persist,
    maxArgvBytes: m.maxArgvBytes,
    cwd: m.cwd,
    isolation: m.isolation,
  };
  const gate = gatesFor(deps.driver.capabilities, resolved);
  if (gate !== null) {
    return fail(gate);
  }
  const engine = deps.driver.run.cli;
  const request = deps.request;
  const planned = engine.invocation({ options: resolved, credential, instructions: request.instructions, input: request.input, outFile: PLACEHOLDER_OUT_FILE });
  if (!planned.ok) {
    return fail(planned.failure);
  }
  const homeVar = measuredValue(deps.driver.profile.isolation.homeVar) ?? NO_HOME_VAR;
  const nestedEnv = measuredValue(deps.driver.profile.nestedEnv) ?? [];
  const privateHome = m.isolation.kind === Isolation.PrivateHome && homeVar !== NO_HOME_VAR;
  const injected = Object.keys(credentialPlan.value.inject);
  const plan: Plan = {
    harness: deps.driver.id,
    engine: Engine.Cli,
    binary: deps.driver.profile.binary,
    args: planned.value.args,
    stdinBytes: byteLength(planned.value.stdin),
    argvCarries: planned.value.argvCarries,
    env: { inject: injected, strip: presentNames(deps.base, credentialPlan.value.strip), set: privateHome ? [homeVar] : [] },
    options: { model: m.model, effort: m.effort, hermetic: m.hermetic, persist: m.persist, maxArgvBytes: m.maxArgvBytes, timeoutMs: m.timeoutMs, cwd: m.cwd, limits: m.limits, acceptVersions: m.acceptVersions },
    layers: m.layers,
    isolation: m.isolation,
    notes: planNotes(deps.driver.id, credentialPlan.value.mode, m.hermetic, planned.value.argvCarries, m.isolation, injected),
  };
  const build = (paths: BuildPaths): Result<BuiltRun, RunFailure> => {
    const invocation = engine.invocation({ options: resolved, credential, instructions: request.instructions, input: request.input, outFile: paths.outFile });
    if (!invocation.ok) {
      return fail(invocation.failure);
    }
    const child = buildChildEnv({
      base: deps.base,
      plan: credentialPlan.value,
      nestedEnv,
      homeVar,
      isolationDir: privateHome ? paths.isolationDir : null,
    });
    const budget = budgetOf(resolved, deps.driver.profile);
    const total = argvBytes(invocation.value.args) + envBytes(child.env);
    if (budget.total !== null && total > budget.total) {
      return fail({ kind: "too-large", message: EngineMessage.EnvTooLarge, limitBytes: budget.total, actualBytes: total, field: EnvField.Environment });
    }
    return ok({ invocation: invocation.value, child });
  };
  return ok({
    plan,
    resolved,
    credentialPlan: credentialPlan.value,
    engine,
    request,
    controls: { timeoutMs: m.timeoutMs, signal: m.signal, limits: m.limits, acceptVersions: m.acceptVersions },
    build,
  });
}
