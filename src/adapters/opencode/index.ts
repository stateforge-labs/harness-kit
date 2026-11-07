import { jsonSchemasOf, validateWith, type Validation } from "../shared.ts";
import { schemas } from "./schemas.ts";

export type { Validation };

/** True when the adapter has a schema for this event name. */
export const hasSchema = (event: string): boolean => schemas.has(event);

/** Check a payload against its event schema. Never throws and never rejects: it only reports. */
export const validate = (payload: Record<string, unknown>): Validation | null => validateWith(schemas, payload);

/** JSON Schema (draft 2020-12) for every event, for documentation. */
export const jsonSchemas = (): Record<string, unknown> => jsonSchemasOf(schemas);
