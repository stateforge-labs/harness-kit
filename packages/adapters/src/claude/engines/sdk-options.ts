import type { ChildProcess } from "node:child_process";
import type { AgentRunInput } from "../../agent/engine.ts";
import type { ClaudeHookOption, HookObserver } from "../../agent/hooks/index.ts";
import type { StoreEntry, TranscriptStore } from "../../agent/types.ts";
import type { RunFailure } from "../../core/failure.ts";
import { measuredValue } from "../../core/evidence.ts";
import type { JsonObject } from "../../core/json.ts";
import { neutralOrNative } from "../../core/kit.ts";
import { ToolSetting, type McpEndpoint } from "../../core/policy.ts";
import { fail, ok, type Result } from "../../core/result.ts";
import { EnvVar } from "../../env.ts";
import { CLAUDE_PROFILE } from "../profile.ts";
import { SdkConfigField, SdkMcp, SdkMessage, SdkOutput, SdkPermissionMode, SdkRuntime, SdkStore } from "./sdk-constants.ts";

export interface ClaudeMcpServer {
  readonly type: "http";
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
}

export type { ClaudeHookOption, HookObserver };

export interface ClaudeSpawnRequest {
  readonly command: string;
  readonly args: string[];
  readonly cwd?: string;
  readonly env: { [name: string]: string | undefined };
  readonly signal: AbortSignal;
}

export interface ClaudeQueryOptions {
  readonly tools?: readonly string[];
  readonly strictMcpConfig: boolean;
  readonly mcpServers: Readonly<Record<string, ClaudeMcpServer>>;
  readonly settingSources: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  readonly cwd: string;
  readonly executable: "node" | "bun";
  readonly pathToClaudeCodeExecutable?: string;
  readonly abortController: AbortController;
  readonly systemPrompt: string;
  readonly model?: string;
  readonly effort?: string;
  readonly maxTurns: number;
  readonly outputFormat?: { readonly type: "json_schema"; readonly schema: JsonObject };
  readonly resume?: string;
  readonly resumeSessionAt?: string;
  readonly persistSession: boolean;
  readonly includePartialMessages: boolean;
  readonly hooks?: ClaudeHookOption;
  readonly sessionStore?: {
    append(key: unknown, entries: unknown[]): Promise<void>;
    load(key: unknown): Promise<unknown[] | null>;
    listSubkeys?(key: unknown): Promise<unknown[]>;
  };
  readonly sessionStoreFlush?: "eager";
  readonly permissionMode?: string;
  readonly allowedTools?: readonly string[];
  readonly spawnClaudeCodeProcess?: (request: ClaudeSpawnRequest) => ChildProcess;
}

export interface BuildContext {
  readonly abortController: AbortController;
  readonly hooks: ClaudeHookOption | null;
  readonly store: ClaudeQueryOptions["sessionStore"] | null;
  readonly spawn: ClaudeQueryOptions["spawnClaudeCodeProcess"] | null;
}

export function bearerEnvName(index: number): string {
  return `${SdkMcp.EnvPrefix}${index}`;
}

export function detectRuntime(): SdkRuntime {
  return Reflect.has(process.versions, SdkRuntime.Bun) ? SdkRuntime.Bun : SdkRuntime.Node;
}

function endpointsOf(input: AgentRunInput): Result<readonly McpEndpoint[], RunFailure> {
  const mcp = input.options.tools.mcp;
  return Array.isArray(mcp) ? ok(mcp as readonly McpEndpoint[]) : fail({ kind: "invalid-config", message: SdkMessage.McpNotList, field: SdkConfigField.ToolsMcp });
}

function childEnv(input: AgentRunInput, endpoints: readonly McpEndpoint[]): Result<Readonly<Record<string, string>>, RunFailure> {
  const { credential, dirs, env } = input.options;
  const quiet = env.quiet === true ? measuredValue(CLAUDE_PROFILE.quiet) : null;
  const base: Record<string, string> = { ...(quiet ?? {}), ...input.env };
  const missing = endpoints.findIndex((endpoint, index) => endpoint.bearer !== null && (base[bearerEnvName(index)] ?? "") === "");
  if (missing >= 0) {
    return fail({ kind: "invalid-config", message: SdkMessage.BearerMissing, field: SdkConfigField.ToolsMcp });
  }
  return ok({
    ...base,
    ...(input.start.limits?.mcpOutputTokens !== undefined ? { [EnvVar.MaxMcpOutputTokens]: String(input.start.limits.mcpOutputTokens) } : {}),
    [EnvVar.Home]: dirs.home,
    [EnvVar.ClaudeConfigDir]: dirs.configDir,
    [EnvVar.Tmpdir]: dirs.tmpDir,
    [EnvVar.AnthropicBaseUrl]: credential.baseUrl,
  });
}

function mcpServers(endpoints: readonly McpEndpoint[]): Record<string, ClaudeMcpServer> {
  const out: Record<string, ClaudeMcpServer> = {};
  endpoints.forEach((endpoint, index) => {
    const reference = `${SdkMcp.ExpandOpen}${bearerEnvName(index)}${SdkMcp.ExpandClose}`;
    out[endpoint.name] = {
      type: SdkMcp.ServerType,
      url: endpoint.url,
      headers: endpoint.bearer === null ? {} : { [SdkMcp.AuthorizationHeader]: `${SdkMcp.BearerPrefix}${reference}` },
    };
  });
  return out;
}

function allowedTools(endpoints: readonly McpEndpoint[]): string[] {
  return endpoints.flatMap((endpoint) => {
    const server = `${SdkMcp.ToolPrefix}${endpoint.name}`;
    return endpoint.allow.length === 0 ? [server] : endpoint.allow.map((tool) => `${server}${SdkMcp.ToolSeparator}${tool}`);
  });
}

export function buildQueryOptions(input: AgentRunInput, ctx: BuildContext): Result<ClaudeQueryOptions, RunFailure> {
  const { options, start } = input;
  const endpoints = endpointsOf(input);
  if (!endpoints.ok) {
    return fail(endpoints.failure);
  }
  const env = childEnv(input, endpoints.value);
  if (!env.ok) {
    return fail(env.failure);
  }
  const effort = neutralOrNative(start.effort ?? null, measuredValue(CLAUDE_PROFILE.effort.accepted));
  if (!effort.ok) {
    return fail(effort.failure);
  }
  const builtinsOff = options.tools.builtins === ToolSetting.Off;
  const restricted = builtinsOff && endpoints.value.length > 0;
  const built: ClaudeQueryOptions = {
    ...(builtinsOff ? { tools: [] } : {}),
    strictMcpConfig: true,
    mcpServers: mcpServers(endpoints.value),
    settingSources: [],
    env: env.value,
    cwd: options.dirs.cwd,
    executable: options.binary?.runtime ?? detectRuntime(),
    ...(options.binary?.path != null ? { pathToClaudeCodeExecutable: options.binary.path } : {}),
    abortController: ctx.abortController,
    systemPrompt: start.instructions,
    ...(start.model !== undefined ? { model: start.model } : {}),
    ...(effort.value !== null ? { effort: effort.value } : {}),
    maxTurns: start.maxTurns,
    ...(start.outputSchema !== undefined ? { outputFormat: { type: SdkOutput.JsonSchema, schema: start.outputSchema } } : {}),
    ...(start.resume !== undefined ? { resume: start.resume.sessionId } : {}),
    ...(start.resume?.checkpoint !== undefined ? { resumeSessionAt: start.resume.checkpoint } : {}),
    persistSession: ctx.store !== null,
    includePartialMessages: false,
    ...(ctx.hooks !== null ? { hooks: ctx.hooks } : {}),
    ...(ctx.store !== null ? { sessionStore: ctx.store, sessionStoreFlush: SdkStore.FlushEager } : {}),
    ...(restricted ? { permissionMode: SdkPermissionMode.DontAsk, allowedTools: [...allowedTools(endpoints.value), ...(start.outputSchema !== undefined ? [SdkOutput.StructuredTool] : [])] } : {}),
    ...(ctx.spawn !== null ? { spawnClaudeCodeProcess: ctx.spawn } : {}),
  };
  return ok(built);
}

interface StoreKey {
  readonly projectKey: string;
  readonly sessionId: string;
  readonly subpath?: string;
}

function keyParts(key: unknown): StoreKey {
  const row = typeof key === "object" && key !== null ? (key as Record<string, unknown>) : {};
  const subpath = row["subpath"];
  return {
    projectKey: typeof row["projectKey"] === "string" ? row["projectKey"] : "",
    sessionId: typeof row["sessionId"] === "string" ? row["sessionId"] : "",
    ...(typeof subpath === "string" && subpath !== "" ? { subpath } : {}),
  };
}

export function storeKeyText(key: unknown): string {
  const parts = keyParts(key);
  return [parts.projectKey, parts.sessionId, ...(parts.subpath === undefined ? [] : [parts.subpath])].join(SdkStore.KeySeparator);
}

function toStoreEntry(entry: unknown): StoreEntry {
  const row = typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>) : {};
  return { uuid: typeof row["uuid"] === "string" ? row["uuid"] : SdkStore.NoUuid, json: JSON.stringify(entry) };
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function sessionStoreAdapter(store: TranscriptStore, onFailure: (reason: string) => void): NonNullable<ClaudeQueryOptions["sessionStore"]> {
  const noted = <T>(work: () => Promise<T>): Promise<T> =>
    Promise.resolve()
      .then(work)
      .then(undefined, (error: unknown) => {
        onFailure(reasonOf(error));
        throw error;
      });
  return {
    append: (key, entries) => noted(() => store.append(storeKeyText(key), entries.map(toStoreEntry))),
    load: (key) =>
      noted(async () => {
        const loaded = await store.load(storeKeyText(key));
        return loaded === null ? null : loaded.map((entry) => JSON.parse(entry.json) as unknown);
      }),
    listSubkeys: (key) =>
      noted(async () => {
        const prefix = `${storeKeyText(key)}${SdkStore.KeySeparator}`;
        const listed = await store.listSubkeys(storeKeyText(key));
        return listed.map((subkey) => (subkey.startsWith(prefix) ? subkey.slice(prefix.length) : subkey));
      }),
  };
}
