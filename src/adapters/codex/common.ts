import { z } from "zod";

/**
 * Fields every Codex hook INPUT payload carries. Derived from the 13 pinned command input schemas in
 * evidence/codex-primary/schemas (*.command.input.schema.json): these four appear in every schema's "required" list.
 * Everything else varies by event (model, permission_mode, turn_id, agent_id, agent_type, ...) and lives in the event file.
 */
export const common = {
  /** Plain string in every schema (model-request types it as AbsolutePathBuf, which is still a string). */
  cwd: z.string(),
  /** Event name. Each schema pins it with a "const"; the allowed value is listed in each events/<EventName>.ts. */
  hook_event_name: z.string(),
  session_id: z.string(),
  /** JSON Schema NullableString: type [string, null]. Required key, nullable value. */
  transcript_path: z.string().nullable(),
};
