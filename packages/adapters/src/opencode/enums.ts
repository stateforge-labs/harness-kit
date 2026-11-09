import { z } from "zod";
import { OpenCodeModeName, OpenCodePartType, OpenCodeRoleName, OpenCodeStatus, OpenCodeStreamType } from "./constants.ts";

export const OpenCodePartTypeName = z.enum([
  OpenCodePartType.Text,
  OpenCodePartType.Tool,
  OpenCodePartType.StepStart,
  OpenCodePartType.StepFinish,
  OpenCodePartType.Reasoning,
]);
export type OpenCodePartTypeName = z.infer<typeof OpenCodePartTypeName>;

export const OpenCodePartStatus = z.enum([OpenCodeStatus.Completed, OpenCodeStatus.Error]);
export type OpenCodePartStatus = z.infer<typeof OpenCodePartStatus>;

export const OpenCodeRole = z.enum([OpenCodeRoleName.User, OpenCodeRoleName.Assistant]);
export type OpenCodeRole = z.infer<typeof OpenCodeRole>;

export const OpenCodeMessageMode = z.enum([OpenCodeModeName.Build]);
export type OpenCodeMessageMode = z.infer<typeof OpenCodeMessageMode>;

export const OpenCodeStreamEventType = z.enum([OpenCodeStreamType.StepStart, OpenCodeStreamType.StepFinish, OpenCodeStreamType.Text, OpenCodeStreamType.Error]);
export type OpenCodeStreamEventType = z.infer<typeof OpenCodeStreamEventType>;
