import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentEngineRun, AgentRunInput } from "../../../src/agent/engine.ts";
import type { AgentEvent, AgentOptions, AgentStart, TranscriptStore, StoreEntry } from "../../../src/agent/types.ts";
import type { ClaudeQueryFn, ClaudeQueryOptions, ClaudeQueryStream } from "../../../src/claude/engines/sdk.ts";
import { TOOLS_OFF, type McpEndpoint } from "../../../src/core/policy.ts";
import type { Clock } from "../../../src/core/io.ts";
import { redactor } from "../../../src/core/redact.ts";
import { secret } from "../../../src/core/secret.ts";
import { asSessionId } from "../../../src/core/session.ts";
import { fakeClock } from "../../../src/testing/fake-clock.ts";
import { adaptersFixtures } from "../../support/fixtures.ts";

export const KEY = "sk-test-KEY-5d1c";
export const BEARER = "bearer-TOKEN-9b7e";
export const BASE_URL = "http://127.0.0.1:9";
export const DIRS = { cwd: "/w/cwd", home: "/w/home", configDir: "/w/config", tmpDir: "/w/tmp" } as const;
export const SESSION = asSessionId("00000000-0000-4000-8000-000000000001")!;

export const CAPTURE = readFileSync(join(adaptersFixtures, "claude", "headless", "claude-stream-json-verbose.jsonl"), "utf8")
  .split("\n")
  .filter((line) => line !== "")
  .map((line) => JSON.parse(line) as Record<string, unknown>);

export function captured(type: string, subtype?: string): Record<string, unknown> {
  const row = CAPTURE.find((candidate) => candidate["type"] === type && (subtype === undefined || candidate["subtype"] === subtype));
  if (row === undefined) {
    throw new Error(`capture has no ${type}`);
  }
  return row;
}

export const INIT = captured("system", "init");
export const ASSISTANT = captured("assistant");
export const RATE_LIMIT = captured("rate_limit_event");
export const RESULT = captured("result");

export function toolAssistant(overrides: { readonly id: string; readonly uuid: string; readonly tool: string; readonly toolId: string; readonly input?: Record<string, unknown> }): Record<string, unknown> {
  const message = ASSISTANT["message"] as Record<string, unknown>;
  return {
    ...ASSISTANT,
    uuid: overrides.uuid,
    message: { ...message, id: overrides.id, content: [{ type: "tool_use", id: overrides.toolId, name: overrides.tool, input: overrides.input ?? {} }] },
  };
}

export function withUuid(row: Record<string, unknown>, uuid: string, id?: string): Record<string, unknown> {
  const message = row["message"] as Record<string, unknown> | undefined;
  return { ...row, uuid, ...(message === undefined ? {} : { message: { ...message, id: id ?? message["id"] } }) };
}

export const BASIC = [INIT, ASSISTANT, RATE_LIMIT, RESULT];

export interface QueryCall {
  readonly prompt: string;
  readonly options: ClaudeQueryOptions;
}

export interface FakeQuery {
  readonly query: ClaudeQueryFn;
  readonly calls: QueryCall[];
  readonly closed: { count: number };
}

export type Script = readonly unknown[] | ((options: ClaudeQueryOptions) => AsyncIterable<unknown>);

export function fakeQuery(...scripts: Script[]): FakeQuery {
  const calls: QueryCall[] = [];
  const closed = { count: 0 };
  const query: ClaudeQueryFn = (params) => {
    calls.push({ prompt: params.prompt, options: params.options });
    const script = scripts[Math.min(calls.length - 1, scripts.length - 1)] ?? [];
    const iterable: AsyncIterable<unknown> =
      typeof script === "function"
        ? script(params.options)
        : (async function* () {
            for (const message of script) {
              yield message;
            }
          })();
    const stream: ClaudeQueryStream = {
      [Symbol.asyncIterator]: () => iterable[Symbol.asyncIterator](),
      close: () => {
        closed.count += 1;
      },
    };
    return stream;
  };
  return { query, calls, closed };
}

export function agentOptions(overrides: Partial<AgentOptions> = {}): AgentOptions {
  return {
    credential: { mode: "api-key", key: secret(KEY), baseUrl: BASE_URL },
    dirs: DIRS,
    tools: TOOLS_OFF,
    env: { kind: "closed", set: {} },
    ...overrides,
  };
}

export function agentStart(overrides: Partial<AgentStart> = {}): AgentStart {
  return { instructions: "be brief", prompt: "say ok", maxTurns: 3, ...overrides };
}

export interface InputParts {
  readonly options?: Partial<AgentOptions>;
  readonly start?: Partial<AgentStart>;
  readonly env?: Record<string, string>;
  readonly signal?: AbortSignal;
  readonly clock?: Clock;
  readonly secrets?: readonly string[];
}

export function runInput(parts: InputParts = {}): AgentRunInput {
  const secrets = parts.secrets ?? [KEY, BEARER];
  return {
    options: agentOptions(parts.options),
    start: agentStart(parts.start),
    env: parts.env ?? { ANTHROPIC_API_KEY: KEY },
    secrets,
    confinement: [],
    runId: "run-1",
    signal: parts.signal ?? new AbortController().signal,
    clock: parts.clock ?? fakeClock(),
    redact: redactor(secrets),
  };
}

export function endpoint(name: string, bearer: string | null = BEARER, allow: readonly string[] = []): McpEndpoint {
  return { name, url: `http://127.0.0.1:1/${name}`, bearer: bearer === null ? null : secret(bearer), allow };
}

export interface Collected {
  readonly events: AgentEvent[];
  readonly end: Awaited<AgentEngineRun["done"]>;
}

export async function collect(run: AgentEngineRun): Promise<Collected> {
  const events: AgentEvent[] = [];
  const reading = (async () => {
    for await (const event of run.events) {
      events.push(event);
    }
  })();
  const end = await run.done;
  await reading;
  return { events, end };
}

export function kinds(events: readonly AgentEvent[]): string[] {
  return events.map((event) => event.kind);
}

export function memoryStore(): TranscriptStore & { readonly entries: Map<string, StoreEntry[]>; failure: Error | null } {
  const entries = new Map<string, StoreEntry[]>();
  const store = {
    entries,
    failure: null as Error | null,
    async append(key: string, batch: readonly StoreEntry[]): Promise<void> {
      if (store.failure !== null) {
        throw store.failure;
      }
      entries.set(key, [...(entries.get(key) ?? []), ...batch]);
    },
    async load(key: string): Promise<readonly StoreEntry[] | null> {
      return entries.get(key) ?? null;
    },
    async listSubkeys(key: string): Promise<readonly string[]> {
      return [...entries.keys()].filter((candidate) => candidate.startsWith(`${key}/`));
    },
  };
  return store;
}

export function never(): AsyncIterable<unknown> {
  return {
    [Symbol.asyncIterator]: () => ({ next: () => new Promise<IteratorResult<unknown>>(() => undefined) }),
  };
}
