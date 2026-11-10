import { FAILURE_TAIL_BYTES } from "../../core/engine-constants.ts";
import type { AgentEvent, AgentOutput, TurnUsage } from "../../agent/types.ts";
import type { RunFailure } from "../../core/failure.ts";
import type { JsonValue } from "../../core/json.ts";
import { tailBytes } from "../../core/limits.ts";
import { redactValue } from "../../core/redact.ts";
import { arr, count, num, obj, str, type Row } from "../../core/rows.ts";
import { asSessionId, type SessionId } from "../../core/session.ts";
import { ClaudeBlockType, ClaudeModel } from "../constants.ts";
import { claudeToolClass, claudeToolTarget } from "../tools.ts";
import { SDK_STRUCTURED_OUTPUT_TOOL, SdkField, SdkMatch, SdkMessage, SdkReason, SdkStatus, SdkSubtype, SdkType, SdkUsageField } from "./sdk-constants.ts";

export type SdkFinal =
  | { readonly ok: true; readonly text: string; readonly output: JsonValue | null; readonly turns: number }
  | { readonly ok: false; readonly failure: RunFailure };

export interface SdkDecoderInput {
  readonly redact: (text: string) => string;
  readonly resumeSessionId: string | null;
}

export interface SdkDecoder {
  feed(message: unknown): readonly AgentEvent[];
  flush(): readonly AgentEvent[];
  final(): SdkFinal | null;
  storeError(): string | null;
  assistantSeen(): boolean;
  sessionId(): SessionId | null;
  checkpoint(): string | null;
  usage(): readonly TurnUsage[];
  model(): string | null;
  output(text: string, output: JsonValue | null, turns: number): AgentOutput;
}

interface Pending {
  readonly id: string;
  readonly turn: number;
  readonly model: string | null;
  readonly input: number;
  readonly cacheWrite: number;
  readonly cacheRead: number;
  readonly output: number;
}

function textOf(row: Row, redact: (text: string) => string): string {
  const errors = Array.isArray(row[SdkField.Errors]) ? (row[SdkField.Errors] as unknown[]).filter((item): item is string => typeof item === "string") : [];
  return redact(tailBytes([str(row[SdkField.Result]), ...errors].filter((part): part is string => part !== null && part !== "").join("\n"), FAILURE_TAIL_BYTES));
}

export function errorText(error: unknown, redact: (text: string) => string): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return redact(tailBytes(raw, FAILURE_TAIL_BYTES));
}

function runFailure(row: Row, message: string, stderrTail: string, redact: (text: string) => string): RunFailure {
  const status = num(row[SdkField.ApiErrorStatus]);
  if (status === SdkStatus.Unauthorized || status === SdkStatus.Forbidden) {
    return { kind: "auth-rejected", message: SdkMessage.AuthRejected, stderrTail: redact(tailBytes(message, FAILURE_TAIL_BYTES)) };
  }
  return { kind: "exit", message: SdkMessage.RunFailed, code: null, signal: null, stderrTail: redact(tailBytes(message === "" ? stderrTail : message, FAILURE_TAIL_BYTES)) };
}

function finalOf(row: Row, input: SdkDecoderInput, seenAssistant: boolean): SdkFinal {
  const subtype = str(row[SdkField.Subtype]);
  const turns = count(row[SdkField.NumTurns]);
  const message = textOf(row, input.redact);
  if (subtype === SdkSubtype.Success && row[SdkField.IsError] !== true) {
    const structured = row[SdkField.StructuredOutput];
    return { ok: true, text: str(row[SdkField.Result]) ?? "", output: structured === undefined ? null : (structured as JsonValue), turns };
  }
  if (subtype === SdkSubtype.MaxTurns) {
    return { ok: false, failure: { kind: "max-turns", message: SdkMessage.MaxTurns, turns } };
  }
  if (subtype === SdkSubtype.StructuredRetries) {
    return { ok: false, failure: { kind: "unparsable", message: SdkMessage.StructuredRetries, reason: SdkReason.StructuredRetries } };
  }
  if (!seenAssistant && input.resumeSessionId !== null && SdkMatch.NoSession.test(message)) {
    return { ok: false, failure: { kind: "session-not-found", message: SdkMessage.SessionNotFound, sessionId: input.resumeSessionId } };
  }
  return { ok: false, failure: runFailure(row, message, "", input.redact) };
}

function toolNames(value: unknown): ReadonlySet<string> {
  return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
}

export function createSdkDecoder(input: SdkDecoderInput): SdkDecoder {
  let sessionId: SessionId | null = null;
  let checkpoint: string | null = null;
  let announced: string | null = null;
  let announcedCheckpoint: string | null = null;
  let listed: ReadonlySet<string> | null = null;
  let model: string | null = null;
  let seen = false;
  let turn = 0;
  let pending: Pending | null = null;
  let final: SdkFinal | null = null;
  let mirror: string | null = null;
  const warned = new Set<string>();
  const usage: TurnUsage[] = [];

  function sessionEvent(): AgentEvent[] {
    if (sessionId === null || (announced === sessionId && announcedCheckpoint === checkpoint)) {
      return [];
    }
    announced = sessionId;
    announcedCheckpoint = checkpoint;
    return [{ kind: "session", id: sessionId, checkpoint }];
  }

  function flushPending(): AgentEvent[] {
    if (pending === null) {
      return [];
    }
    const done = pending;
    pending = null;
    if (done.model === ClaudeModel.Synthetic) {
      return [];
    }
    const entry: TurnUsage = { turn: done.turn, model: done.model, input: done.input, cacheWrite: done.cacheWrite, cacheRead: done.cacheRead, output: done.output };
    usage.push(entry);
    return [{ kind: "usage", ...entry }];
  }

  function adopt(row: Row): void {
    const id = asSessionId(str(row[SdkField.SessionId]) ?? "");
    if (id !== null) {
      sessionId = id;
    }
  }

  function blocks(row: Row, top: boolean): AgentEvent[] {
    const out: AgentEvent[] = [];
    if (!top) {
      return out;
    }
    for (const block of arr(obj(row[SdkField.Message])[SdkField.Content])) {
      const type = block[SdkField.Type];
      if (type === ClaudeBlockType.Text) {
        const text = str(block[SdkField.Text]);
        if (text !== null && text !== "") {
          out.push({ kind: "text", text: input.redact(text) });
        }
      } else if (type === ClaudeBlockType.ToolUse) {
        const id = str(block[SdkField.Id]) ?? "";
        const name = str(block[SdkField.Name]) ?? "";
        out.push({ kind: "tool", id, name, class: claudeToolClass(name), target: claudeToolTarget(obj(block[SdkField.Input])) });
        if (listed !== null && !listed.has(name) && name !== SDK_STRUCTURED_OUTPUT_TOOL && !warned.has(id)) {
          warned.add(id);
          out.push({ kind: "refused", id, tool: name, source: "unknown-tool", reason: SdkReason.UnknownTool, text: null });
        }
      }
    }
    return out;
  }

  function assistant(row: Row): AgentEvent[] {
    const message = obj(row[SdkField.Message]);
    const top = row[SdkField.Parent] === null || row[SdkField.Parent] === undefined;
    const id = str(message[SdkField.Id]) ?? str(row[SdkField.Uuid]) ?? "";
    const events: AgentEvent[] = [];
    seen = true;
    adopt(row);
    const messageModel = str(message[SdkField.Model]);
    if (top && messageModel !== null && messageModel !== ClaudeModel.Synthetic) {
      model = messageModel;
    }
    const raw = obj(message[SdkField.Usage]);
    const fresh = pending === null || pending.id !== id;
    if (fresh) {
      events.push(...flushPending());
      turn += 1;
      if (top) {
        events.push({ kind: "turn", n: turn });
      }
    }
    pending = {
      id,
      turn: fresh ? turn : (pending?.turn ?? turn),
      model: messageModel,
      input: count(raw[SdkUsageField.Input]),
      cacheWrite: count(raw[SdkUsageField.CacheWrite]),
      cacheRead: count(raw[SdkUsageField.CacheRead]),
      output: count(raw[SdkUsageField.Output]),
    };
    events.push(...blocks(row, top));
    if (top) {
      const uuid = str(row[SdkField.Uuid]);
      if (uuid !== null) {
        checkpoint = uuid;
      }
    }
    events.push(...sessionEvent());
    return events;
  }

  function system(row: Row): AgentEvent[] {
    const subtype = str(row[SdkField.Subtype]);
    if (subtype === SdkSubtype.Init) {
      adopt(row);
      listed = toolNames(row[SdkField.Tools]);
      model = str(row[SdkField.Model]) ?? model;
      return sessionEvent();
    }
    if (subtype === SdkSubtype.MirrorError) {
      mirror = input.redact(str(row[SdkField.Error]) ?? SdkMessage.StoreFailed);
    }
    return [];
  }

  function result(row: Row): AgentEvent[] {
    const events = flushPending();
    final = finalOf(row, input, seen);
    if (seen || final.ok) {
      adopt(row);
    }
    if (final.ok && final.output !== null) {
      events.push({ kind: "output", value: final.output });
    }
    events.push(...sessionEvent());
    return events;
  }

  return {
    feed(message) {
      const row = obj(message);
      const type = str(row[SdkField.Type]);
      if (type === SdkType.System) {
        return system(row);
      }
      if (type === SdkType.Assistant) {
        return assistant(row);
      }
      if (type === SdkType.Result) {
        return result(row);
      }
      if (type === SdkType.User || type === SdkType.RateLimit) {
        return [];
      }
      return [{ kind: "unrecognised", payload: redactValue(message, input.redact) }];
    },
    flush: flushPending,
    final: () => final,
    storeError: () => mirror,
    assistantSeen: () => seen,
    sessionId: () => sessionId,
    checkpoint: () => checkpoint,
    usage: () => usage,
    model: () => model,
    output(text, output, turns) {
      return { text, output, sessionId, checkpoint, turns, usage, model };
    },
  };
}
