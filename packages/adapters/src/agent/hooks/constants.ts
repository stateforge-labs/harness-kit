import { Kind, type NeutralKind } from "@stateforge-labs/harness-hooks";
import { HookPoint } from "../constants.ts";

export const SESSION_START_SOURCE = "startup";

export const HookField = {
  SessionId: "session_id",
  TranscriptPath: "transcript_path",
  Cwd: "cwd",
  EventName: "hook_event_name",
  Source: "source",
  ToolName: "tool_name",
  ToolUseId: "tool_use_id",
} as const;

export const CONTEXT_POINTS: Readonly<Partial<Record<NeutralKind, HookPoint>>> = {
  [Kind.SessionStart]: HookPoint.SessionStart,
  [Kind.PromptSubmit]: HookPoint.PromptSubmit,
  [Kind.PreTool]: HookPoint.PreTool,
  [Kind.PostTool]: HookPoint.PostTool,
  [Kind.Stop]: HookPoint.Stop,
};
