import { z } from "zod";
import type { Common } from "../port.ts";
import { Kind, type MetaValue, type NeutralKind, type ToolRef } from "../core/event.ts";

export interface Validation {
  missing: string[];
  wrong_type: string[];
}

const at = (root: unknown, path: PropertyKey[]): unknown =>
  path.reduce<unknown>((v, k) => (v !== null && typeof v === "object" ? (v as Record<PropertyKey, unknown>)[k] : undefined), root);

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

export function jsonSchemasOf(schemas: ReadonlyMap<string, z.ZodType>): Record<string, unknown> {
  return Object.fromEntries([...schemas].map(([name, s]) => [name, z.toJSONSchema(s, { io: "input", unrepresentable: "any" })]));
}

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

export interface EventHandler {
  event: string;
  meta(p: HookPayload): Record<string, MetaValue>;
}

export const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

export const TOOL_KINDS: ReadonlySet<NeutralKind> = new Set<NeutralKind>([Kind.PreTool, Kind.PostTool, Kind.PostToolFailure, Kind.PermissionRequest]);

export function toolOf(kind: NeutralKind, name: unknown, callId: unknown): ToolRef | undefined {
  if (!TOOL_KINDS.has(kind)) return undefined;
  const n = str(name);
  return n ? { name: n, callId: str(callId) } : undefined;
}
