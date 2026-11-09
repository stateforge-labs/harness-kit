import type { CredentialOf, CredentialSpec } from "../core/credential.ts";
import type { RunFailure } from "../core/failure.ts";
import { ok, type Result } from "../core/result.ts";
import { CapabilityName, Engine, isUsable, SupportState } from "../core/capability.ts";
import { confine, resolveTools, type ToolPolicy } from "../core/policy.ts";
import { Hermetic, Isolation, type RunRequest } from "../core/run.ts";
import { EnvVar, type EnvSource } from "../env.ts";
import { PromptText } from "../core/engine-constants.ts";
import { CONTRACT_CWD, CONTRACT_TOOL_AXES, CONTRACT_EFFORT, CONTRACT_EXIT_CODE, CONTRACT_GARBAGE_SPECS, CONTRACT_GARBAGE_TEXT, CONTRACT_HOME, CONTRACT_OUT_FILE, CONTRACT_PLAIN_SPEC, CONTRACT_RUN_ID, ContractText, FailureKind } from "./contract-constants.ts";
import { captureThrow } from "./execute.ts";
import type { ContractFixtures } from "./contract.ts";
import { cellOf } from "./contract-checks.ts";
import type { EngineEvent } from "./engine.ts";
import { foldEnd, foldStart, foldStep } from "./fold.ts";
import type { HarnessDriver, ResolvedOptions } from "./port.ts";

function threw(captured: { readonly errorName: string }): string {
  return `${ContractText.Threw}${captured.errorName}`;
}

function contractEnv(): EnvSource {
  return { [EnvVar.Home]: CONTRACT_HOME };
}

function optionsWith(request: RunRequest, overrides: Partial<ResolvedOptions>): ResolvedOptions {
  return {
    model: request.model ?? null,
    effort: null,
    hermetic: Hermetic.None,
    persist: true,
    maxArgvBytes: request.maxArgvBytes ?? null,
    cwd: typeof request.cwd === "string" ? request.cwd : CONTRACT_CWD,
    isolation: { kind: Isolation.None },
    tools: resolveTools(undefined, undefined),
    ...overrides,
  };
}

function refusedBy(result: Result<unknown, RunFailure>, capability: CapabilityName): boolean {
  return !result.ok && result.failure.kind === FailureKind.Unsupported && result.failure.capability === capability;
}

function describeWith<I extends string>(driver: HarnessDriver<I>, credential: CredentialOf<I>, request: RunRequest, options: ResolvedOptions) {
  return captureThrow(
    () => driver.run.cli.describe?.({ options, credential, instructions: request.instructions, input: request.input, outFile: CONTRACT_OUT_FILE, runId: CONTRACT_RUN_ID }) ?? ok(null),
  );
}

interface SupportCase {
  readonly capability: CapabilityName;
  readonly options: ResolvedOptions;
}

export function supportProblems<I extends string>(driver: HarnessDriver<I>, fixtures: ContractFixtures<I>): string[] {
  const credential = fixtures.credentials[0];
  if (credential === undefined) {
    return [ContractText.NoFixture];
  }
  const request = fixtures.request;
  const cases: readonly SupportCase[] = [
    { capability: CapabilityName.Effort, options: optionsWith(request, { effort: CONTRACT_EFFORT }) },
    { capability: CapabilityName.Ephemeral, options: optionsWith(request, { persist: false }) },
  ];
  return cases.flatMap(({ capability, options }) => {
    if (driver.run.cli.describe === undefined) {
      return [];
    }
    const outcome = describeWith(driver, credential, request, options);
    if (!outcome.ok) {
      return [`${capability}: ${threw(outcome)}`];
    }
    const cell = cellOf(driver.capabilities, capability);
    const expectRefusal = cell === undefined || !isUsable(cell);
    return refusedBy(outcome.value, capability) === expectRefusal ? [] : [`${capability}: ${ContractText.GateMismatch}`];
  });
}

function credentialProblemsFor<I extends string>(driver: HarnessDriver<I>, spec: unknown): string[] {
  const plain = spec === CONTRACT_PLAIN_SPEC;
  const from = captureThrow(() => driver.credentials.from(spec as CredentialSpec));
  const plan = captureThrow(() => driver.credentials.plan({ credential: spec as CredentialOf<I>, isolation: { kind: Isolation.None }, env: contractEnv() }));
  const problems: string[] = [];
  if (!from.ok) {
    problems.push(threw(from));
  } else if (plain && from.value.ok) {
    problems.push(ContractText.PlainAccepted);
  }
  if (!plan.ok) {
    problems.push(threw(plan));
  } else if (plain && plan.value.ok) {
    problems.push(ContractText.PlainAccepted);
  }
  return problems;
}

export function credentialProblems<I extends string>(driver: HarnessDriver<I>): string[] {
  return CONTRACT_GARBAGE_SPECS.flatMap((spec) => credentialProblemsFor(driver, spec));
}

function foldedGarbage<I extends string>(driver: HarnessDriver<I>, stdout: string): Result<boolean, RunFailure> {
  let fold = foldStart();
  for (const line of stdout.split(PromptText.Line)) {
    const events: readonly EngineEvent[] = driver.run.cli.parseLine?.(line) ?? [];
    fold = events.reduce(foldStep, fold);
  }
  const end = { exit: { code: CONTRACT_EXIT_CODE, signal: null }, stderrTail: PromptText.Empty };
  return ok(foldEnd(fold, end, null).ok);
}

export function engineProblems<I extends string>(driver: HarnessDriver<I>): string[] {
  return CONTRACT_GARBAGE_TEXT.flatMap((stdout) => {
    const folded = captureThrow(() => foldedGarbage(driver, stdout));
    if (!folded.ok) {
      return [threw(folded)];
    }
    return folded.value.ok && folded.value.value ? [ContractText.NotAFailure] : [];
  });
}

function planProblemsFor<I extends string>(driver: HarnessDriver<I>, credential: CredentialOf<I>, sentinels: readonly string[]): string[] {
  const plan = captureThrow(() => driver.credentials.plan({ credential, isolation: { kind: Isolation.None }, env: contractEnv() }));
  if (!plan.ok) {
    return [threw(plan)];
  }
  if (!plan.value.ok) {
    return [ContractText.PlanFailed];
  }
  const planned = plan.value.value;
  const serialised = captureThrow(() => JSON.stringify(planned));
  if (!serialised.ok) {
    return [threw(serialised)];
  }
  return sentinels.some((sentinel) => serialised.value.includes(sentinel)) ? [ContractText.SecretLeak] : [];
}

export function fixtureProblems<I extends string>(driver: HarnessDriver<I>, fixtures: ContractFixtures<I>): string[] {
  if (fixtures.sentinels.length === 0) {
    return [ContractText.NoSentinel];
  }
  return fixtures.credentials.flatMap((credential) => planProblemsFor(driver, credential, fixtures.sentinels));
}

function strictOf(tools: ToolPolicy, strict: boolean): ToolPolicy {
  return { ...tools, strict };
}

function refusalProblems(result: Result<unknown, RunFailure>, capability: CapabilityName, expectRefusal: boolean, expectation: string): string[] {
  if (result.ok) {
    return expectRefusal ? [`${capability}: ${expectation}`] : [];
  }
  if (!expectRefusal) {
    return [`${capability}: ${expectation}`];
  }
  return refusedBy(result, capability) ? [] : [`${capability}: ${ContractText.WrongCapability}`];
}

function confineProblems<I extends string>(driver: HarnessDriver<I>, capability: CapabilityName, tools: ToolPolicy): string[] {
  const support = cellOf(driver.capabilities, capability);
  if (support === undefined) {
    return [];
  }
  const strict = confine(resolveTools(strictOf(tools, true), undefined), driver.capabilities, Engine.Cli);
  const lax = confine(resolveTools(strictOf(tools, false), undefined), driver.capabilities, Engine.Cli);
  if (support.state === SupportState.Supported) {
    return [...refusalProblems(strict, capability, false, ContractText.SupportedRefused), ...refusalProblems(lax, capability, false, ContractText.SupportedRefused)];
  }
  const laxRefused = support.state === SupportState.Unsupported;
  return [
    ...refusalProblems(strict, capability, true, ContractText.NotRefused),
    ...refusalProblems(lax, capability, laxRefused, laxRefused ? ContractText.NotRefused : ContractText.LaxRefused),
  ];
}

function engineToolsProblems<I extends string>(driver: HarnessDriver<I>, fixtures: ContractFixtures<I>, capability: CapabilityName, tools: ToolPolicy): string[] {
  const support = cellOf(driver.capabilities, capability);
  const credential = fixtures.credentials[0];
  if (support?.state !== SupportState.Supported || credential === undefined || driver.run.cli.describe === undefined) {
    return [];
  }
  const outcome = describeWith(driver, credential, fixtures.request, optionsWith(fixtures.request, { tools: resolveTools(tools, undefined) }));
  if (!outcome.ok) {
    return [`${capability}: ${threw(outcome)}`];
  }
  return refusedBy(outcome.value, capability) ? [`${capability}: ${ContractText.EngineRefusedSupported}`] : [];
}

export function gatingProblems<I extends string>(driver: HarnessDriver<I>, fixtures: ContractFixtures<I>): string[] {
  return CONTRACT_TOOL_AXES.flatMap(({ capability, tools }) => [
    ...confineProblems(driver, capability, tools),
    ...engineToolsProblems(driver, fixtures, capability, tools),
  ]);
}
