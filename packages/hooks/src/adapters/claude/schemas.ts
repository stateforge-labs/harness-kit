import type { z } from "zod";
import { ClaudeHook } from "./names.ts";
import { schema as ConfigChange } from "./events/ConfigChange.ts";
import { schema as CwdChanged } from "./events/CwdChanged.ts";
import { schema as DirectoryAdded } from "./events/DirectoryAdded.ts";
import { schema as Elicitation } from "./events/Elicitation.ts";
import { schema as ElicitationResult } from "./events/ElicitationResult.ts";
import { schema as FileChanged } from "./events/FileChanged.ts";
import { schema as InstructionsLoaded } from "./events/InstructionsLoaded.ts";
import { schema as MessageDisplay } from "./events/MessageDisplay.ts";
import { schema as Notification } from "./events/Notification.ts";
import { schema as PermissionDenied } from "./events/PermissionDenied.ts";
import { schema as PermissionRequest } from "./events/PermissionRequest.ts";
import { schema as PostCompact } from "./events/PostCompact.ts";
import { schema as PostModelSwitch } from "./events/PostModelSwitch.ts";
import { schema as PostToolBatch } from "./events/PostToolBatch.ts";
import { schema as PostToolUse } from "./events/PostToolUse.ts";
import { schema as PostToolUseFailure } from "./events/PostToolUseFailure.ts";
import { schema as PreCompact } from "./events/PreCompact.ts";
import { schema as PreModelSwitch } from "./events/PreModelSwitch.ts";
import { schema as PreToolUse } from "./events/PreToolUse.ts";
import { schema as SessionEnd } from "./events/SessionEnd.ts";
import { schema as SessionStart } from "./events/SessionStart.ts";
import { schema as Setup } from "./events/Setup.ts";
import { schema as Stop } from "./events/Stop.ts";
import { schema as StopFailure } from "./events/StopFailure.ts";
import { schema as SubagentStart } from "./events/SubagentStart.ts";
import { schema as SubagentStop } from "./events/SubagentStop.ts";
import { schema as TaskCompleted } from "./events/TaskCompleted.ts";
import { schema as TaskCreated } from "./events/TaskCreated.ts";
import { schema as TeammateIdle } from "./events/TeammateIdle.ts";
import { schema as UserPromptExpansion } from "./events/UserPromptExpansion.ts";
import { schema as UserPromptSubmit } from "./events/UserPromptSubmit.ts";
import { schema as WorktreeCreate } from "./events/WorktreeCreate.ts";
import { schema as WorktreeRemove } from "./events/WorktreeRemove.ts";

export const schemas: ReadonlyMap<string, z.ZodType> = new Map<string, z.ZodType>([
  [ClaudeHook.ConfigChange, ConfigChange],
  [ClaudeHook.CwdChanged, CwdChanged],
  [ClaudeHook.DirectoryAdded, DirectoryAdded],
  [ClaudeHook.Elicitation, Elicitation],
  [ClaudeHook.ElicitationResult, ElicitationResult],
  [ClaudeHook.FileChanged, FileChanged],
  [ClaudeHook.InstructionsLoaded, InstructionsLoaded],
  [ClaudeHook.MessageDisplay, MessageDisplay],
  [ClaudeHook.Notification, Notification],
  [ClaudeHook.PermissionDenied, PermissionDenied],
  [ClaudeHook.PermissionRequest, PermissionRequest],
  [ClaudeHook.PostCompact, PostCompact],
  [ClaudeHook.PostModelSwitch, PostModelSwitch],
  [ClaudeHook.PostToolBatch, PostToolBatch],
  [ClaudeHook.PostToolUse, PostToolUse],
  [ClaudeHook.PostToolUseFailure, PostToolUseFailure],
  [ClaudeHook.PreCompact, PreCompact],
  [ClaudeHook.PreModelSwitch, PreModelSwitch],
  [ClaudeHook.PreToolUse, PreToolUse],
  [ClaudeHook.SessionEnd, SessionEnd],
  [ClaudeHook.SessionStart, SessionStart],
  [ClaudeHook.Setup, Setup],
  [ClaudeHook.Stop, Stop],
  [ClaudeHook.StopFailure, StopFailure],
  [ClaudeHook.SubagentStart, SubagentStart],
  [ClaudeHook.SubagentStop, SubagentStop],
  [ClaudeHook.TaskCompleted, TaskCompleted],
  [ClaudeHook.TaskCreated, TaskCreated],
  [ClaudeHook.TeammateIdle, TeammateIdle],
  [ClaudeHook.UserPromptExpansion, UserPromptExpansion],
  [ClaudeHook.UserPromptSubmit, UserPromptSubmit],
  [ClaudeHook.WorktreeCreate, WorktreeCreate],
  [ClaudeHook.WorktreeRemove, WorktreeRemove],
]);
