import { homedir } from "node:os";
import { join } from "node:path";
import { Dir } from "./constants.ts";

export type EnvSource = Readonly<Record<string, string | undefined>>;

export const EnvVar = {
  Home: "HOME",
  XdgDataHome: "XDG_DATA_HOME",
  XdgCacheHome: "XDG_CACHE_HOME",
  CodexHome: "CODEX_HOME",
} as const;

export interface AdapterEnv {
  readonly home: string;
  readonly xdgDataHome: string;
  readonly xdgCacheHome: string;
  readonly codexHome: string;
}

const nonEmpty = (value: string | undefined): string | undefined => (value === undefined || value === "" ? undefined : value);

export function adapterEnv(source: EnvSource = process.env): AdapterEnv {
  const home = nonEmpty(source[EnvVar.Home]) ?? homedir();
  return {
    home,
    xdgDataHome: nonEmpty(source[EnvVar.XdgDataHome]) ?? join(home, ...Dir.LocalShare),
    xdgCacheHome: nonEmpty(source[EnvVar.XdgCacheHome]) ?? join(home, Dir.Cache),
    codexHome: nonEmpty(source[EnvVar.CodexHome]) ?? join(home, Dir.Codex),
  };
}
