import { z } from "zod";
import type { Common } from "../port.ts";
import type { MetaValue } from "../core/event.ts";

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
