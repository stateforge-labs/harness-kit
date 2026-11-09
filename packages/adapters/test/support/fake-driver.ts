import { Harness } from "@stateforge-labs/harness-hooks";
import { type Capabilities, CapabilityName, cell, Engine, SDK_NOT_BUILT, supported, unmeasuredSupport, unsupported, UnsupportedReason } from "../../src/core/capability.ts";
import { EvidenceKind, type EvidenceRef, measured, measuredValue, unmeasured } from "../../src/core/evidence.ts";
import { CredentialField, CredentialMode, type CredentialPlan, type CredentialPlanInput, finish, homeFailure, secretInjection, unsupportedFailure } from "../../src/core/credential-plan.ts";
import type { CredentialSpec } from "../../src/core/credential.ts";
import { CredentialUnsupportedReason, type RunFailure, UnavailableReason } from "../../src/core/failure.ts";
import type { Profile } from "../../src/core/profile.ts";
import { fail, ok, type Result } from "../../src/core/result.ts";
import { ArgvCarry } from "../../src/core/engine-constants.ts";
import { budgetOf, checkArgv, modelFlag, neutralOrNative, unparsable } from "../../src/core/kit.ts";
import type { AfterContext, CliEngine, CliEngineParts, EngineEvent } from "../../src/driver/engine.ts";
import { cliEngine } from "../../src/engine/cli.ts";
import type { CredentialFacet, EngineInput, HarnessDriver, Invocation } from "../../src/driver/port.ts";

export const FAKE_STRIP = "FAKE_KEY";
export const FAKE_INJECT = "FAKE_KEY_INJECTED";
export const FAKE_HOME = "FAKE_HOME";
export const FAKE_NESTED = "FAKE_NESTED";
export const FAKE_ARGV_BUDGET = 4096;
export const FAKE_ARG_BUDGET = 2048;

const EVIDENCE: EvidenceRef = { kind: EvidenceKind.Shipped, ref: "test-fake-driver", harnessVersion: null, capturedAt: "2026-11-09" };

export const FAKE_PROFILE: Profile = {
  id: Harness.Codex,
  binary: "fake-cli",
  nestedEnv: measured([FAKE_NESTED], EVIDENCE),
  model: { syntax: measured("name", EVIDENCE) },
  effort: { accepted: measured(["low", "medium", "high"], EVIDENCE) },
  suggested: { headlessModel: null },
  limits: { maxArgvBytes: measured(FAKE_ARGV_BUDGET, EVIDENCE), maxArgBytes: measured(FAKE_ARG_BUDGET, EVIDENCE) },
  isolation: { homeVar: measured(FAKE_HOME, EVIDENCE), worksHeadless: unmeasured("headless private home is not measured") },
  quiet: unmeasured("which variables does the fake need to stay quiet?"),
  cli: {
    flags: measured(["run"], EVIDENCE),
    versionArgs: measured(["--version"], EVIDENCE),
    credentialInjection: measured(true, EVIDENCE),
  },
};

export const FAKE_CAPABILITIES: Capabilities = {
  [CapabilityName.Effort]: cell(supported),
  [CapabilityName.StructuredOutput]: cell(unsupported(UnsupportedReason.NotImplemented)),
  [CapabilityName.SessionsDelete]: cell(unsupported(UnsupportedReason.NotImplemented)),
  [CapabilityName.Ephemeral]: cell(supported),
  [CapabilityName.Cost]: cell(unsupported(UnsupportedReason.HarnessLimit)),
  [CapabilityName.SettingsSources]: cell(unmeasuredSupport("does the fake honour settings sources")),
  [CapabilityName.BuiltinToolsOff]: cell(supported),
  [CapabilityName.McpNone]: cell(supported),
  [CapabilityName.McpAllowlist]: cell(unsupported(UnsupportedReason.EngineLimit)),
  [CapabilityName.ClosedEnv]: cell(supported),
  [CapabilityName.BaseUrl]: cell(supported),
  [CapabilityName.Resume]: cell(SDK_NOT_BUILT),
  [CapabilityName.ResumeCheckpoint]: cell(SDK_NOT_BUILT),
  [CapabilityName.PerTurnUsage]: cell(SDK_NOT_BUILT),
  [CapabilityName.UnknownToolDetection]: cell(SDK_NOT_BUILT),
  [CapabilityName.SessionStore]: cell(SDK_NOT_BUILT),
};

export function fakeCredentialPlan(input: CredentialPlanInput<"fake">): Result<CredentialPlan, RunFailure> {
  const home = homeFailure(input.env);
  if (home !== null) {
    return fail(home);
  }
  const spec: CredentialSpec = input.credential;
  if (spec.mode !== CredentialMode.ApiKey) {
    return fail(unsupportedFailure(spec.mode, CredentialUnsupportedReason.UnknownMode));
  }
  return finish(spec.mode, [FAKE_STRIP], secretInjection(spec.key, CredentialField.Key, FAKE_INJECT), null);
}

export const FAKE_CREDENTIALS: CredentialFacet<"fake"> = {
  modes: [CredentialMode.ApiKey],
  from: (spec) => ok(spec),
  plan: fakeCredentialPlan,
  policyNotice: () => null,
  inspect: () => Promise.resolve(fail<RunFailure>({ kind: "unavailable", message: "fake inspect", reason: UnavailableReason.InternalError })),
};

function fakeInvocation(input: EngineInput<"fake">): Result<Invocation, RunFailure> {
  const effort = neutralOrNative(input.options.effort, measuredValue(FAKE_PROFILE.effort.accepted));
  if (!effort.ok) {
    return fail(effort.failure);
  }
  const extra = effort.value === null ? [] : ["--effort", effort.value];
  const args = ["run", ...modelFlag("--model", input.options.model), ...extra, "--out", input.outFile, "--instructions", input.instructions];
  const tooBig = checkArgv(args, budgetOf(input.options, FAKE_PROFILE));
  if (tooBig !== null) {
    return fail(tooBig);
  }
  return ok({ program: FAKE_PROFILE.binary, args, stdin: input.input, outFile: input.outFile, argvCarries: [ArgvCarry.Instructions] });
}

export const FAKE_CLI: CliEngine<"fake"> = cliEngine<"fake">({
  invocation: fakeInvocation,
  parseLine: () => [],
  after: () => Promise.resolve([{ kind: "failure", failure: unparsable("fake engine does not interpret output") }]),
});

export function fakeDriver(): HarnessDriver<"fake"> {
  return {
    id: "fake",
    profile: FAKE_PROFILE,
    capabilities: FAKE_CAPABILITIES,
    credentials: FAKE_CREDENTIALS,
    run: { engines: [Engine.Cli], cli: FAKE_CLI },
  };
}

export const ECHO_PREFIX = "text:";

function echoLine(line: string): readonly EngineEvent[] {
  const text = line.startsWith(ECHO_PREFIX) ? [{ kind: "text" as const, text: line.slice(ECHO_PREFIX.length) }] : [];
  const odd = line.includes("odd") ? [{ kind: "unrecognised" as const, payload: { odd: true } }] : [];
  return [...text, ...odd];
}

function echoAfter(ctx: AfterContext): Promise<readonly EngineEvent[]> {
  const final = ctx.outFileText === null ? [] : [{ kind: "final" as const, text: ctx.outFileText }];
  return Promise.resolve([{ kind: "cost", cost: { usd: null, basis: "unavailable" } }, ...final]);
}

export function echoEngine(overrides: Partial<CliEngineParts<"fake">> = {}): CliEngine<"fake"> {
  return cliEngine<"fake">({ invocation: fakeInvocation, parseLine: echoLine, after: echoAfter, ...overrides });
}

export const ECHO_CLI: CliEngine<"fake"> = echoEngine();

export function echoDriver(): HarnessDriver<"fake"> {
  return { ...fakeDriver(), run: { engines: [Engine.Cli], cli: ECHO_CLI } };
}
