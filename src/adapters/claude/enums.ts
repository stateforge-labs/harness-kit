// Every closed set of values Claude payloads carry, in one place. Event schemas import from here, so a set is stated once.
// Validation only observes: a value outside a set is logged as `<path>: invalid_value` and the request is answered as usual.
import { z } from "zod";

/** Seen so far in captures, not exhaustive: a value outside this list is logged as invalid_value (the request is still answered). */
export const CacheTtl = z.enum(["1h"]);

/** Seen so far in captures, not exhaustive: a value outside this list is logged as invalid_value (the request is still answered). */
export const CommandSource = z.enum(["plugin", "projectSettings"]);

/** Seen so far in captures, not exhaustive: a value outside this list is logged as invalid_value (the request is still answered). */
export const CompactTrigger = z.enum(["manual", "auto"]);

/** Seen so far in captures, not exhaustive: a value outside this list is logged as invalid_value (the request is still answered). */
export const ConfigChangeSource = z.enum(["local_settings", "project_settings", "skills", "user_settings"]);

/** Seen so far in captures, not exhaustive: a value outside this list is logged as invalid_value (the request is still answered). */
export const DirectoryAddedSource = z.enum(["register_repo_root"]);

/** Seen so far in captures, not exhaustive: a value outside this list is logged as invalid_value (the request is still answered). */
export const ElicitationAction = z.enum(["cancel"]);

/** Seen so far in captures, not exhaustive: a value outside this list is logged as invalid_value (the request is still answered). */
export const ElicitationMode = z.enum(["form", "url"]);

/** Seen so far in captures, not exhaustive: a value outside this list is logged as invalid_value (the request is still answered). */
export const ExpansionType = z.enum(["slash_command"]);

/** Seen so far in captures, not exhaustive: a value outside this list is logged as invalid_value (the request is still answered). */
export const FileChangeEvent = z.enum(["add", "change", "unlink"]);

/** Seen so far in captures, not exhaustive: a value outside this list is logged as invalid_value (the request is still answered). */
export const InstructionsLoadReason = z.enum(["include", "nested_traversal", "path_glob_match", "session_start"]);

/** Seen so far in captures, not exhaustive: a value outside this list is logged as invalid_value (the request is still answered). */
export const MemoryType = z.enum(["Project"]);

/** Seen so far in captures, not exhaustive: a value outside this list is logged as invalid_value (the request is still answered). */
export const ModelSwitchSource = z.enum(["command"]);

/** Seen so far in captures, not exhaustive: a value outside this list is logged as invalid_value (the request is still answered). */
export const NotificationType = z.enum(["permission_prompt"]);

/** default, acceptEdits and auto were seen in captures; the others are documented but were never captured. A value outside this list is logged as invalid_value. */
export const PermissionMode = z.enum(["default", "plan", "acceptEdits", "auto", "dontAsk", "bypassPermissions"]);

/** Seen so far in captures, not exhaustive: a value outside this list is logged as invalid_value (the request is still answered). */
export const SessionEndReason = z.enum(["other"]);

/** startup, resume and clear were seen in captures; compact and fork are documented but were never captured. A value outside this list is logged as invalid_value. */
export const SessionStartSource = z.enum(["startup", "resume", "clear", "compact", "fork"]);

/** Seen so far in captures, not exhaustive: a value outside this list is logged as invalid_value (the request is still answered). */
export const SetupTrigger = z.enum(["init", "maintenance"]);

/** Seen so far in captures, not exhaustive: a value outside this list is logged as invalid_value (the request is still answered). */
export const StopFailureError = z.enum(["authentication_failed", "model_not_found", "rate_limit", "server_error", "unknown"]);
