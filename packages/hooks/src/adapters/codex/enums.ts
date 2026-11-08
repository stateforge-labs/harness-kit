import { z } from "zod";

export const CompactTrigger = z.enum(["manual", "auto"]);

export const ModelRequestStatus = z.enum(["completed", "failed", "cancelled"]);

export const PermissionMode = z.enum(["default", "acceptEdits", "plan", "dontAsk", "bypassPermissions"]);

export const SessionStartSource = z.enum(["startup", "resume", "clear", "compact", "fork"]);
