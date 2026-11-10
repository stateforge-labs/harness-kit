import { AgentWhy } from "../../../../src/agent/constants.ts";
import type { AgentEngineImpl, AgentEngineRun, AgentRunInput } from "../../../../src/agent/engine.ts";
import type { Agent, AgentEvent, AgentOptions, AgentOutput, AgentRun, AgentStart } from "../../../../src/agent/types.ts";
import { Engine } from "../../../../src/core/capability.ts";
import type { RunFailure } from "../../../../src/core/failure.ts";
import { fail, ok, type Result } from "../../../../src/core/result.ts";
import { reveal } from "../../../../src/core/secret.ts";
import { nodeClock } from "../../../../src/driver/node-defaults.ts";
import type { Runtime } from "../../../../src/driver/create-runtime.ts";
import type { EnvSource } from "../../../../src/env.ts";

export type Defect =
  | "double-finished"
  | "event-after-finished"
  | "no-started"
  | "settled-rejects"
  | "settled-differs"
  | "settled-before-terminal"
  | "leak-key"
  | "inherits-ambient"
  | "cancel-early"
  | "cancel-wrong-kind"
  | "cli-spawns"
  | "accepts-any-turns"
  | "recovers-without-prompt"
  | "no-recovered-event"
  | "never-recovers";

function newBuffer() {
  const items: AgentEvent[] = [];
  let ended = false;
  let wake: (() => void) | null = null;
  const poke = (): void => {
    const current = wake;
    wake = null;
    current?.();
  };
  return {
    push(event: AgentEvent): void {
      items.push(event);
      poke();
    },
    end(): void {
      ended = true;
      poke();
    },
    async *iterate(): AsyncGenerator<AgentEvent> {
      let at = 0;
      for (;;) {
        const next = items[at];
        if (next !== undefined) {
          at += 1;
          yield next;
        } else if (ended) {
          return;
        } else {
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
        }
      }
    },
  };
}

function inputFor(options: AgentOptions, start: AgentStart, signal: AbortSignal, defects: ReadonlySet<Defect>, source: EnvSource): AgentRunInput {
  const env: Record<string, string> = {};
  if (defects.has("inherits-ambient")) {
    for (const [name, value] of Object.entries(source)) {
      if (value !== undefined) env[name] = value;
    }
  }
  for (const [name, value] of Object.entries(options.env.set)) {
    env[name] = typeof value === "string" ? value : reveal(value);
  }
  env["ANTHROPIC_API_KEY"] = reveal(options.credential.key);
  env["ANTHROPIC_BASE_URL"] = options.credential.baseUrl;
  return { options, start, env, secrets: [reveal(options.credential.key)], confinement: [], runId: "reference-run", signal, clock: nodeClock, redact: (text) => text };
}

function refused(failure: RunFailure): AgentRun {
  const buffer = newBuffer();
  const result: Result<AgentOutput, RunFailure> = fail(failure);
  buffer.push({ kind: "finished", result, tree: "gone" });
  buffer.end();
  return { events: buffer.iterate(), settled: Promise.resolve(result), cancel: () => Promise.resolve() };
}

function begin(engine: AgentEngineImpl<string>, options: AgentOptions, start: AgentStart, defects: ReadonlySet<Defect>, source: EnvSource): AgentRun {
  const buffer = newBuffer();
  const abort = new AbortController();
  let current: AgentEngineRun | null = null;
  const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  const work = async (): Promise<Result<AgentOutput, RunFailure>> => {
    let attempt = start;
    for (let round = 0; ; round += 1) {
      current = engine.start(inputFor(options, attempt, abort.signal, defects, source));
      const live = current;
      const pump = (async () => {
        for await (const event of live.events) {
          if (event.kind === "started" && defects.has("no-started")) continue;
          buffer.push(event);
        }
      })();
      const end = await live.done;
      await pump;
      if (defects.has("cancel-early") && abort.signal.aborted) await pause(30);
      const resume = attempt.resume;
      const missed = !end.ok && end.failure.kind === "session-not-found";
      const mayRecover = round === 0 && resume !== undefined && missed && !defects.has("never-recovers");
      if (mayRecover && (resume.recoveryPrompt !== undefined || defects.has("recovers-without-prompt"))) {
        if (!defects.has("no-recovered-event")) buffer.push({ kind: "recovered", reason: "session-not-found" });
        attempt = { ...attempt, resume: undefined, prompt: resume.recoveryPrompt ?? attempt.prompt } as AgentStart;
        continue;
      }
      if (!end.ok) {
        const failure = end.failure.kind === "cancelled" && defects.has("cancel-wrong-kind") ? ({ kind: "aborted", message: "aborted" } as const) : end.failure;
        return fail(failure);
      }
      return ok(end.value.output);
    }
  };

  const settledOut = (async (): Promise<Result<AgentOutput, RunFailure>> => {
    const result = await work();
    if (defects.has("settled-before-terminal")) {
      setTimeout(() => {
        buffer.push({ kind: "finished", result, tree: "gone" });
        buffer.end();
      }, 30);
      return result;
    }
    if (defects.has("leak-key")) buffer.push({ kind: "unrecognised", payload: { key: reveal(options.credential.key) } });
    buffer.push({ kind: "finished", result, tree: "gone" });
    if (defects.has("double-finished")) buffer.push({ kind: "finished", result, tree: "gone" });
    if (defects.has("event-after-finished")) buffer.push({ kind: "text", text: "late" });
    buffer.end();
    return result;
  })();

  const settled = defects.has("settled-rejects")
    ? settledOut.then(() => Promise.reject(new Error("settled rejected")))
    : defects.has("settled-differs")
      ? settledOut.then(() => fail({ kind: "no-output", message: "different" } as RunFailure))
      : settledOut;
  void settled.then(undefined, () => undefined);

  return {
    events: buffer.iterate(),
    settled,
    cancel: async () => {
      abort.abort();
      current?.cancel();
      if (defects.has("cancel-early")) return;
      await settledOut;
      await pause(0);
    },
  };
}

export function referenceRuntime(engine: AgentEngineImpl<string>, defects: ReadonlySet<Defect> = new Set(), source: EnvSource = {}): Runtime<string> {
  const agent = (_id: string, options: AgentOptions): Result<Agent, RunFailure> => {
    if ((options.engine as string | undefined) === "cli" && !defects.has("cli-spawns")) {
      return fail({ kind: "unsupported", message: "cli agent run", capability: "engine", engine: Engine.Sdk, why: AgentWhy.CliEngine });
    }
    const made: Agent = {
      capabilities: {} as Agent["capabilities"],
      hooks: {} as Agent["hooks"],
      start(start) {
        const turns = start.maxTurns as unknown;
        if (!defects.has("accepts-any-turns") && !(typeof turns === "number" && Number.isInteger(turns) && turns > 0)) {
          return refused({ kind: "invalid-config", message: "maxTurns is required", field: "maxTurns" });
        }
        return begin(engine, options, start, defects, source);
      },
    };
    return ok(made);
  };
  return { agent } as unknown as Runtime<string>;
}
