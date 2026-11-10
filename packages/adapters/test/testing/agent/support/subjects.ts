import type { AgentRunInput } from "../../../../src/agent/engine.ts";
import type { AgentEvent, AgentOptions } from "../../../../src/agent/types.ts";
import { TOOLS_OFF } from "../../../../src/core/policy.ts";
import { fail } from "../../../../src/core/result.ts";
import { secret } from "../../../../src/core/secret.ts";
import { asSessionId, type SessionId } from "../../../../src/core/session.ts";
import type { EnvSource } from "../../../../src/env.ts";
import { agentContract, fakeAgentEngine, type AgentContractSubject, type FakeAgentEngine, type FakeAgentScript } from "../../../../src/testing/index.ts";
import { type Defect, referenceRuntime } from "./reference-runtime.ts";

export const OPTIONS: AgentOptions = {
  credential: { mode: "api-key", key: secret("sk-placeholder"), baseUrl: "http://127.0.0.1:1" },
  dirs: { cwd: "/w", home: "/w/h", configDir: "/w/c", tmpDir: "/w/t" },
  tools: TOOLS_OFF,
  env: { kind: "closed", set: { CONTRACT_PLAIN: "plain-value" } },
};

export const SESSION = asSessionId("session-1") as SessionId;
export const DENIED_TOOL = "secret";

export function normalEvents(): AgentEvent[] {
  return [
    { kind: "started", engine: "sdk" },
    { kind: "session", id: SESSION, checkpoint: "checkpoint-1" },
    { kind: "turn", n: 1 },
    { kind: "text", text: "ok" },
    { kind: "usage", turn: 1, model: "model-a", input: 2, cacheWrite: 100, cacheRead: 0, output: 4 },
    { kind: "turn", n: 2 },
    { kind: "usage", turn: 2, model: "model-a", input: 3, cacheWrite: 0, cacheRead: 100, output: 5 },
  ];
}

export function denyEvents(tool: string = DENIED_TOOL, source: "hook" | "unknown-tool" = "hook"): AgentEvent[] {
  return [
    { kind: "started", engine: "sdk" },
    { kind: "refused", id: "tool-1", tool, source, reason: "not allowed", text: null },
    ...normalEvents().slice(1),
  ];
}

export interface Tracked {
  readonly runtime: (source?: EnvSource) => ReturnType<typeof referenceRuntime>;
  readonly inputs: () => readonly AgentRunInput[];
}

export function tracked(scripts: () => readonly FakeAgentScript[], defects: ReadonlySet<Defect>): Tracked {
  let latest: FakeAgentEngine<string> | null = null;
  return {
    runtime(source) {
      latest = fakeAgentEngine("claude", scripts());
      return referenceRuntime(latest, defects, source ?? {});
    },
    inputs: () => latest?.starts ?? [],
  };
}

export interface SubjectParts {
  readonly defects?: readonly Defect[];
  readonly base?: () => readonly FakeAgentScript[];
  readonly deny?: () => readonly FakeAgentScript[];
  readonly cancel?: () => readonly FakeAgentScript[];
  readonly resume?: () => readonly FakeAgentScript[];
  readonly engine?: AgentContractSubject["engine"];
  readonly bare?: boolean;
}

export function subjectOf(parts: SubjectParts = {}): AgentContractSubject {
  const defects = new Set<Defect>(parts.defects ?? []);
  const base = tracked(parts.base ?? (() => [{ events: normalEvents() }]), defects);
  if (parts.bare === true) {
    return { runtime: base.runtime, options: OPTIONS, id: "claude" };
  }
  const deny = tracked(parts.deny ?? (() => [{ events: denyEvents() }]), defects);
  const cancel = tracked(parts.cancel ?? (() => [{ events: normalEvents(), delayMs: 40, settleDelayMs: 60 }]), defects);
  const resume = tracked(
    parts.resume ??
      (() => [
        { events: [], result: fail({ kind: "session-not-found", message: "no such session", sessionId: "contract-resume-session" }) },
        { events: normalEvents() },
      ]),
    defects,
  );
  return {
    runtime: base.runtime,
    options: OPTIONS,
    id: "claude",
    inputs: base.inputs,
    engine: parts.engine ?? fakeAgentEngine("claude", []),
    cancel: { runtime: cancel.runtime, inputs: cancel.inputs },
    deny: { runtime: deny.runtime, inputs: deny.inputs, tool: DENIED_TOOL },
    resumeMiss: { runtime: resume.runtime, inputs: resume.inputs },
  };
}

export async function failing(subject: AgentContractSubject): Promise<string[]> {
  return (await agentContract(subject)).filter((check) => !check.ok).map((check) => check.name);
}

export function runInput(signal: AbortSignal = new AbortController().signal, env: Record<string, string> = {}): AgentRunInput {
  return {
    options: OPTIONS,
    start: { instructions: "i", prompt: "p", maxTurns: 1 },
    env,
    secrets: [],
    confinement: [],
    runId: "run-1",
    signal,
    redact: (text) => text,
  };
}

export async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of source) out.push(item);
  return out;
}
