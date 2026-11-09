import { Harness } from "@stateforge-labs/harness-hooks";
import { type Capabilities, CapabilityName, Engine, supported, unmeasuredSupport, unsupported, UnsupportedReason } from "../../src/core/capability.ts";
import { EvidenceKind, type EvidenceRef, measured, measuredValue, unmeasured } from "../../src/core/evidence.ts";
import { CredentialField, CredentialMode, type CredentialPlan, type CredentialPlanInput, finish, homeFailure, secretInjection, unsupportedFailure } from "../../src/core/credential-plan.ts";
import type { CredentialSpec } from "../../src/core/credential.ts";
import { CredentialUnsupportedReason, type RunFailure, UnavailableReason } from "../../src/core/failure.ts";
import type { Profile } from "../../src/core/profile.ts";
import { fail, ok, type Result } from "../../src/core/result.ts";
import { ArgvCarry } from "../../src/driver/constants.ts";
import { budgetOf, checkArgv, modelFlag, NO_USAGE, neutralOrNative, unparsable } from "../../src/driver/kit.ts";
import type { CliEngine, CredentialFacet, EngineInput, HarnessDriver, Invocation, ParsedRun, RawRun } from "../../src/driver/port.ts";

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
  cli: {
    flags: measured(["run"], EVIDENCE),
    versionArgs: measured(["--version"], EVIDENCE),
    credentialInjection: measured(true, EVIDENCE),
  },
};

export const FAKE_CAPABILITIES: Capabilities = {
  [CapabilityName.Effort]: { [Engine.Cli]: supported },
  [CapabilityName.StructuredOutput]: { [Engine.Cli]: unsupported(UnsupportedReason.NotImplemented) },
  [CapabilityName.SessionsDelete]: { [Engine.Cli]: unsupported(UnsupportedReason.NotImplemented) },
  [CapabilityName.Ephemeral]: { [Engine.Cli]: supported },
  [CapabilityName.Cost]: { [Engine.Cli]: unsupported(UnsupportedReason.HarnessLimit) },
  [CapabilityName.SettingsSources]: { [Engine.Cli]: unmeasuredSupport("does the fake honour settings sources") },
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

export const FAKE_CLI: CliEngine<"fake"> = {
  invocation: fakeInvocation,
  interpret: () => fail(unparsable("fake engine does not interpret output")),
  textOf: () => null,
  helpArgs: null,
  checkHelp: () => ok(null),
};

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
const ECHO_NO_LINE = "";

function echoTextOf(line: string): string | null {
  return line.startsWith(ECHO_PREFIX) ? line.slice(ECHO_PREFIX.length) : null;
}

function echoInterpret(raw: RawRun): Result<ParsedRun, RunFailure> {
  const streamed = raw.stdout.split("\n").map(echoTextOf).filter((text): text is string => text !== null).join(ECHO_NO_LINE);
  const text = raw.outFileText ?? streamed;
  return ok({
    text,
    usage: NO_USAGE,
    cost: { usd: null, basis: "unavailable" },
    model: null,
    sessionId: null,
    unrecognised: raw.stdout.includes("odd") ? [{ odd: true }] : [],
  });
}

export const ECHO_CLI: CliEngine<"fake"> = {
  invocation: fakeInvocation,
  interpret: echoInterpret,
  textOf: echoTextOf,
  helpArgs: null,
  checkHelp: () => ok(null),
};

export function echoDriver(): HarnessDriver<"fake"> {
  return { ...fakeDriver(), run: { engines: [Engine.Cli], cli: ECHO_CLI } };
}
