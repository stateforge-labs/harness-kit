import { resolveTools, TOOLS_DEFAULT, type ToolPolicy } from "../../src/core/policy.ts";
import type { ResolvedOptions } from "../../src/driver/port.ts";

export function opencodeOptions(over: Partial<ResolvedOptions> = {}, tools: ToolPolicy = TOOLS_DEFAULT): ResolvedOptions {
  return { model: null, effort: null, persist: true, maxArgvBytes: null, cwd: "/work", tools: resolveTools(tools, undefined), ...over } as ResolvedOptions;
}
