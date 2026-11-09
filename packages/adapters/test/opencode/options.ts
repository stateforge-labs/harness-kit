import { resolveTools, type ToolPolicy } from "../../src/core/policy.ts";
import type { ResolvedOptions } from "../../src/driver/port.ts";

export function opencodeOptions(over: Partial<ResolvedOptions> = {}, tools: ToolPolicy | undefined = undefined): ResolvedOptions {
  return { model: null, effort: null, persist: true, maxArgvBytes: null, cwd: "/work", tools: resolveTools(tools, undefined), ...over } as ResolvedOptions;
}
