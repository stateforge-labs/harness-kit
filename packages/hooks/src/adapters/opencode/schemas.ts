import type { z } from "zod";
import { OpenCodeHook } from "./names.ts";
import { schema as PermissionEvaluate } from "./events/PermissionEvaluate.ts";
import { schema as SessionCompaction } from "./events/SessionCompaction.ts";
import { schema as SessionCompactionEnded } from "./events/SessionCompactionEnded.ts";
import { schema as SessionCompactionFailed } from "./events/SessionCompactionFailed.ts";
import { schema as SessionCompactionStarted } from "./events/SessionCompactionStarted.ts";
import { schema as SessionContext } from "./events/SessionContext.ts";
import { schema as SessionCreated } from "./events/SessionCreated.ts";
import { schema as SessionExecutionFailed } from "./events/SessionExecutionFailed.ts";
import { schema as SessionExecutionInterrupted } from "./events/SessionExecutionInterrupted.ts";
import { schema as SessionExecutionStarted } from "./events/SessionExecutionStarted.ts";
import { schema as SessionExecutionSucceeded } from "./events/SessionExecutionSucceeded.ts";
import { schema as SessionExperimentalIdle } from "./events/SessionExperimentalIdle.ts";
import { schema as SessionPrompt } from "./events/SessionPrompt.ts";
import { schema as ToolExecuteAfter } from "./events/ToolExecuteAfter.ts";
import { schema as ToolExecuteBefore } from "./events/ToolExecuteBefore.ts";

export const schemas: ReadonlyMap<string, z.ZodType> = new Map<string, z.ZodType>([
  [OpenCodeHook.PermissionEvaluate, PermissionEvaluate],
  [OpenCodeHook.SessionCompaction, SessionCompaction],
  [OpenCodeHook.SessionCompactionEnded, SessionCompactionEnded],
  [OpenCodeHook.SessionCompactionFailed, SessionCompactionFailed],
  [OpenCodeHook.SessionCompactionStarted, SessionCompactionStarted],
  [OpenCodeHook.SessionContext, SessionContext],
  [OpenCodeHook.SessionCreated, SessionCreated],
  [OpenCodeHook.SessionExecutionFailed, SessionExecutionFailed],
  [OpenCodeHook.SessionExecutionInterrupted, SessionExecutionInterrupted],
  [OpenCodeHook.SessionExecutionStarted, SessionExecutionStarted],
  [OpenCodeHook.SessionExecutionSucceeded, SessionExecutionSucceeded],
  [OpenCodeHook.SessionExperimentalIdle, SessionExperimentalIdle],
  [OpenCodeHook.SessionPrompt, SessionPrompt],
  [OpenCodeHook.ToolExecuteAfter, ToolExecuteAfter],
  [OpenCodeHook.ToolExecuteBefore, ToolExecuteBefore],
]);
