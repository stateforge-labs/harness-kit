export const Harness = { Claude: "claude", Codex: "codex", OpenCode: "opencode" } as const;
export type HarnessId = (typeof Harness)[keyof typeof Harness];
export type MetaValue = string | number | boolean | null;

export const Kind = {
  SessionStart: "session-start",
  SessionEnd: "session-end",
  PromptSubmit: "prompt-submit",
  PreTool: "pre-tool",
  PostTool: "post-tool",
  PostToolFailure: "post-tool-failure",
  PermissionRequest: "permission-request",
  SubagentStart: "subagent-start",
  SubagentStop: "subagent-stop",
  Stop: "stop",
  PreCompact: "pre-compact",
  PostCompact: "post-compact",
  Other: "other",
} as const;
export type NeutralKind = (typeof Kind)[keyof typeof Kind];

export interface Spawn {
  brief: string;
  model: string | null;
}

export interface ToolRef {
  name: string;
  callId: string | null;
}

export interface NeutralEvent {
  harness: HarnessId;
  kind: NeutralKind;
  native: string;
  session: string | null;
  tool?: ToolRef;
  spawn?: Spawn;
}
