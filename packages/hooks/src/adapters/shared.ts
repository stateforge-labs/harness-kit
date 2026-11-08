import { z } from "zod";
import type { Common } from "../port.ts";
import type { MetaValue, NeutralKind, ToolRef } from "../core/event.ts";
import { continueText, denyText, type NeutralReply } from "../core/reply.ts";

/** What a validation says about one payload: paths only, never values, so it is safe to log. */
export interface Validation {
  /** Keys the event requires that are absent, as dotted paths (`tool_input.command`). */
  missing: string[];
  /** Keys that are present with the wrong shape, as `path: expected <type>`. */
  wrong_type: string[];
}

const at = (root: unknown, path: PropertyKey[]): unknown =>
  path.reduce<unknown>((v, k) => (v !== null && typeof v === "object" ? (v as Record<PropertyKey, unknown>)[k] : undefined), root);

/** Check a payload against the schema of its `hook_event_name`. Never throws and never rejects: it only reports. Null when there is no schema. */
export function validateWith(schemas: ReadonlyMap<string, z.ZodType>, payload: Record<string, unknown>): Validation | null {
  const name = payload.hook_event_name;
  const schema = typeof name === "string" ? schemas.get(name) : undefined;
  if (!schema) return null;
  const result = schema.safeParse(payload);
  const out: Validation = { missing: [], wrong_type: [] };
  if (result.success) return out;
  for (const issue of result.error.issues) {
    const path = issue.path.join(".") || "(payload)";
    if (at(payload, issue.path) === undefined) out.missing.push(path);
    else out.wrong_type.push(`${path}: ${issue.code === "invalid_type" ? `expected ${issue.expected}` : issue.code}`);
  }
  return out;
}

/** JSON Schema (draft 2020-12) for every event, for documentation. Checks that are code, not schema, are not included. */
export function jsonSchemasOf(schemas: ReadonlyMap<string, z.ZodType>): Record<string, unknown> {
  return Object.fromEntries([...schemas].map(([name, s]) => [name, z.toJSONSchema(s, { io: "input", unrepresentable: "any" })]));
}

/** The fields every log line carries, read with the key names Claude Code and Codex share. Plain reads; cannot throw. */
export const commonFields = (raw: Record<string, unknown>): Common => ({
  event: raw.hook_event_name,
  session_id: raw.session_id,
  agent_id: raw.agent_id,
  agent_type: raw.agent_type,
  tool_name: raw.tool_name,
});

export interface HookPayload {
  hook_event_name?: string;
  session_id?: string;
  agent_id?: string;
  agent_type?: string;
  tool_name?: string;
  cwd?: string;
  [key: string]: unknown;
}

/** What an adapter knows about one native event beyond its schema: the log metadata. Files in <adapter>/handlers/<Event>.ts export `handler`. */
export interface EventHandler {
  /** Exact hook_event_name this handler serves. */
  event: string;
  /** Non-sensitive scalars for the log line. Never prompt text, tool input or tool output. */
  meta(p: HookPayload): Record<string, MetaValue>;
}

/** Where a Claude-style harness (Claude Code, Codex: same output shapes) takes each reply field, by native event name. */
export interface HookOutputRules {
  /** Events whose answer may carry `hookSpecificOutput.additionalContext`. */
  context: ReadonlySet<string>;
  /** Events where `{ decision: "block", reason }` keeps the agent going (a continue). */
  stop: ReadonlySet<string>;
}

/**
 * The answer body for a Claude-style harness (contract v1; the matrix is in docs/architecture.md):
 * - PreToolUse: deny is `permissionDecision: "deny"` with the reason, and wins over context; allow is never encoded here,
 *   because it would skip the user's own permission prompts.
 * - PermissionRequest: deny is `decision.behavior "deny"` with `message`; allow is `decision.behavior "allow"`. Only these keys:
 *   Codex fails closed on `updatedInput`, `updatedPermissions` or `interrupt: true`.
 * - stop events: continue is `decision: "block"` with the reason. Deny and context are not encoded: a block means "go on",
 *   the opposite of a deny, and context on Stop is itself a continuation.
 * - context on the events in `rules.context`, as before contract v1.
 * Everything else is `{}`.
 */
export function encodeHookOutput(reply: NeutralReply, native: string | undefined, rules: HookOutputRules): Record<string, unknown> {
  if (!native) return {};
  if (native === "PreToolUse" && reply.deny) {
    return { hookSpecificOutput: { hookEventName: native, permissionDecision: "deny", permissionDecisionReason: denyText(reply.deny) } };
  }
  if (native === "PermissionRequest") {
    if (reply.deny) return { hookSpecificOutput: { hookEventName: native, decision: { behavior: "deny", message: denyText(reply.deny) } } };
    if (reply.allow) return { hookSpecificOutput: { hookEventName: native, decision: { behavior: "allow" } } };
    return {};
  }
  if (rules.stop.has(native)) return reply.continue ? { decision: "block", reason: continueText(reply.continue) } : {};
  if (reply.context && rules.context.has(native)) return { hookSpecificOutput: { hookEventName: native, additionalContext: reply.context } };
  return {};
}

/** A string field, or null. */
export const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

/** Neutral kinds whose event names a tool. */
export const TOOL_KINDS: ReadonlySet<NeutralKind> = new Set<NeutralKind>(["pre-tool", "post-tool", "post-tool-failure", "permission-request"]);

/** The tool a tool event is about, from the payload's tool-name and call-id keys; undefined when it names no tool. */
export function toolOf(kind: NeutralKind, name: unknown, callId: unknown): ToolRef | undefined {
  if (!TOOL_KINDS.has(kind)) return undefined;
  const n = str(name);
  return n ? { name: n, callId: str(callId) } : undefined;
}
