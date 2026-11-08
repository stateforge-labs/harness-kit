import { jsonSchemasOf, validateWith, type Validation } from "../shared.ts";
import { schemas } from "./schemas.ts";

export type { Validation };

export const hasSchema = (event: string): boolean => schemas.has(event);

export const validate = (payload: Record<string, unknown>): Validation | null => validateWith(schemas, payload);

export const jsonSchemas = (): Record<string, unknown> => jsonSchemasOf(schemas);
