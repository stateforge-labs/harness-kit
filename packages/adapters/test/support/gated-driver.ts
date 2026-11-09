import { type Capabilities, CapabilityName, Engine, unmeasuredSupport } from "../../src/core/capability.ts";
import { unmeasured } from "../../src/core/evidence.ts";
import type { CredentialSpec } from "../../src/core/credential.ts";
import { CredentialField, CredentialMode, type CredentialPlan, type CredentialPlanInput, finish, homeFailure, secretInjection, secretOf } from "../../src/core/credential-plan.ts";
import { credentialFromSpec } from "../../src/core/credential-from.ts";
import { type RunFailure, UnavailableReason } from "../../src/core/failure.ts";
import type { Profile } from "../../src/core/profile.ts";
import { fail, ok, type Result } from "../../src/core/result.ts";
import { ArgvCarry } from "../../src/driver/constants.ts";
import { gatesFor, unparsable } from "../../src/driver/kit.ts";
import type { CredentialFacet, EngineInput, HarnessDriver, Invocation } from "../../src/driver/port.ts";
import { FAKE_CAPABILITIES, FAKE_INJECT, FAKE_PROFILE, FAKE_STRIP } from "./fake-driver.ts";

export const GATED_ID = "gated";

const GATED_PROFILE: Profile = {
  ...FAKE_PROFILE,
  isolation: { ...FAKE_PROFILE.isolation, worksHeadless: unmeasured("is a headless private home measured for the gated fake?") },
};

const GATED_CAPABILITIES: Capabilities = {
  ...FAKE_CAPABILITIES,
  [CapabilityName.SettingsSources]: { [Engine.Cli]: unmeasuredSupport("does the gated fake honour settings sources?") },
};

function gatedFrom(spec: unknown): Result<CredentialSpec, RunFailure> {
  return credentialFromSpec<typeof GATED_ID>(
    [CredentialMode.ApiKey],
    (value) => {
      const key = secretOf(value.key, CredentialField.Key);
      return key.ok ? ok(value) : fail(key.failure);
    },
    spec,
  );
}

function gatedPlan(input: CredentialPlanInput<typeof GATED_ID>): Result<CredentialPlan, RunFailure> {
  const home = homeFailure(input.env);
  if (home !== null) {
    return fail(home);
  }
  const checked = gatedFrom(input.credential);
  if (!checked.ok) {
    return fail(checked.failure);
  }
  return finish(CredentialMode.ApiKey, [FAKE_STRIP], secretInjection(checked.value.key, CredentialField.Key, FAKE_INJECT), null);
}

const GATED_CREDENTIALS: CredentialFacet<typeof GATED_ID> = {
  modes: [CredentialMode.ApiKey],
  from: gatedFrom,
  plan: gatedPlan,
  policyNotice: () => null,
  inspect: () => Promise.resolve(fail<RunFailure>({ kind: "unavailable", message: "gated inspect", reason: UnavailableReason.InternalError })),
};

function gatedInvocation(input: EngineInput<typeof GATED_ID>): Result<Invocation, RunFailure> {
  const refusal = gatesFor(GATED_CAPABILITIES, input.options);
  if (refusal !== null) {
    return fail(refusal);
  }
  return ok({ program: FAKE_PROFILE.binary, args: ["run"], stdin: input.input, outFile: input.outFile, argvCarries: [ArgvCarry.Instructions] });
}

export function gatedDriver(): HarnessDriver<typeof GATED_ID> {
  return {
    id: GATED_ID,
    profile: GATED_PROFILE,
    capabilities: GATED_CAPABILITIES,
    credentials: GATED_CREDENTIALS,
    run: {
      engines: [Engine.Cli],
      cli: {
        invocation: gatedInvocation,
        interpret: () => fail(unparsable("gated engine does not interpret output")),
        textOf: () => null,
        helpArgs: null,
        checkHelp: () => ok(null),
      },
    },
  };
}
