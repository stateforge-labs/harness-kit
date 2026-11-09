import { z } from "zod";
import {
  ClaudeAttachmentType,
  ClaudeBlockType,
  ClaudeOrigin,
  ClaudeQueueOperation,
  ClaudeSubtype,
  ClaudeTaskStatus,
  ClaudeTrigger,
  ClaudeType,
} from "./constants.ts";

export const ClaudeRecordKind = z.enum([
  ClaudeType.User,
  ClaudeType.Assistant,
  ClaudeType.System,
  ClaudeType.AiTitle,
  ClaudeType.LastPrompt,
  ClaudeType.QueueOperation,
  ClaudeType.Attachment,
  ClaudeType.Mode,
  ClaudeType.PermissionMode,
  ClaudeType.AtisLatch,
  ClaudeType.FileHistorySnapshot,
  ClaudeType.ApiRequestBlob,
  ClaudeType.ApiRequest,
  ClaudeType.ApiRequestShape,
  ClaudeType.SessionOwner,
  ClaudeType.ToolsUsed,
  ClaudeType.AgentName,
]);
export type ClaudeRecordKind = z.infer<typeof ClaudeRecordKind>;

export const ClaudeSystemSubtype = z.enum([ClaudeSubtype.CompactBoundary, ClaudeSubtype.AwaySummary, ClaudeSubtype.LocalCommand, ClaudeSubtype.TurnDuration]);
export type ClaudeSystemSubtype = z.infer<typeof ClaudeSystemSubtype>;

export const ClaudeContentKind = z.enum([ClaudeBlockType.Text, ClaudeBlockType.ToolUse, ClaudeBlockType.ToolResult, ClaudeBlockType.Thinking]);
export type ClaudeContentKind = z.infer<typeof ClaudeContentKind>;

export const ClaudeCompactTrigger = z.enum([ClaudeTrigger.Auto, ClaudeTrigger.Manual]);
export type ClaudeCompactTrigger = z.infer<typeof ClaudeCompactTrigger>;

export const ClaudeQueueKind = z.enum([ClaudeQueueOperation.Enqueue, ClaudeQueueOperation.Remove, ClaudeQueueOperation.Dequeue]);
export type ClaudeQueueKind = z.infer<typeof ClaudeQueueKind>;

export const ClaudeAttachmentKind = z.enum([
  ClaudeAttachmentType.QueuedCommand,
  ClaudeAttachmentType.Environment,
  ClaudeAttachmentType.Model,
  ClaudeAttachmentType.OutputStyleInstructions,
  ClaudeAttachmentType.DeferredToolsDelta,
  ClaudeAttachmentType.AgentListingDelta,
  ClaudeAttachmentType.McpInstructionsDelta,
  ClaudeAttachmentType.TotalTokensReminder,
  ClaudeAttachmentType.OutputStyle,
  ClaudeAttachmentType.SessionContext,
  ClaudeAttachmentType.Date,
  ClaudeAttachmentType.CredentialOrg,
  ClaudeAttachmentType.PromptSnapshot,
  ClaudeAttachmentType.DeferredToolsRecord,
  ClaudeAttachmentType.File,
  ClaudeAttachmentType.AutoMode,
  ClaudeAttachmentType.Instructions,
  ClaudeAttachmentType.RemoteSessionChange,
  ClaudeAttachmentType.AdvisorTool,
  ClaudeAttachmentType.ThinkingDrop,
  ClaudeAttachmentType.SilentTurnReminder,
  ClaudeAttachmentType.SkillListing,
]);
export type ClaudeAttachmentKind = z.infer<typeof ClaudeAttachmentKind>;

export const ClaudeOriginKind = z.enum([ClaudeOrigin.Human, ClaudeOrigin.TaskNotification]);
export type ClaudeOriginKind = z.infer<typeof ClaudeOriginKind>;

export const ClaudeTaskState = z.enum([ClaudeTaskStatus.Completed, ClaudeTaskStatus.Failed, ClaudeTaskStatus.Killed, ClaudeTaskStatus.Stopped]);
export type ClaudeTaskState = z.infer<typeof ClaudeTaskState>;
