import type { z } from "zod";
import { CodexHook } from "./names.ts";
import { schema as Interrupt } from "./events/Interrupt.ts";
import { schema as PermissionRequest } from "./events/PermissionRequest.ts";
import { schema as PostCompact } from "./events/PostCompact.ts";
import { schema as PostModelRequest } from "./events/PostModelRequest.ts";
import { schema as PostToolUse } from "./events/PostToolUse.ts";
import { schema as PreCompact } from "./events/PreCompact.ts";
import { schema as PreModelRequest } from "./events/PreModelRequest.ts";
import { schema as PreToolUse } from "./events/PreToolUse.ts";
import { schema as SessionEnd } from "./events/SessionEnd.ts";
import { schema as SessionStart } from "./events/SessionStart.ts";
import { schema as Stop } from "./events/Stop.ts";
import { schema as SubagentStart } from "./events/SubagentStart.ts";
import { schema as SubagentStop } from "./events/SubagentStop.ts";
import { schema as UserPromptSubmit } from "./events/UserPromptSubmit.ts";

export const schemas: ReadonlyMap<string, z.ZodType> = new Map<string, z.ZodType>([
  [CodexHook.Interrupt, Interrupt],
  [CodexHook.PermissionRequest, PermissionRequest],
  [CodexHook.PostCompact, PostCompact],
  [CodexHook.PostModelRequest, PostModelRequest],
  [CodexHook.PostToolUse, PostToolUse],
  [CodexHook.PreCompact, PreCompact],
  [CodexHook.PreModelRequest, PreModelRequest],
  [CodexHook.PreToolUse, PreToolUse],
  [CodexHook.SessionEnd, SessionEnd],
  [CodexHook.SessionStart, SessionStart],
  [CodexHook.Stop, Stop],
  [CodexHook.SubagentStart, SubagentStart],
  [CodexHook.SubagentStop, SubagentStop],
  [CodexHook.UserPromptSubmit, UserPromptSubmit],
]);
