// Every closed set of values Codex payloads carry, in one place. Event schemas import from here, so a set is stated once.
// Validation only observes: a value outside a set is logged as `<path>: invalid_value` and the request is answered as usual.
import { z } from "zod";

/** Closed set from the pinned Codex input schemas (openai/codex @ 57e64682f8ef83c09cc868c39010733dd6760805). */
export const CompactTrigger = z.enum(["manual", "auto"]);

/** Closed set from the pinned Codex input schemas (openai/codex @ 57e64682f8ef83c09cc868c39010733dd6760805). */
export const ModelRequestStatus = z.enum(["completed", "failed", "cancelled"]);

/** Closed set from the pinned Codex input schemas (openai/codex @ 57e64682f8ef83c09cc868c39010733dd6760805). */
export const PermissionMode = z.enum(["default", "acceptEdits", "plan", "dontAsk", "bypassPermissions"]);

/** Closed set from the pinned Codex input schemas (openai/codex @ 57e64682f8ef83c09cc868c39010733dd6760805). */
export const SessionStartSource = z.enum(["startup", "resume", "clear", "compact", "fork"]);
