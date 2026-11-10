import type { JsonObject } from "../core/json.ts";
import { FakeQueryText, FakeSdkDefaults, FakeSdkMessage } from "./agent-constants.ts";
import { abortablePause } from "./fake-agent-engine.ts";

/** The options the Claude SDK engine hands to its query function. Structural copy of the engine's own type. */
export interface FakeClaudeQueryOptions {
  readonly tools: readonly string[];
  readonly strictMcpConfig: boolean;
  readonly mcpServers: Readonly<Record<string, { readonly type: "http"; readonly url: string; readonly headers: Readonly<Record<string, string>> }>>;
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
  readonly hooks?: {
    readonly [event: string]: readonly {
      readonly matcher?: string;
      readonly timeout?: number;
      readonly hooks: readonly ((input: Record<string, unknown>, toolUseId: string | undefined, ctx: { readonly signal: AbortSignal }) => Promise<Record<string, unknown>>)[];
    }[];
  };
  readonly sessionStore?: {
    append(key: unknown, entries: unknown[]): Promise<void>;
    load(key: unknown): Promise<unknown[] | null>;
    listSubkeys?(key: unknown): Promise<unknown[]>;
  };
}

/** A stream of SDK messages; `close` ends it early. */
export interface FakeClaudeQueryStream extends AsyncIterable<unknown> {
  close?(): void;
}

/** One call of the query function: the prompt and the options it received. */
export interface FakeClaudeQueryCall {
  readonly index: number;
  readonly prompt: string;
  readonly options: FakeClaudeQueryOptions;
}

export type FakeClaudeQueryFn = (params: { readonly prompt: string; readonly options: FakeClaudeQueryOptions }) => FakeClaudeQueryStream;

/** A fake query function that records the options of every call and the replies of every hook it invoked. */
export type FakeClaudeQuery = FakeClaudeQueryFn & {
  readonly calls: readonly FakeClaudeQueryOptions[];
  readonly prompts: readonly string[];
  readonly hookReplies: readonly Record<string, unknown>[];
};

/** How a fake query stream behaves between and after its messages. */
export interface FakeClaudeQueryBehaviour {
  readonly delayMs?: number;
  readonly holdOpen?: boolean;
}

/** The messages to replay, or a function that picks them for each call. */
export type FakeClaudeMessages = readonly unknown[] | ((call: FakeClaudeQueryCall) => readonly unknown[]);

type Over = Readonly<Record<string, unknown>>;

interface Usage {
  readonly input?: number;
  readonly cacheWrite?: number;
  readonly cacheRead?: number;
  readonly output?: number;
}

function usageOf(usage: Usage | undefined): Record<string, unknown> {
  return {
    input_tokens: usage?.input ?? FakeSdkDefaults.InputTokens,
    cache_creation_input_tokens: usage?.cacheWrite ?? FakeSdkDefaults.CacheWriteTokens,
    cache_read_input_tokens: usage?.cacheRead ?? FakeSdkDefaults.CacheReadTokens,
    output_tokens: usage?.output ?? FakeSdkDefaults.OutputTokens,
    service_tier: FakeSdkDefaults.ServiceTier,
    inference_geo: FakeSdkDefaults.InferenceGeo,
    speed: FakeSdkDefaults.Speed,
  };
}

function assistant(content: readonly unknown[], stop: string | null, usage: Usage | undefined, over: Over): Record<string, unknown> {
  return {
    type: FakeSdkMessage.Assistant,
    message: {
      model: FakeSdkDefaults.Model,
      id: FakeSdkDefaults.MessageId,
      type: FakeSdkMessage.Message,
      role: FakeSdkMessage.Assistant,
      content,
      stop_reason: stop,
      stop_sequence: null,
      usage: usageOf(usage),
    },
    parent_tool_use_id: null,
    session_id: FakeSdkDefaults.SessionId,
    uuid: FakeSdkDefaults.Uuid,
    timestamp: FakeSdkDefaults.Timestamp,
    request_id: FakeSdkDefaults.RequestId,
    ...over,
  };
}

function resultBase(subtype: string, isError: boolean, over: Over): Record<string, unknown> {
  return {
    type: FakeSdkMessage.Result,
    subtype,
    is_error: isError,
    duration_ms: FakeSdkDefaults.DurationMs,
    duration_api_ms: FakeSdkDefaults.DurationApiMs,
    num_turns: FakeSdkDefaults.Turns,
    session_id: FakeSdkDefaults.SessionId,
    uuid: FakeSdkDefaults.Uuid,
    usage: usageOf(undefined),
    permission_denials: [],
    ...over,
  };
}

/** SDK-shaped messages, copied in shape from masked captures, plus two directives only the fake understands. */
export const claudeMessages = {
  init(over: Over = {}): Record<string, unknown> {
    return {
      type: FakeSdkMessage.System,
      subtype: FakeSdkMessage.Init,
      cwd: FakeSdkDefaults.Cwd,
      session_id: FakeSdkDefaults.SessionId,
      tools: [],
      mcp_servers: [],
      model: FakeSdkDefaults.Model,
      permissionMode: FakeSdkDefaults.PermissionMode,
      apiKeySource: FakeSdkDefaults.ApiKeySource,
      claude_code_version: FakeSdkDefaults.ClaudeCodeVersion,
      output_style: FakeSdkDefaults.OutputStyle,
      uuid: FakeSdkDefaults.Uuid,
      ...over,
    };
  },
  assistantText(text: string = FakeSdkDefaults.Text, usage?: Usage, over: Over = {}): Record<string, unknown> {
    return assistant([{ type: FakeSdkMessage.Text, text }], null, usage, over);
  },
  assistantToolUse(name: string = FakeSdkDefaults.ToolName, input: Over = { command: FakeSdkDefaults.ToolCommand }, usage?: Usage, over: Over = {}): Record<string, unknown> {
    const block = { type: FakeSdkMessage.ToolUse, id: FakeSdkDefaults.ToolUseId, name, input };
    return assistant([block], FakeSdkMessage.ToolUseStop, usage, over);
  },
  toolResult(toolUseId: string = FakeSdkDefaults.ToolUseId, content: string = FakeSdkDefaults.ToolOutput, over: Over = {}): Record<string, unknown> {
    return {
      type: FakeSdkMessage.User,
      message: { role: FakeSdkMessage.User, content: [{ tool_use_id: toolUseId, type: FakeSdkMessage.ToolResult, content, is_error: false }] },
      parent_tool_use_id: null,
      session_id: FakeSdkDefaults.SessionId,
      uuid: FakeSdkDefaults.Uuid,
      timestamp: FakeSdkDefaults.Timestamp,
      ...over,
    };
  },
  resultSuccess(text: string = FakeSdkDefaults.Text, over: Over = {}): Record<string, unknown> {
    return resultBase(FakeSdkMessage.Success, false, {
      stop_reason: FakeSdkMessage.EndTurn,
      terminal_reason: FakeSdkMessage.Completed,
      result: text,
      ...over,
    });
  },
  resultMaxTurns(over: Over = {}): Record<string, unknown> {
    return resultBase(FakeSdkMessage.ErrorMaxTurns, true, {
      stop_reason: FakeSdkMessage.EndTurn,
      terminal_reason: FakeSdkMessage.MaxTurnsTerminal,
      num_turns: FakeSdkDefaults.MaxTurns + 1,
      errors: [`${FakeSdkDefaults.MaxTurnsMessage} (${FakeSdkDefaults.MaxTurns})`],
      ...over,
    });
  },
  rateLimit(over: Over = {}): Record<string, unknown> {
    return {
      type: FakeSdkMessage.RateLimit,
      rate_limit_info: {
        status: FakeSdkDefaults.RateLimitStatus,
        resetsAt: FakeSdkDefaults.RateLimitResetsAt,
        rateLimitType: FakeSdkDefaults.RateLimitType,
        utilization: FakeSdkDefaults.RateLimitUtilization,
        surpassedThreshold: FakeSdkDefaults.RateLimitThreshold,
        isUsingOverage: false,
      },
      uuid: FakeSdkDefaults.Uuid,
      session_id: FakeSdkDefaults.SessionId,
      ...over,
    };
  },
  hookCall(event: string, input: Over, toolUseId?: string): Record<string, unknown> {
    return { type: FakeQueryText.HookCall, event, input, toolUseId };
  },
  throwError(message: string, name: string = FakeQueryText.ThrownName): Record<string, unknown> {
    return { type: FakeQueryText.Throw, message, name };
  },
} as const;

function namedError(name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

function field(message: unknown, key: string): unknown {
  return typeof message === "object" && message !== null ? Reflect.get(message, key) : undefined;
}

async function runHooks(options: FakeClaudeQueryOptions, message: unknown, replies: Record<string, unknown>[]): Promise<void> {
  const event = field(message, "event");
  const input = field(message, "input");
  const toolUseId = field(message, "toolUseId");
  const matchers = typeof event === "string" ? options.hooks?.[event] : undefined;
  for (const matcher of matchers ?? []) {
    for (const hook of matcher.hooks) {
      const reply = await hook((input ?? {}) as Record<string, unknown>, typeof toolUseId === "string" ? toolUseId : undefined, { signal: options.abortController.signal });
      replies.push(reply);
    }
  }
}

function streamOf(
  messages: readonly unknown[],
  options: FakeClaudeQueryOptions,
  behaviour: FakeClaudeQueryBehaviour,
  replies: Record<string, unknown>[],
): FakeClaudeQueryStream {
  const signal = options.abortController.signal;
  const closer = new AbortController();
  let index = 0;
  const iterator: AsyncIterator<unknown> = {
    async next() {
      for (;;) {
        if (signal.aborted) {
          throw namedError(FakeQueryText.AbortName, FakeQueryText.Aborted);
        }
        if (closer.signal.aborted) {
          return { done: true, value: undefined };
        }
        if (index >= messages.length) {
          if (behaviour.holdOpen !== true) {
            return { done: true, value: undefined };
          }
          await new Promise<void>((resolve) => {
            signal.addEventListener("abort", () => resolve(), { once: true });
            closer.signal.addEventListener("abort", () => resolve(), { once: true });
          });
          continue;
        }
        if (behaviour.delayMs !== undefined && behaviour.delayMs > 0) {
          await abortablePause(behaviour.delayMs, signal);
          if (signal.aborted || closer.signal.aborted) {
            continue;
          }
        }
        const message = messages[index];
        index += 1;
        const kind = field(message, "type");
        if (kind === FakeQueryText.HookCall) {
          await runHooks(options, message, replies);
          continue;
        }
        if (kind === FakeQueryText.Throw) {
          throw namedError(String(field(message, "name")), String(field(message, "message")));
        }
        return { done: false, value: message };
      }
    },
  };
  return {
    [Symbol.asyncIterator]: () => iterator,
    close: () => closer.abort(),
  };
}

/** A query function for the Claude SDK engine that yields the given SDK-shaped messages and records the options of every call. After the abort controller aborts, the next pull throws an error named like the SDK's abort error; `close()` ends the stream. */
export function fakeClaudeQuery(messages: FakeClaudeMessages, behaviour: FakeClaudeQueryBehaviour = {}): FakeClaudeQuery {
  const calls: FakeClaudeQueryOptions[] = [];
  const prompts: string[] = [];
  const hookReplies: Record<string, unknown>[] = [];
  const query: FakeClaudeQueryFn = (params) => {
    const index = calls.length;
    calls.push(params.options);
    prompts.push(params.prompt);
    const picked = typeof messages === "function" ? messages({ index, prompt: params.prompt, options: params.options }) : messages;
    return streamOf(picked, params.options, behaviour, hookReplies);
  };
  return Object.assign(query, { calls, prompts, hookReplies });
}
