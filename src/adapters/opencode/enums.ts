// Every closed set of values OpenCode payloads carry, in one place. Event schemas import from here, so a set is stated once.
// Validation only observes: a value outside a set is logged as `<path>: invalid_value` and the request is answered as usual.
// OpenCode 2.2.6 ships no typings for these hooks, so every set is "seen so far" in R-2026-11-07-08 captures, not exhaustive.
import { z } from "zod";

/** Seen: allow. The other effects (deny, ask) are expected but were never triggered (every capture ran with --auto). */
export const PermissionEffect = z.enum(["allow"]);

/** Seen: tool. */
export const PermissionSourceType = z.enum(["tool"]);

/** Seen: steer. */
export const PromptDelivery = z.enum(["steer"]);

/** Seen: completed. A failed tool call was never captured. */
export const ToolStatus = z.enum(["completed"]);

/** Seen: user (SIGINT of `opencode run`). */
export const InterruptReason = z.enum(["user"]);
