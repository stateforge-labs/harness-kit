import { z } from "zod";

export const CacheTtl = z.enum(["1h"]);

export const CommandSource = z.enum(["plugin", "projectSettings"]);

export const CompactTrigger = z.enum(["manual", "auto"]);

export const ConfigChangeSource = z.enum(["local_settings", "project_settings", "skills", "user_settings"]);

export const DirectoryAddedSource = z.enum(["register_repo_root"]);

export const ElicitationAction = z.enum(["cancel"]);

export const ElicitationMode = z.enum(["form", "url"]);

export const ExpansionType = z.enum(["slash_command"]);

export const FileChangeEvent = z.enum(["add", "change", "unlink"]);

export const InstructionsLoadReason = z.enum(["include", "nested_traversal", "path_glob_match", "session_start"]);

export const MemoryType = z.enum(["Project"]);

export const ModelSwitchSource = z.enum(["command"]);

export const NotificationType = z.enum(["permission_prompt"]);

export const PermissionMode = z.enum(["default", "plan", "acceptEdits", "auto", "dontAsk", "bypassPermissions"]);

export const SessionEndReason = z.enum(["other"]);

export const SessionStartSource = z.enum(["startup", "resume", "clear", "compact", "fork"]);

export const SetupTrigger = z.enum(["init", "maintenance"]);

export const StopFailureError = z.enum(["authentication_failed", "model_not_found", "rate_limit", "server_error", "unknown"]);
