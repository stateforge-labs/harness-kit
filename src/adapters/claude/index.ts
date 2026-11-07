import { z } from "zod";
import { schemas } from "./schemas.ts";

/** What the Claude adapter says about one payload. Paths only, never values: a path is safe to log. */
export interface Validation {
  /** Keys the event requires that are absent, as dotted paths (`tool_input.command`). */
  missing: string[];
  /** Keys that are present with the wrong shape, as `path: expected <type>`. */
  wrong_type: string[];
}

/** True when the adapter has a schema for this event name. */
export const hasSchema = (event: string): boolean => schemas.has(event);

const at = (root: unknown, path: PropertyKey[]): unknown =>
  path.reduce<unknown>((v, k) => (v !== null && typeof v === "object" ? (v as Record<PropertyKey, unknown>)[k] : undefined), root);

/** Check a payload against its event schema. Never throws and never rejects: it only reports. */
export function validate(payload: Record<string, unknown>): Validation | null {
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

/** JSON Schema (draft 2020-12) for every event, for documentation. Checks such as the per-tool input are not included. */
export function jsonSchemas(): Record<string, unknown> {
  return Object.fromEntries([...schemas].map(([name, s]) => [name, z.toJSONSchema(s, { io: "input", unrepresentable: "any" })]));
}
