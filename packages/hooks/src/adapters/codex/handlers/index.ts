import type { EventHandler } from "./types.ts";
import { handler as Interrupt } from "./Interrupt.ts";
import { handler as PermissionRequest } from "./PermissionRequest.ts";
import { handler as PostCompact } from "./PostCompact.ts";
import { handler as PostModelRequest } from "./PostModelRequest.ts";
import { handler as PostToolUse } from "./PostToolUse.ts";
import { handler as PreCompact } from "./PreCompact.ts";
import { handler as PreModelRequest } from "./PreModelRequest.ts";
import { handler as PreToolUse } from "./PreToolUse.ts";
import { handler as SessionEnd } from "./SessionEnd.ts";
import { handler as SessionStart } from "./SessionStart.ts";
import { handler as Stop } from "./Stop.ts";
import { handler as SubagentStart } from "./SubagentStart.ts";
import { handler as SubagentStop } from "./SubagentStop.ts";
import { handler as UserPromptSubmit } from "./UserPromptSubmit.ts";

export const handlers: ReadonlyMap<string, EventHandler> = new Map([
  [Interrupt.event, Interrupt],
  [PermissionRequest.event, PermissionRequest],
  [PostCompact.event, PostCompact],
  [PostModelRequest.event, PostModelRequest],
  [PostToolUse.event, PostToolUse],
  [PreCompact.event, PreCompact],
  [PreModelRequest.event, PreModelRequest],
  [PreToolUse.event, PreToolUse],
  [SessionEnd.event, SessionEnd],
  [SessionStart.event, SessionStart],
  [Stop.event, Stop],
  [SubagentStart.event, SubagentStart],
  [SubagentStop.event, SubagentStop],
  [UserPromptSubmit.event, UserPromptSubmit],
]);
