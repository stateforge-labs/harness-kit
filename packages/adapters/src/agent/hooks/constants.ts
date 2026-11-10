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

export const SocketHarness = { Codex: "codex", OpenCode: "opencode" } as const;
export type SocketHarness = (typeof SocketHarness)[keyof typeof SocketHarness];

export const WIRING_CAPABILITY = "hooks";

export const WiringField = {
  Socket: "hooks.socket",
  SocketPath: "hooks.socket.path",
  ShimDir: "hooks.socket.shimDir",
} as const;

export const WiringWhy = { PluginSpeaksHttp: "opencode-hooks-are-a-plugin-over-http" } as const;

export const WiringMessage = {
  NoSocket: "this harness reaches the hook pipeline through a socket, and the hook target carries none",
  NotAbsolute: "the socket path and the shim directory must be absolute",
  PluginSpeaksHttp: "OpenCode hooks are a plugin that speaks HTTP; it cannot use a unix socket",
} as const;

export const SHIM_FILE_PREFIX = "harness-hooks-";
export const SHIM_FILE_SUFFIX = ".sh";
export const HOOKS_FILE_NAME = "hooks.json";
export const HOOKS_FILE_INDENT = 2;
export const COMMAND_HANDLER = "command";
