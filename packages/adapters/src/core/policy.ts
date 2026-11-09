import { type Capabilities, type CapabilityName, CapabilityName as Capability, type Engine, Engine as EngineName, SupportState, supportWhy, type Support } from "./capability.ts";
import { EngineMessage } from "./engine-constants.ts";
import type { RunFailure } from "./failure.ts";
import { fail, ok, type Result } from "./result.ts";
import type { Secret } from "./secret.ts";
import type { EnvSource } from "../env.ts";

export const ToolSetting = { Off: "off", None: "none", HarnessDefault: "harness-default" } as const;
export const EnvKind = { Inherit: "inherit", Closed: "closed" } as const;
export const ConfinementAxis = { Builtins: "builtins", Mcp: "mcp", Settings: "settings" } as const;
export type Axis = (typeof ConfinementAxis)[keyof typeof ConfinementAxis];

export const McpWhy = {
  BearerNotInArgv: "bearer-never-in-argv",
  CliCannotHostEndpoint: "cli-engine-has-no-mcp-endpoint",
} as const;

const ENDPOINT_NAME_SEPARATOR = ",";

/** One MCP endpoint a run may use. */
export interface McpEndpoint {
  readonly name: string;
  readonly url: string;
  readonly bearer: Secret | null;
  readonly allow: readonly string[];
}

/** Which tools, MCP endpoints and settings a run may use. */
export interface ToolPolicy {
  readonly builtins: "off" | "harness-default";
  readonly mcp: "harness-default" | readonly McpEndpoint[];
  readonly settings: "none" | "harness-default";
  readonly strict?: boolean;
}

export type ResolvedTools = Required<ToolPolicy>;

export const TOOLS_OFF: ToolPolicy = { builtins: ToolSetting.Off, mcp: [], settings: ToolSetting.None, strict: false };
export const TOOLS_DEFAULT: ToolPolicy = { builtins: ToolSetting.HarnessDefault, mcp: ToolSetting.HarnessDefault, settings: ToolSetting.HarnessDefault, strict: false };
export const DEFAULT_TOOLS: ToolPolicy = TOOLS_DEFAULT;

/** How the child process environment is built. */
export type EnvPolicy =
  | { readonly kind: "inherit"; readonly transform?: (env: EnvSource) => EnvSource }
  | { readonly kind: "closed"; readonly set: Readonly<Record<string, string | Secret>>; readonly quiet?: boolean };

export const DEFAULT_ENV: EnvPolicy = { kind: EnvKind.Inherit };

/** One confinement axis a run asked for, the capability behind it and how well the engine supports it. */
export interface ConfinementCell {
  readonly axis: Axis;
  readonly requested: string;
  readonly capability: CapabilityName;
  readonly support: Support;
}

export function resolveTools(call: ToolPolicy | undefined, consumer: ToolPolicy | undefined): ResolvedTools {
  const picked = call ?? consumer ?? DEFAULT_TOOLS;
  return { builtins: picked.builtins, mcp: picked.mcp, settings: picked.settings, strict: picked.strict ?? false };
}

type Asked = Omit<ConfinementCell, "support">;

function wanted(tools: ResolvedTools): Asked[] {
  const cells: Asked[] = [];
  if (tools.builtins === ToolSetting.Off) {
    cells.push({ axis: ConfinementAxis.Builtins, requested: ToolSetting.Off, capability: Capability.BuiltinToolsOff });
  }
  if (tools.mcp !== ToolSetting.HarnessDefault) {
    const none = tools.mcp.length === 0;
    cells.push({
      axis: ConfinementAxis.Mcp,
      requested: none ? ToolSetting.None : tools.mcp.map((endpoint) => endpoint.name).join(ENDPOINT_NAME_SEPARATOR),
      capability: none ? Capability.McpNone : Capability.McpAllowlist,
    });
  }
  if (tools.settings === ToolSetting.None) {
    cells.push({ axis: ConfinementAxis.Settings, requested: ToolSetting.None, capability: Capability.SettingsSources });
  }
  return cells;
}

function refusal(capability: CapabilityName, engine: Engine, why: string, support: Support): RunFailure {
  return { kind: "unsupported", message: EngineMessage.ConfinementUnsupported, capability, engine, why, support };
}

function endpointRefusal(tools: ResolvedTools, caps: Capabilities, engine: Engine): RunFailure | null {
  if (engine !== EngineName.Cli || tools.mcp === ToolSetting.HarnessDefault || tools.mcp.length === 0) {
    return null;
  }
  const withBearer = tools.mcp.some((endpoint) => endpoint.bearer !== null);
  return refusal(Capability.McpAllowlist, engine, withBearer ? McpWhy.BearerNotInArgv : McpWhy.CliCannotHostEndpoint, caps[Capability.McpAllowlist][engine]);
}

export function confine(tools: ResolvedTools, caps: Capabilities, engine: Engine): Result<readonly ConfinementCell[], RunFailure> {
  const endpoint = endpointRefusal(tools, caps, engine);
  if (endpoint !== null) {
    return fail(endpoint);
  }
  const cells: ConfinementCell[] = [];
  for (const asked of wanted(tools)) {
    const support = caps[asked.capability][engine];
    const refused = support.state === SupportState.Unsupported || (tools.strict && support.state !== SupportState.Supported);
    if (refused) {
      return fail(refusal(asked.capability, engine, supportWhy(support), support));
    }
    cells.push({ ...asked, support });
  }
  return ok(cells);
}
