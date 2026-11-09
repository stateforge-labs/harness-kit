import { join } from "node:path";
import { adapterEnv, type EnvSource } from "../env.ts";
import { homeFailure, presentNames } from "./credential-plan.ts";
import type { RunFailure } from "./failure.ts";
import type { RuntimeFs } from "./io.ts";
import { fail, ok, type Result } from "./result.ts";

export const InspectState = {
  Known: "known",
  Unknown: "unknown",
} as const;

export const InspectReason = {
  KeyringConfigured: "keyring-configured",
  UnsupportedPlatform: "unsupported-platform",
} as const;
export type InspectReason = (typeof InspectReason)[keyof typeof InspectReason];

export const InspectPlatform = {
  Linux: "linux",
} as const;

export const InspectLimit = {
  SettingsBytes: 65_536,
} as const;

export type CredentialInspection =
  | {
      readonly state: typeof InspectState.Known;
      readonly loginStore: { readonly present: boolean; readonly file: string };
      readonly ambientKeys: readonly string[];
    }
  | { readonly state: typeof InspectState.Unknown; readonly reason: InspectReason };

export interface InspectIo {
  readonly env: EnvSource;
  readonly fs: RuntimeFs;
  readonly platform: string;
}

export interface InspectTable {
  readonly homeVar: string;
  readonly defaultSubdir: readonly string[];
  readonly storeFile: readonly string[];
  readonly ambientNames: readonly string[];
  readonly keyringCheck: { readonly file: readonly string[]; readonly pattern: RegExp } | null;
}

function configBase(table: InspectTable, env: EnvSource): string {
  const override = env[table.homeVar];
  return override === undefined || override === "" ? join(adapterEnv(env).home, ...table.defaultSubdir) : override;
}

function unknownState(reason: InspectReason): CredentialInspection {
  return { state: InspectState.Unknown, reason };
}

export async function inspectStore(table: InspectTable, io: InspectIo): Promise<Result<CredentialInspection, RunFailure>> {
  const home = homeFailure(io.env);
  if (home !== null) {
    return fail(home);
  }
  if (io.platform !== InspectPlatform.Linux) {
    return ok(unknownState(InspectReason.UnsupportedPlatform));
  }
  const base = configBase(table, io.env);
  if (table.keyringCheck !== null) {
    const settings = await io.fs.readText(join(base, ...table.keyringCheck.file), InspectLimit.SettingsBytes);
    if (settings !== null && table.keyringCheck.pattern.test(settings)) {
      return ok(unknownState(InspectReason.KeyringConfigured));
    }
  }
  const file = join(base, ...table.storeFile);
  return ok({
    state: InspectState.Known,
    loginStore: { present: await io.fs.exists(file), file },
    ambientKeys: presentNames(io.env, table.ambientNames),
  });
}
