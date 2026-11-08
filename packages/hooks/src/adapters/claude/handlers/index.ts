import type { EventHandler } from "./types.ts";
import { handler as ConfigChange } from "./ConfigChange.ts";
import { handler as CwdChanged } from "./CwdChanged.ts";
import { handler as DirectoryAdded } from "./DirectoryAdded.ts";
import { handler as Elicitation } from "./Elicitation.ts";
import { handler as ElicitationResult } from "./ElicitationResult.ts";
import { handler as FileChanged } from "./FileChanged.ts";
import { handler as InstructionsLoaded } from "./InstructionsLoaded.ts";
import { handler as MessageDisplay } from "./MessageDisplay.ts";
import { handler as Notification } from "./Notification.ts";
import { handler as PermissionDenied } from "./PermissionDenied.ts";
import { handler as PermissionRequest } from "./PermissionRequest.ts";
import { handler as PostCompact } from "./PostCompact.ts";
import { handler as PostModelSwitch } from "./PostModelSwitch.ts";
import { handler as PostToolBatch } from "./PostToolBatch.ts";
import { handler as PostToolUse } from "./PostToolUse.ts";
import { handler as PostToolUseFailure } from "./PostToolUseFailure.ts";
import { handler as PreCompact } from "./PreCompact.ts";
import { handler as PreModelSwitch } from "./PreModelSwitch.ts";
import { handler as PreToolUse } from "./PreToolUse.ts";
import { handler as SessionEnd } from "./SessionEnd.ts";
import { handler as SessionStart } from "./SessionStart.ts";
import { handler as Setup } from "./Setup.ts";
import { handler as Stop } from "./Stop.ts";
import { handler as StopFailure } from "./StopFailure.ts";
import { handler as SubagentStart } from "./SubagentStart.ts";
import { handler as SubagentStop } from "./SubagentStop.ts";
import { handler as TaskCompleted } from "./TaskCompleted.ts";
import { handler as TaskCreated } from "./TaskCreated.ts";
import { handler as TeammateIdle } from "./TeammateIdle.ts";
import { handler as UserPromptExpansion } from "./UserPromptExpansion.ts";
import { handler as UserPromptSubmit } from "./UserPromptSubmit.ts";
import { handler as WorktreeCreate } from "./WorktreeCreate.ts";
import { handler as WorktreeRemove } from "./WorktreeRemove.ts";

export const handlers: ReadonlyMap<string, EventHandler> = new Map([
  [ConfigChange.event, ConfigChange],
  [CwdChanged.event, CwdChanged],
  [DirectoryAdded.event, DirectoryAdded],
  [Elicitation.event, Elicitation],
  [ElicitationResult.event, ElicitationResult],
  [FileChanged.event, FileChanged],
  [InstructionsLoaded.event, InstructionsLoaded],
  [MessageDisplay.event, MessageDisplay],
  [Notification.event, Notification],
  [PermissionDenied.event, PermissionDenied],
  [PermissionRequest.event, PermissionRequest],
  [PostCompact.event, PostCompact],
  [PostModelSwitch.event, PostModelSwitch],
  [PostToolBatch.event, PostToolBatch],
  [PostToolUse.event, PostToolUse],
  [PostToolUseFailure.event, PostToolUseFailure],
  [PreCompact.event, PreCompact],
  [PreModelSwitch.event, PreModelSwitch],
  [PreToolUse.event, PreToolUse],
  [SessionEnd.event, SessionEnd],
  [SessionStart.event, SessionStart],
  [Setup.event, Setup],
  [Stop.event, Stop],
  [StopFailure.event, StopFailure],
  [SubagentStart.event, SubagentStart],
  [SubagentStop.event, SubagentStop],
  [TaskCompleted.event, TaskCompleted],
  [TaskCreated.event, TaskCreated],
  [TeammateIdle.event, TeammateIdle],
  [UserPromptExpansion.event, UserPromptExpansion],
  [UserPromptSubmit.event, UserPromptSubmit],
  [WorktreeCreate.event, WorktreeCreate],
  [WorktreeRemove.event, WorktreeRemove],
]);
