import type { Capabilities } from "../../src/core/capability.ts";
import type { PolicyNotice } from "../../src/core/credential.ts";
import type { CliEngineParts } from "../../src/driver/engine.ts";
import type { CredentialFacet, HarnessDriver } from "../../src/driver/port.ts";
import { echoDriver, echoEngine } from "./fake-driver.ts";

export const HELP_ARGS: readonly string[] = ["--help"];
export const HELP_TEXT = "fake-cli help\n";
export const NOTICE: PolicyNotice = { harness: "claude", mode: "token", quotes: [], retrievedAt: "2026-11-09" };

export interface DriverPatch {
  readonly cli?: Partial<CliEngineParts<"fake">>;
  readonly capabilities?: Capabilities;
  readonly credentials?: Partial<CredentialFacet<"fake">>;
}

export function driverWith(patch: DriverPatch): HarnessDriver<"fake"> {
  const base = echoDriver();
  return {
    ...base,
    capabilities: patch.capabilities ?? base.capabilities,
    credentials: { ...base.credentials, ...patch.credentials },
    run: { engines: base.run.engines, cli: echoEngine(patch.cli) },
  };
}
