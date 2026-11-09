export const OpenCodeDir = {
  Data: "opencode",
  Database: "opencode.db",
} as const;

export const OpenCodeRecord = {
  Part: "part",
  Message: "message",
} as const;

export const OpenCodeField = {
  Id: "id",
  Type: "type",
  Text: "text",
  Synthetic: "synthetic",
  Ignored: "ignored",
  Tool: "tool",
  State: "state",
  Input: "input",
  Status: "status",
  Time: "time",
  Start: "start",
  Created: "created",
  Completed: "completed",
  Role: "role",
  Summary: "summary",
  Mode: "mode",
  ProviderId: "providerID",
  ModelId: "modelID",
  Model: "model",
  TimeUpdated: "time_updated",
  Title: "title",
  Data: "data",
} as const;

export const OpenCodePartType = {
  Text: "text",
  Tool: "tool",
  StepStart: "step-start",
  StepFinish: "step-finish",
  Reasoning: "reasoning",
} as const;

export const OpenCodeKind = {
  Text: "text",
  Tool: "tool",
  Other: "other",
} as const;

export type OpenCodeKind = (typeof OpenCodeKind)[keyof typeof OpenCodeKind];

export const OpenCodeStatus = {
  Completed: "completed",
  Error: "error",
  Pending: "pending",
  Running: "running",
} as const;

export const OpenCodeRoleName = {
  User: "user",
  Assistant: "assistant",
} as const;

export const OpenCodeModeName = {
  Build: "build",
  Compaction: "compaction",
} as const;

export const OpenCodeSql = {
  RootSession:
    "SELECT id FROM session WHERE directory = ? AND parent_id IS NULL AND time_archived IS NULL ORDER BY time_updated DESC LIMIT 1",
  SessionTitle: "SELECT title FROM session WHERE id = ?",
  MessagesSince: "SELECT id, time_updated, data FROM message WHERE session_id = ? AND time_updated > ? ORDER BY time_created DESC LIMIT ?",
  RecentMessages: "SELECT id, time_updated, data FROM message WHERE session_id = ? ORDER BY time_created DESC LIMIT ?",
  PartsOf: "SELECT data FROM part WHERE message_id = ? ORDER BY time_created ASC",
  RecentParts:
    "SELECT p.data FROM part AS p JOIN (SELECT id FROM message WHERE session_id = ? ORDER BY time_created DESC LIMIT ?) AS newest ON newest.id = p.message_id ORDER BY p.time_created ASC",
} as const;
