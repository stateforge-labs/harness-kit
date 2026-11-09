import { EnvKind, TOOLS_OFF, type EnvPolicy, type ToolPolicy } from "../src/runtime/index.ts";
import type { EnvSource } from "../src/env.ts";

export const NO_TOOLS_STRICT: ToolPolicy = { ...TOOLS_OFF, strict: true };

export const CLOSED_ENV: EnvPolicy = {
  kind: EnvKind.Closed,
  set: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8" },
  quiet: true,
};

export const WITHOUT_PREFIX: EnvPolicy = {
  kind: EnvKind.Inherit,
  transform: (env: EnvSource): EnvSource =>
    Object.fromEntries(Object.entries(env).filter(([key]) => !key.startsWith("MY_TOOL_"))),
};
