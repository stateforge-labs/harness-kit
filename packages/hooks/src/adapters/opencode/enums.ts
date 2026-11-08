import { z } from "zod";

export const PermissionEffect = z.enum(["allow"]);

export const PermissionSourceType = z.enum(["tool"]);

export const PromptDelivery = z.enum(["steer"]);

export const ToolStatus = z.enum(["completed"]);

export const InterruptReason = z.enum(["user"]);
