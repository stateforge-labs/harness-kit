import type { HarnessId } from "@stateforge-labs/harness-hooks";
import type { Measured, Suggested } from "./evidence.ts";

export interface Profile {
  readonly id: HarnessId;
  readonly binary: string;
  readonly nestedEnv: Measured<readonly string[]>;
  readonly model: { readonly syntax: Measured<string> };
  readonly effort: { readonly accepted: Measured<readonly string[]> };
  readonly suggested: { readonly headlessModel: Suggested<string> | null };
  readonly limits: { readonly maxArgvBytes: Measured<number>; readonly maxArgBytes: Measured<number> };
  readonly isolation: { readonly homeVar: Measured<string>; readonly worksHeadless: Measured<boolean> };
  readonly cli: {
    readonly flags: Measured<readonly string[]>;
    readonly versionArgs: Measured<readonly string[]>;
    readonly credentialInjection: Measured<boolean>;
  };
}

export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const member of Object.values(value)) {
      deepFreeze(member);
    }
  }
  return value;
}
