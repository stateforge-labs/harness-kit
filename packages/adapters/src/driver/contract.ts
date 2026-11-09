import type { CredentialOf } from "../core/credential.ts";
import type { RunRequest } from "../core/run.ts";
import { ContractCheckName, ContractText } from "./contract-constants.ts";
import { captureThrow } from "./execute.ts";
import { capabilityProblems, profileEvidenceProblems, profileFieldProblems } from "./contract-checks.ts";
import { credentialProblems, engineProblems, fixtureProblems, supportProblems } from "./contract-probes.ts";
import type { HarnessDriver } from "./port.ts";

export interface ContractCheck {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

export interface ContractFixtures<I extends string> {
  readonly credentials: readonly CredentialOf<I>[];
  readonly request: RunRequest;
  readonly sentinels: readonly string[];
}

function runCheck(name: ContractCheckName, work: () => readonly string[]): ContractCheck {
  const captured = captureThrow(work);
  if (!captured.ok) {
    return { name, ok: false, detail: `${ContractText.Threw}${captured.errorName}` };
  }
  const problems = captured.value;
  return { name, ok: problems.length === 0, detail: problems.length === 0 ? ContractText.Pass : problems.join(ContractText.Separator) };
}

export function driverContract<I extends string>(driver: HarnessDriver<I>, fixtures: ContractFixtures<I>): readonly ContractCheck[] {
  return [
    runCheck(ContractCheckName.ProfileEvidence, () => profileEvidenceProblems(driver.profile)),
    runCheck(ContractCheckName.CapabilityCells, () => capabilityProblems(driver.capabilities)),
    runCheck(ContractCheckName.SupportBehaviour, () => supportProblems(driver, fixtures)),
    runCheck(ContractCheckName.CredentialGarbage, () => credentialProblems(driver)),
    runCheck(ContractCheckName.EngineGarbage, () => engineProblems(driver)),
    runCheck(ContractCheckName.ProfileFields, () => profileFieldProblems(driver.profile)),
    runCheck(ContractCheckName.FixturePlanSecrets, () => fixtureProblems(driver, fixtures)),
  ];
}

