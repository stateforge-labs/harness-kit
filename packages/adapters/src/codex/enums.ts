import { z } from "zod";
import { CodexEvent, CodexFeatureName, CodexItem, CodexRoleName, CodexType } from "./constants.ts";

export const CodexRowType = z.enum([
  CodexType.SessionMeta,
  CodexType.TurnContext,
  CodexType.EventMsg,
  CodexType.ResponseItem,
  CodexType.Compacted,
  CodexType.WorldState,
  CodexType.TokenUsageRecord,
  CodexType.InterAgentMetadata,
]);
export type CodexRowType = z.infer<typeof CodexRowType>;

export const CodexEventType = z.enum([
  CodexEvent.TaskStarted,
  CodexEvent.TokenCount,
  CodexEvent.ThreadSettingsApplied,
  CodexEvent.ItemCompleted,
  CodexEvent.TaskComplete,
  CodexEvent.TurnAborted,
  CodexEvent.ThreadGoalUpdated,
]);
export type CodexEventType = z.infer<typeof CodexEventType>;

export const CodexItemType = z.enum([
  CodexItem.Message,
  CodexItem.FunctionCall,
  CodexItem.FunctionCallOutput,
  CodexItem.CustomToolCall,
  CodexItem.CustomToolCallOutput,
  CodexItem.Reasoning,
  CodexItem.AgentMessage,
  CodexItem.AdditionalTools,
]);
export type CodexItemType = z.infer<typeof CodexItemType>;

export const CodexRole = z.enum([CodexRoleName.User, CodexRoleName.Assistant, CodexRoleName.Developer]);
export type CodexRole = z.infer<typeof CodexRole>;

export const CodexFeature = z.enum([
  CodexFeatureName.MultiAgent,
  CodexFeatureName.Plugins,
  CodexFeatureName.BrowserUse,
  CodexFeatureName.ComputerUse,
  CodexFeatureName.SkillSearch,
  CodexFeatureName.ToolSuggest,
  CodexFeatureName.Hooks,
]);
export type CodexFeature = z.infer<typeof CodexFeature>;
